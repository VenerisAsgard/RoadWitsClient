use chrono::{Duration, Utc};
use jsonwebtoken::{decode, encode, DecodingKey, EncodingKey, Header, Validation};
use serde::{Deserialize, Serialize};

/// Payload JWT — минимальный набор данных: sub (user id), device (fingerprint), exp.
/// Никаких email, никаких лишних полей внутри токена (см. app/core/security.py).
#[derive(Debug, Serialize, Deserialize)]
pub struct Claims {
    pub sub: String,
    pub device: String,
    pub exp: i64,
}

pub fn create_access_token(secret: &str, sub: &str, device: &str, expire_minutes: i64) -> String {
    let expire_at = Utc::now() + Duration::minutes(expire_minutes);
    let claims = Claims {
        sub: sub.to_string(),
        device: device.to_string(),
        exp: expire_at.timestamp(),
    };
    // encode() с валидными данными (String secret, стандартный HS256) не может
    // упасть — unwrap() тут не хуже, чем .encode(...) без обработки ошибок в
    // оригинале на python-jose.
    encode(
        &Header::default(),
        &claims,
        &EncodingKey::from_secret(secret.as_bytes()),
    )
    .expect("jwt encode")
}

/// Декодирует и валидирует JWT. None — если токен невалиден/истек, ровно как
/// decode_access_token в оригинале (детали ошибки на этом уровне не нужны,
/// AuthContext сам превращает None в AppError::InvalidToken).
pub fn decode_access_token(secret: &str, token: &str) -> Option<Claims> {
    decode::<Claims>(
        token,
        &DecodingKey::from_secret(secret.as_bytes()),
        &Validation::default(),
    )
    .ok()
    .map(|data| data.claims)
}
