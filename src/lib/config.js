/**
 * ЕДИНСТВЕННОЕ место с адресом backend'а. Перенесено из src-legacy/js/config.js
 * без изменений — см. пояснения там же про CORS_ORIGINS на сервере.
 */
export const SERVER_BASE_URL = "http://leased-line-gomel-91-149-169-88.telecom.by:8000";

/** Таймаут одного запроса к серверу, мс. */
export const REQUEST_TIMEOUT_MS = 15000;

/** Таймаут для запросов с фото профиля — самое тяжёлое тело во всём
 * приложении (обычно 30-150 КБ после сжатия, GIF — до ~2 МБ, см.
 * ProfileScreen.svelte MAX_PHOTO_DATA_URL_LENGTH). На небыстром канале
 * дефолтных 15 секунд не всегда хватает. */
export const PHOTO_UPLOAD_TIMEOUT_MS = 45000;

/** Как часто опрашивать GET /health для индикатора связи. */
export const HEALTHCHECK_POLL_MS = 120000;
