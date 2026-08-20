//! Порт app/schemas/safe_json.py. settings и payment_info на User — намеренно
//! "просто JSON без схемы" (структуру задает клиент, не бэкенд), но "без
//! схемы" не значит "без всякой проверки": недорогая защита по трем осям —
//! размер, глубина, "не похоже на код/разметку".

use once_cell::sync::Lazy;
use regex::Regex;
use serde_json::Value;

use crate::error::AppError;

const MAX_DEPTH: usize = 6;
const MAX_KEYS_PER_OBJECT: usize = 100;
const MAX_ITEMS_PER_ARRAY: usize = 500;
const MAX_STRING_LENGTH: usize = 4000;
const MAX_TOTAL_STRINGS: usize = 500;

static DANGEROUS_PATTERNS: Lazy<Vec<Regex>> = Lazy::new(|| {
    vec![
        Regex::new(r"(?i)<\s*script").unwrap(),
        Regex::new(r"(?i)</\s*script").unwrap(),
        Regex::new(r"(?i)javascript\s*:").unwrap(),
        Regex::new(r"(?i)data\s*:\s*text/html").unwrap(),
        Regex::new(r"(?i)on\w+\s*=").unwrap(), // onerror=, onclick=, ...
        Regex::new(r"(?i)<\s*iframe").unwrap(),
        Regex::new(r"(?i)<\s*svg").unwrap(),
    ]
});

fn check_string(value: &str, string_counter: &mut usize) -> Result<(), AppError> {
    if value.chars().count() > MAX_STRING_LENGTH {
        return Err(AppError::InvalidArgument(format!(
            "Строковое значение длиннее {MAX_STRING_LENGTH} символов"
        )));
    }
    *string_counter += 1;
    if *string_counter > MAX_TOTAL_STRINGS {
        return Err(AppError::InvalidArgument(
            "Слишком много строковых значений в объекте".to_string(),
        ));
    }
    for pattern in DANGEROUS_PATTERNS.iter() {
        if pattern.is_match(value) {
            return Err(AppError::InvalidArgument(
                "Значение похоже на код/разметку, а не на настройку".to_string(),
            ));
        }
    }
    Ok(())
}

fn walk(value: &Value, depth: usize, string_counter: &mut usize) -> Result<(), AppError> {
    if depth > MAX_DEPTH {
        return Err(AppError::InvalidArgument(format!(
            "Слишком глубокая вложенность (максимум {MAX_DEPTH})"
        )));
    }
    match value {
        Value::Object(map) => {
            if map.len() > MAX_KEYS_PER_OBJECT {
                return Err(AppError::InvalidArgument(format!(
                    "Слишком много ключей в объекте (максимум {MAX_KEYS_PER_OBJECT})"
                )));
            }
            for (key, item) in map {
                check_string(key, string_counter)?;
                walk(item, depth + 1, string_counter)?;
            }
        }
        Value::Array(items) => {
            if items.len() > MAX_ITEMS_PER_ARRAY {
                return Err(AppError::InvalidArgument(format!(
                    "Слишком длинный массив (максимум {MAX_ITEMS_PER_ARRAY})"
                )));
            }
            for item in items {
                walk(item, depth + 1, string_counter)?;
            }
        }
        Value::String(s) => check_string(s, string_counter)?,
        Value::Number(_) | Value::Bool(_) | Value::Null => {}
    }
    Ok(())
}

/// Валидирует, что value — безопасный JSON-объект для хранения в settings /
/// payment_info. Возвращает ошибку InvalidArgument, если нет.
pub fn validate_safe_json(value: &Value) -> Result<(), AppError> {
    if !value.is_object() {
        return Err(AppError::InvalidArgument("Ожидался JSON-объект".to_string()));
    }
    let mut counter = 0usize;
    walk(value, 0, &mut counter)
}
