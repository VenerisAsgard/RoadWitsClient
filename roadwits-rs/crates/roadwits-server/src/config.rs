use std::env;

/// Централизованная конфигурация — аналог app/core/config.py (Settings).
/// Значения читаются из переменных окружения / .env файла.
#[derive(Debug, Clone)]
pub struct Config {
    pub database_url: String,
    pub jwt_secret: String,
    pub jwt_expire_minutes: i64,
    pub grpc_addr: String,
    pub app_name: String,
}

impl Config {
    pub fn from_env() -> Self {
        // .env — необязателен (в проде переменные обычно приходят из окружения
        // напрямую), поэтому ошибку загрузки файла молча игнорируем.
        let _ = dotenvy::dotenv();

        Self {
            database_url: env::var("DATABASE_URL")
                .unwrap_or_else(|_| "postgres://roadwits:roadwits@db:5432/roadwits".to_string()),
            jwt_secret: env::var("JWT_SECRET_KEY")
                .unwrap_or_else(|_| "CHANGE_ME_IN_PRODUCTION".to_string()),
            jwt_expire_minutes: env::var("JWT_EXPIRE_MINUTES")
                .ok()
                .and_then(|v| v.parse().ok())
                .unwrap_or(60 * 24 * 7), // 7 дней, как в оригинале
            grpc_addr: env::var("GRPC_ADDR").unwrap_or_else(|_| "0.0.0.0:50051".to_string()),
            app_name: env::var("APP_NAME").unwrap_or_else(|_| "Roadwits".to_string()),
        }
    }
}
