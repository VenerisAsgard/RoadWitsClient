/**
 * Адрес backend'а и таймауты отдельных запросов раньше жили здесь
 * (SERVER_BASE_URL, REQUEST_TIMEOUT_MS и т.д.) — теперь всё общение с
 * сервером переехало в Rust (gRPC-клиент, см. src-tauri/src/grpc/mod.rs),
 * и единственное место, которое нужно менять под другой backend —
 * `SERVER_ADDR` там, а не здесь.
 */

/** Как часто опрашивать health-check для индикатора связи (см. connection.js). */
export const HEALTHCHECK_POLL_MS = 120000;
