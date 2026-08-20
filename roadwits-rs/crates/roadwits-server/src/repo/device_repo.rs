use sqlx::PgPool;

use crate::db::models::DeviceRow;
use crate::error::AppResult;

pub async fn get_by_fingerprint(pool: &PgPool, fingerprint: &str) -> AppResult<Option<DeviceRow>> {
    let row = sqlx::query_as!(
        DeviceRow,
        r#"SELECT id, fingerprint, name, created_at, last_seen FROM devices WHERE fingerprint = $1"#,
        fingerprint
    )
    .fetch_optional(pool)
    .await?;
    Ok(row)
}

pub async fn create(pool: &PgPool, fingerprint: &str) -> AppResult<DeviceRow> {
    let row = sqlx::query_as!(
        DeviceRow,
        r#"INSERT INTO devices (fingerprint, last_seen) VALUES ($1, now())
           RETURNING id, fingerprint, name, created_at, last_seen"#,
        fingerprint
    )
    .fetch_one(pool)
    .await?;
    Ok(row)
}

/// Обновляет last_seen — вызывается при каждом успешном логине с этого устройства.
pub async fn touch(pool: &PgPool, device_id: i64) -> AppResult<()> {
    sqlx::query!("UPDATE devices SET last_seen = now() WHERE id = $1", device_id)
        .execute(pool)
        .await?;
    Ok(())
}

/// Ищет устройство по fingerprint, переиспользуя существующую строку (может
/// быть общей для нескольких лицензий), либо создает новую — как
/// get_or_create_device в оригинале.
pub async fn get_or_create(pool: &PgPool, fingerprint: &str) -> AppResult<DeviceRow> {
    match get_by_fingerprint(pool, fingerprint).await? {
        Some(device) => {
            touch(pool, device.id).await?;
            Ok(device)
        }
        None => create(pool, fingerprint).await,
    }
}
