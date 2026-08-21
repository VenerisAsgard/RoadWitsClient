//! Ошибки gRPC (`tonic::Status`) → формат, понятный фронтенду.
//!
//! Раньше `ApiError` на фронтенде (см. src/lib/api/api.js) хранила
//! HTTP-статус и текст (`detail`); часть логики приложения (auth.js
//! tryAutoLogin — офлайн-режим на кэше, api.js updateProfile — сверка после
//! таймаута) явно проверяет `err.status === 0`, то есть "не дождались
//! ответа сервера", в отличие от "сервер ответил отказом". Здесь та же
//! идея: команды Tauri возвращают `Err(String)`, где строка — JSON вида
//! `{"status": <число>, "message": <текст>}`; фронтенд (см. новую версию
//! api.js) разбирает её обратно в `ApiError`, чтобы остальной код
//! (admin.js/quiz.js/auth.js), который уже умеет работать с ApiError, не
//! пришлось переписывать.
use tonic::Code;

pub fn status_to_js(status: tonic::Status) -> String {
    let code = match status.code() {
        Code::NotFound => 404,
        Code::PermissionDenied => 403,
        Code::InvalidArgument | Code::FailedPrecondition | Code::OutOfRange => 400,
        Code::Unauthenticated => 401,
        Code::AlreadyExists => 409,
        // Сервер недоступен/не успел ответить/запрос отменён — то же самое,
        // что раньше означал status === 0 у AbortError/сетевой ошибки fetch.
        Code::Unavailable | Code::DeadlineExceeded | Code::Cancelled | Code::Unknown => 0,
        _ => 500,
    };
    let message = if status.message().trim().is_empty() {
        default_message(code)
    } else {
        status.message().to_string()
    };
    serde_json::json!({ "status": code, "message": message }).to_string()
}

fn default_message(code: i32) -> String {
    match code {
        0 => "Сервер не отвечает",
        401 => "Требуется вход в аккаунт",
        403 => "Недостаточно прав",
        404 => "Не найдено",
        _ => "Ошибка сервера",
    }
    .to_string()
}

/// Ошибка на этапе построения запроса (например, невалидные символы в
/// токене) — до собственно сетевого вызова.
pub fn bad_request_to_js(message: impl Into<String>) -> String {
    serde_json::json!({ "status": 400, "message": message.into() }).to_string()
}
