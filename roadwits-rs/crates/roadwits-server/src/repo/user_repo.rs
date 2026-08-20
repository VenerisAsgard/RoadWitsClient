use chrono::{Duration, Utc};
use sqlx::PgPool;

use crate::db::models::{UserRow, UserType};
use crate::error::AppResult;
use crate::security::product_key::generate_product_key;

pub async fn get_by_id(pool: &PgPool, user_id: i64) -> AppResult<Option<UserRow>> {
    let row = sqlx::query_as!(
        UserRow,
        r#"
        SELECT id, product_key, email, first_name, last_name, license_until,
               user_type as "user_type: UserType", is_blocked, profile_photo,
               settings as "settings: sqlx::types::Json<serde_json::Value>",
               payment_info as "payment_info: sqlx::types::Json<serde_json::Value>",
               max_devices
        FROM users WHERE id = $1
        "#,
        user_id
    )
    .fetch_optional(pool)
    .await?;
    Ok(row)
}

pub async fn get_by_product_key(pool: &PgPool, product_key: &str) -> AppResult<Option<UserRow>> {
    let row = sqlx::query_as!(
        UserRow,
        r#"
        SELECT id, product_key, email, first_name, last_name, license_until,
               user_type as "user_type: UserType", is_blocked, profile_photo,
               settings as "settings: sqlx::types::Json<serde_json::Value>",
               payment_info as "payment_info: sqlx::types::Json<serde_json::Value>",
               max_devices
        FROM users WHERE product_key = $1
        "#,
        product_key
    )
    .fetch_optional(pool)
    .await?;
    Ok(row)
}

pub async fn get_by_email(pool: &PgPool, email: &str) -> AppResult<Option<UserRow>> {
    // email не имеет уникального ограничения в БД — при дубликате берем
    // первого (ORDER BY id), не падаем (см. оригинал: .scalars().first()).
    let row = sqlx::query_as!(
        UserRow,
        r#"
        SELECT id, product_key, email, first_name, last_name, license_until,
               user_type as "user_type: UserType", is_blocked, profile_photo,
               settings as "settings: sqlx::types::Json<serde_json::Value>",
               payment_info as "payment_info: sqlx::types::Json<serde_json::Value>",
               max_devices
        FROM users WHERE email = $1 ORDER BY id LIMIT 1
        "#,
        email
    )
    .fetch_optional(pool)
    .await?;
    Ok(row)
}

#[allow(clippy::too_many_arguments)]
pub async fn create(
    pool: &PgPool,
    license_days: i32,
    email: Option<&str>,
    first_name: Option<&str>,
    last_name: Option<&str>,
    user_type: UserType,
    payment_info: serde_json::Value,
    max_devices: i32,
) -> AppResult<UserRow> {
    // Коллизии почти невозможны при 24-символьном ключе, но раз уж проверка
    // дешевая — подстрахуемся, как и в оригинале.
    let mut product_key = generate_product_key();
    while get_by_product_key(pool, &product_key).await?.is_some() {
        product_key = generate_product_key();
    }

    let license_until = Utc::now() + Duration::days(license_days as i64);

    let row = sqlx::query_as!(
        UserRow,
        r#"
        INSERT INTO users (product_key, email, first_name, last_name, license_until,
                            user_type, payment_info, max_devices)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING id, product_key, email, first_name, last_name, license_until,
                  user_type as "user_type: UserType", is_blocked, profile_photo,
                  settings as "settings: sqlx::types::Json<serde_json::Value>",
                  payment_info as "payment_info: sqlx::types::Json<serde_json::Value>",
                  max_devices
        "#,
        product_key,
        email,
        first_name,
        last_name,
        license_until,
        user_type as UserType,
        sqlx::types::Json(payment_info) as _,
        max_devices,
    )
    .fetch_one(pool)
    .await?;
    Ok(row)
}

