/**
 * ЕДИНСТВЕННОЕ место с адресом backend'а. Перенесено из src-legacy/js/config.js
 * без изменений — см. пояснения там же про CORS_ORIGINS на сервере.
 */
export const SERVER_BASE_URL = "http://leased-line-gomel-91-149-169-88.telecom.by:8000";

/** Таймаут одного запроса к серверу, мс. */
export const REQUEST_TIMEOUT_MS = 15000;

/** Как часто опрашивать GET /health для индикатора связи. */
export const HEALTHCHECK_POLL_MS = 120000;
