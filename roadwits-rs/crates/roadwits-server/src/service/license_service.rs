use sqlx::PgPool;

use crate::db::models::{UserRow, UserType};
use crate::error::AppResult;
use crate::repo::user_repo;

#[allow(clippy::too_many_arguments)]
pub async fn create_license(
    pool: &PgPool,
    license_days: i32,
    email: Option<&str>,
    first_name: Option<&str>,
    last_name: Option<&str>,
    user_type: UserType,
    payment_info: serde_json::Value,
    max_devices: i32,
) -> AppResult<UserRow> {
    user_repo::create(
        pool,
        license_days,
        email,
        first_name,
        last_name,
        user_type,
        payment_info,
        max_devices,
    )
    .await
}

pub async fn extend_license(pool: &PgPool, user_id: i64, extra_days: i32) -> AppResult<UserRow> {
    user_repo::extend_license(pool, user_id, extra_days).await
}

pub async fn block_license(pool: &PgPool, user_id: i64) -> AppResult<UserRow> {
    user_repo::set_blocked(pool, user_id, true).await
}

pub async fn unblock_license(pool: &PgPool, user_id: i64) -> AppResult<UserRow> {
    user_repo::set_blocked(pool, user_id, false).await
}

/// Отвязывает лицензию от ВСЕХ её текущих устройств — нужен, когда человек
/// сменил компьютер и уперся в лимит max_devices.
pub async fn reset_device(pool: &PgPool, user_id: i64) -> AppResult<UserRow> {
    user_repo::reset_devices(pool, user_id).await?;
    Ok(user_repo::get_by_id(pool, user_id)
        .await?
        .expect("user exists"))
}

/// Необратимо удаляет лицензию/пользователя. Заявки в друзья удаляются
/// каскадом (ON DELETE CASCADE), устройства просто отвязываются, созданные
/// им главы/вопросы остаются, но created_by_id становится NULL
/// (ON DELETE SET NULL — см. миграцию).
pub async fn delete_license(pool: &PgPool, user_id: i64) -> AppResult<()> {
    user_repo::delete(pool, user_id).await
}

pub async fn list_licenses(pool: &PgPool) -> AppResult<Vec<UserRow>> {
    user_repo::list_all(pool).await
}

pub async fn get_license(pool: &PgPool, user_id: i64) -> AppResult<Option<UserRow>> {
    user_repo::get_by_id(pool, user_id).await
}