pub async fn add_device(pool: &PgPool, user_id: i64, device_id: i64) -> AppResult<()> {
    sqlx::query!(
        r#"INSERT INTO user_devices (user_id, device_id) VALUES ($1, $2)
           ON CONFLICT (user_id, device_id) DO NOTHING"#,
        user_id,
        device_id
    )
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn reset_devices(pool: &PgPool, user_id: i64) -> AppResult<()> {
    sqlx::query!("DELETE FROM user_devices WHERE user_id = $1", user_id)
        .execute(pool)
        .await?;
    Ok(())
}

pub async fn extend_license(pool: &PgPool, user_id: i64, extra_days: i32) -> AppResult<UserRow> {
    // Если срок уже истек — считаем от текущего момента, а не от старой даты.
    let row = sqlx::query_as!(
        UserRow,
        r#"
        UPDATE users
        SET license_until = GREATEST(license_until, now()) + make_interval(days => $2)
        WHERE id = $1
        RETURNING id, product_key, email, first_name, last_name, license_until,
                  user_type as "user_type: UserType", is_blocked, profile_photo,
                  settings as "settings: sqlx::types::Json<serde_json::Value>",
                  payment_info as "payment_info: sqlx::types::Json<serde_json::Value>",
                  max_devices
        "#,
        user_id,
        extra_days,
    )
    .fetch_one(pool)
    .await?;
    Ok(row)
}

pub async fn set_blocked(pool: &PgPool, user_id: i64, is_blocked: bool) -> AppResult<UserRow> {
    let row = sqlx::query_as!(
        UserRow,
        r#"
        UPDATE users SET is_blocked = $2 WHERE id = $1
        RETURNING id, product_key, email, first_name, last_name, license_until,
                  user_type as "user_type: UserType", is_blocked, profile_photo,
                  settings as "settings: sqlx::types::Json<serde_json::Value>",
                  payment_info as "payment_info: sqlx::types::Json<serde_json::Value>",
                  max_devices
        "#,
        user_id,
        is_blocked,
    )
    .fetch_one(pool)
    .await?;
    Ok(row)
}

pub async fn update_settings(
    pool: &PgPool,
    user_id: i64,
    settings: serde_json::Value,
) -> AppResult<UserRow> {
    let row = sqlx::query_as!(
        UserRow,
        r#"
        UPDATE users SET settings = $2 WHERE id = $1
        RETURNING id, product_key, email, first_name, last_name, license_until,
                  user_type as "user_type: UserType", is_blocked, profile_photo,
                  settings as "settings: sqlx::types::Json<serde_json::Value>",
                  payment_info as "payment_info: sqlx::types::Json<serde_json::Value>",
                  max_devices
        "#,
        user_id,
        sqlx::types::Json(settings) as _,
    )
    .fetch_one(pool)
    .await?;
    Ok(row)
}

#[allow(clippy::too_many_arguments)]
pub async fn update_profile(
    pool: &PgPool,
    user_id: i64,
    first_name: Option<&str>,
    last_name: Option<&str>,
    email: Option<&str>,
    profile_photo: Option<&str>,
    photo_provided: bool,
) -> AppResult<UserRow> {
    // photo_provided различает "клиент явно прислал пусто, значит убрать
    // фото" от "клиент вообще не прислал это поле, значит фото трогать не
    // нужно" — так же, как в оригинале (photo_provided из model_fields_set).
    let row = if photo_provided {
        sqlx::query_as!(
            UserRow,
            r#"
            UPDATE users SET first_name = $2, last_name = $3, email = $4, profile_photo = $5
            WHERE id = $1
            RETURNING id, product_key, email, first_name, last_name, license_until,
                      user_type as "user_type: UserType", is_blocked, profile_photo,
                      settings as "settings: sqlx::types::Json<serde_json::Value>",
                      payment_info as "payment_info: sqlx::types::Json<serde_json::Value>",
                      max_devices
            "#,
            user_id,
            first_name,
            last_name,
            email,
            profile_photo,
        )
        .fetch_one(pool)
        .await?
    } else {
        sqlx::query_as!(
            UserRow,
            r#"
            UPDATE users SET first_name = $2, last_name = $3, email = $4
            WHERE id = $1
            RETURNING id, product_key, email, first_name, last_name, license_until,
                      user_type as "user_type: UserType", is_blocked, profile_photo,
                      settings as "settings: sqlx::types::Json<serde_json::Value>",
                      payment_info as "payment_info: sqlx::types::Json<serde_json::Value>",
                      max_devices
            "#,
            user_id,
            first_name,
            last_name,
            email,
        )
        .fetch_one(pool)
        .await?
    };
    Ok(row)
}

pub async fn delete(pool: &PgPool, user_id: i64) -> AppResult<()> {
    sqlx::query!("DELETE FROM users WHERE id = $1", user_id)
        .execute(pool)
        .await?;
    Ok(())
}

pub async fn list_all(pool: &PgPool) -> AppResult<Vec<UserRow>> {
    let rows = sqlx::query_as!(
        UserRow,
        r#"
        SELECT id, product_key, email, first_name, last_name, license_until,
               user_type as "user_type: UserType", is_blocked, profile_photo,
               settings as "settings: sqlx::types::Json<serde_json::Value>",
               payment_info as "payment_info: sqlx::types::Json<serde_json::Value>",
               max_devices
        FROM users ORDER BY id
        "#
    )
    .fetch_all(pool)
    .await?;
    Ok(rows)
}

/// Устройства, привязанные к лицензии — для find_user_device/has_free_slot/
/// device_count (см. device_service).
pub async fn list_device_ids(pool: &PgPool, user_id: i64) -> AppResult<Vec<i64>> {
    let ids = sqlx::query_scalar!(
        "SELECT device_id FROM user_devices WHERE user_id = $1",
        user_id
    )
    .fetch_all(pool)
    .await?;
    Ok(ids)
}

pub async fn device_count(pool: &PgPool, user_id: i64) -> AppResult<i64> {
    let count = sqlx::query_scalar!(
        "SELECT COUNT(*) as \"count!\" FROM user_devices WHERE user_id = $1",
        user_id
    )
    .fetch_one(pool)
    .await?;
    Ok(count)
}

/// Проверить, что среди устройств лицензии уже есть одно с данным fingerprint.
pub async fn find_device_by_fingerprint(
    pool: &PgPool,
    user_id: i64,
    fingerprint: &str,
) -> AppResult<Option<i64>> {
    let id = sqlx::query_scalar!(
        r#"
        SELECT d.id FROM devices d
        JOIN user_devices ud ON ud.device_id = d.id
        WHERE ud.user_id = $1 AND d.fingerprint = $2
        "#,
        user_id,
        fingerprint
    )
    .fetch_optional(pool)
    .await?;
    Ok(id)
}
