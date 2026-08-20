use sqlx::PgPool;

use crate::db::models::DeviceRow;
use crate::error::AppResult;
use crate::repo::{device_repo, user_repo};

/// Абсолютный потолок для User.max_devices — даже если кто-то передаст в API
/// больше, обработчик обрежет до этого значения (см. app/services/device_service.py).
pub const MAX_DEVICES_LIMIT: i32 = 3;

pub async fn get_or_create_device(pool: &PgPool, fingerprint: &str) -> AppResult<DeviceRow> {
    device_repo::get_or_create(pool, fingerprint).await
}

/// Есть ли среди уже привязанных к лицензии устройств одно с этим fingerprint.
pub async fn find_user_device(
    pool: &PgPool,
    user_id: i64,
    fingerprint: &str,
) -> AppResult<Option<i64>> {
    user_repo::find_device_by_fingerprint(pool, user_id, fingerprint).await
}

/// max_devices — то, что разрешил админ конкретной лицензии (1..3), а не
/// глобальная константа.
pub async fn has_free_slot(pool: &PgPool, user_id: i64, max_devices: i32) -> AppResult<bool> {
    let count = user_repo::device_count(pool, user_id).await?;
    Ok(count < max_devices as i64)
}
