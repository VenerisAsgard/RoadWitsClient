use chrono::Utc;
use sqlx::PgPool;

use crate::config::Config;
use crate::db::models::UserRow;
use crate::error::{AppError, AppResult};
use crate::repo::{device_repo, user_repo};
use crate::security::jwt;
use crate::service::device_service;

/// Сценарий входа. Порядок проверок важен — каждая следующая проверка
/// предполагает, что предыдущие уже пройдены (см. auth_service.login в оригинале):
/// 1. Лицензия с таким product_key вообще существует.
/// 2. Она не заблокирована админом.
/// 3. Она не истекла по сроку.
/// 4. Устройство — среди уже привязанных, привязываем новое (если есть
///    свободный слот), либо отказываем.
pub async fn login(
    pool: &PgPool,
    cfg: &Config,
    product_key: &str,
    fingerprint: &str,
) -> AppResult<String> {
    let user = user_repo::get_by_product_key(pool, product_key)
        .await?
        .ok_or(AppError::InvalidProductKey)?;

    if user.is_blocked {
        return Err(AppError::LicenseBlocked);
    }
    if user.license_until < Utc::now() {
        return Err(AppError::LicenseExpired);
    }

    match device_service::find_user_device(pool, user.id, fingerprint).await? {
        Some(device_id) => {
            // Это устройство уже привязано к лицензии — обычный повторный вход.
            device_repo::touch(pool, device_id).await?;
        }
        None => {
            if device_service::has_free_slot(pool, user.id, user.max_devices).await? {
                let device = device_service::get_or_create_device(pool, fingerprint).await?;
                user_repo::add_device(pool, user.id, device.id).await?;
            } else {
                // Слотов не осталось — нужен reset_device от админа.
                return Err(AppError::DeviceLimitReached(user.max_devices));
            }
        }
    }

    Ok(jwt::create_access_token(
        &cfg.jwt_secret,
        &user.id.to_string(),
        fingerprint,
        cfg.jwt_expire_minutes,
    ))
}

/// Проверка токена на каждый защищенный запрос. Более строгая, чем просто
/// "подпись JWT валидна":
/// - лицензия могла быть заблокирована ПОСЛЕ выдачи токена;
/// - fingerprint из токена сверяется с тем, что реально привязано в БД —
///   если админ сделал reset_device, старые токены сразу перестают работать,
///   даже если срок жизни JWT ещё не истёк.
pub async fn get_current_user(pool: &PgPool, cfg: &Config, token: &str) -> AppResult<UserRow> {
    let claims = jwt::decode_access_token(&cfg.jwt_secret, token).ok_or(AppError::InvalidToken)?;

    let user_id: i64 = claims.sub.parse().map_err(|_| AppError::InvalidToken)?;

    let user = user_repo::get_by_id(pool, user_id)
        .await?
        .ok_or(AppError::InvalidToken)?;

    if user.is_blocked {
        return Err(AppError::InvalidToken);
    }

    if device_service::find_user_device(pool, user.id, &claims.device)
        .await?
        .is_none()
    {
        return Err(AppError::InvalidToken);
    }

    Ok(user)
}
