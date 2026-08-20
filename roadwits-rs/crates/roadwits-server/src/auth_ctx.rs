//! Аналог app/core/deps.py: извлечение текущего пользователя из gRPC-запроса
//! и ролевые проверки. В gRPC нет Depends() — вместо "лесенки" зависимостей
//! каждый обработчик явно вызывает current_user(...)/require_admin(...) в
//! начале метода, но идея та же: одна и та же проверка не размазана по коду.

use sqlx::PgPool;
use tonic::Request;

use crate::config::Config;
use crate::db::models::{UserRow, UserType};
use crate::error::{AppError, AppResult};
use crate::service::auth_service;

/// Достает токен из metadata "authorization: Bearer <token>" — аналог
/// HTTPBearer в оригинале.
fn extract_bearer<T>(req: &Request<T>) -> AppResult<&str> {
    let raw = req
        .metadata()
        .get("authorization")
        .ok_or(AppError::InvalidToken)?
        .to_str()
        .map_err(|_| AppError::InvalidToken)?;
    raw.strip_prefix("Bearer ")
        .or_else(|| raw.strip_prefix("bearer "))
        .ok_or(AppError::InvalidToken)
}

/// Базовая проверка: "токен валиден -> вот пользователь" (get_current_user в оригинале).
pub async fn current_user<T>(req: &Request<T>, pool: &PgPool, cfg: &Config) -> AppResult<UserRow> {
    let token = extract_bearer(req)?;
    auth_service::get_current_user(pool, cfg, token).await
}

/// Для методов, доступных ТОЛЬКО админу.
pub fn require_admin(user: &UserRow) -> AppResult<()> {
    if user.user_type != UserType::Admin {
        return Err(AppError::AdminOnly);
    }
    Ok(())
}

/// Для методов управления контентом (главы/задания) — editor и admin.
pub fn require_editor_or_admin(user: &UserRow) -> AppResult<()> {
    if user.user_type != UserType::Admin && user.user_type != UserType::Editor {
        return Err(AppError::EditorOrAdminOnly);
    }
    Ok(())
}
