/**
 * Всё общение с backend'ом (roadwits-server) — в этом файле и только в нём.
 * Остальной код (quiz.js, auth.js, render.js) не знает про fetch, про формат
 * JSON конкретных эндпоинтов бэкенда и т.п. — он работает с уже нормализованными
 * объектами (см. normalizeChapter/normalizeQuestion ниже).
 *
 * Адрес сервера и таймаут запроса вынесены в js/config.js — там единственное
 * место, которое нужно менять под другой backend (прод/стейджинг/свой порт).
 */
import { SERVER_BASE_URL, REQUEST_TIMEOUT_MS, PHOTO_UPLOAD_TIMEOUT_MS, QUESTIONS_FETCH_TIMEOUT_MS } from "../config.js";

const API_BASE_URL = SERVER_BASE_URL;

export async function health() {
  const res = await fetch(`${API_BASE_URL}/health`);
  if (!res.ok) throw new ApiError(res.status, "Сервер недоступен");
  return res.json();
}

export function updateSettings(token, settings) {
  return request("/auth/me/settings", { method: "PATCH", token, body: { settings } });
}

export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// FastAPI при ошибке валидации кладет в detail список объектов {loc, msg, type}
// вместо строки. Бэкенд теперь сам приводит это к строке (см. main.py
// readable_validation_error), но на случай сетевой ошибки, старого бэкенда без
// этого хендлера или detail неожиданной формы — клиент тоже не должен упасть
// в "[object Object]": здесь разбираем ЛЮБУЮ форму detail в читаемый текст.
function readableDetail(detail, fallback) {
  if (typeof detail === "string" && detail.trim()) return detail;
  if (Array.isArray(detail)) {
    const parts = detail
      .map((item) => (item && typeof item === "object" ? item.msg : item))
      .filter((msg) => typeof msg === "string" && msg.trim());
    if (parts.length) return parts.join("; ");
  }
  if (detail && typeof detail === "object" && typeof detail.msg === "string") return detail.msg;
  return fallback;
}

/**
 * @param {string} path
 * @param {{method?: string, body?: any, token?: string|null, timeoutMs?: number}} [options]
 */
async function request(path, { method = "GET", body, token, timeoutMs = REQUEST_TIMEOUT_MS } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);

  let res;
  try {
    res = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
  } catch (err) {
    // Сетевая ошибка (сервер не запущен, неверный адрес в config.js, CORS
    // заблокировал запрос) или обрыв по таймауту — в обоих случаях fetch
    // бросает TypeError/AbortError без осмысленного текста для пользователя.
    // Раньше "это наш таймаут" определялось только по err.name === "AbortError" —
    // так помечает abort() большинство движков, но не гарантированно все
    // (в вебвью Tauri на некоторых платформах/версиях исключение при отмене
    // по сигналу может прийти с другим name). Из-за этого самый тяжёлый
    // запрос в приложении — PATCH /auth/me/profile с фото (см.
    // PHOTO_UPLOAD_TIMEOUT_MS) — на медленном канале иногда упирался в
    // именно НАШ таймаут, но пользователю ошибочно показывалось "нет
    // соединения с сервером", хотя соединение было — сервер просто не
    // успевал ответить за отведённое время. controller.signal.aborted —
    // надёжный признак того, что сработал именно наш abort(), независимо
    // от того, как конкретный движок называет итоговое исключение.
    const timedOut = err?.name === "AbortError" || controller.signal.aborted;
    throw new ApiError(0, timedOut ? "Сервер не отвечает" : "Нет соединения с сервером");
  } finally {
    window.clearTimeout(timeoutId);
  }

  if (!res.ok) {
    let detail = res.statusText;
    try {
      const data = await res.json();
      detail = readableDetail(data.detail, detail);
    } catch {
      // ответ не JSON — оставляем statusText
    }
    throw new ApiError(res.status, detail);
  }

  if (res.status === 204) return undefined;
  return res.json();
}

/**
 * Как request(), но читает тело ответа потоково и репортит прогресс по мере
 * того, как в потоке появляются ЦЕЛИКОМ пришедшие вопросы — используется
 * только для GET .../questions (см. listQuestions), у которого тело может
 * весить мегабайты (все фото главы разом). Раньше прогресс кэширования
 * (см. questions.js refreshAllCache) мог сдвинуться только ПОСЛЕ того, как
 * придёт всё тело целиком — глава из полусотни вопросов "зависала" на месте
 * до последнего байта, а потом сразу вся засчитывалась разом.
 *
 * onProgress(questionsSoFar) — эвристика: у каждого QuestionOut с бэкенда
 * ровно одно поле "created_by_email" на верхнем уровне объекта (см. карту
 * API в ai_work.md), а у вложенных answers[] такого поля нет — поэтому
 * подсчёт вхождений этой подстроки в уже накопленном тексте ответа надёжно
 * говорит, сколько вопросов уже полностью доехало, без разбора JSON на
 * каждый чанк (разбираем целиком только один раз, в конце).
 *
 * Если окружение не даёт читать тело потоково (res.body/getReader
 * недоступны — бывает у некоторых WebView), тихо откатывается на обычное
 * ожидание всего ответа: запрос всё равно проходит, просто без дробного
 * прогресса по вопросам.
 * @param {string} path
 * @param {{token?: string|null, timeoutMs?: number, onProgress?: (n: number) => void}} [options]
 */
async function requestQuestionsWithProgress(path, { token, timeoutMs = REQUEST_TIMEOUT_MS, onProgress } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    let res;
    try {
      res = await fetch(`${API_BASE_URL}${path}`, { method: "GET", headers, signal: controller.signal });
    } catch (err) {
      const timedOut = err?.name === "AbortError" || controller.signal.aborted;
      throw new ApiError(0, timedOut ? "Сервер не отвечает" : "Нет соединения с сервером");
    }

    if (!res.ok) {
      let detail = res.statusText;
      try {
        const data = await res.json();
        detail = readableDetail(data.detail, detail);
      } catch {
        // ответ не JSON — оставляем statusText
      }
      throw new ApiError(res.status, detail);
    }

    if (!res.body || !res.body.getReader) return await res.json();

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let text = "";
    let counted = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        text += decoder.decode(value, { stream: true });
        if (onProgress) {
          const next = (text.match(/"created_by_email"\s*:/g) || []).length;
          if (next > counted) {
            counted = next;
            onProgress(counted);
          }
        }
      }
    } catch (err) {
      const timedOut = err?.name === "AbortError" || controller.signal.aborted;
      throw new ApiError(0, timedOut ? "Сервер не отвечает" : "Нет соединения с сервером");
    }
    return JSON.parse(text);
  } finally {
    window.clearTimeout(timeoutId);
  }
}

/**
 * PATCH /auth/me/profile через XMLHttpRequest, а не через общий request() —
 * только у XHR есть событие upload.onprogress, дающее РЕАЛЬНЫЙ процент
 * отправки тела на медленном канале (см. SERVER_BASE_URL — арендованная
 * линия). Нужен именно для фото: это единственный запрос в приложении, чьё
 * тело может заметно долго отправляться (десятки–сотни КБ, см.
 * ProfileScreen.svelte) — раньше на всё это время пользователь видел просто
 * крутилку "Загрузка…", неотличимую от настоящего зависания.
 * @param {{timeoutMs: number, onUploadProgress?: (fraction: number) => void}} options
 */
function patchProfileWithProgress(token, body, { timeoutMs, onUploadProgress }) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PATCH", `${API_BASE_URL}/auth/me/profile`);
    xhr.timeout = timeoutMs;
    xhr.setRequestHeader("Content-Type", "application/json");
    if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);

    if (xhr.upload && onUploadProgress) {
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) onUploadProgress(e.loaded / e.total);
      };
    }

    xhr.onload = () => {
      let data = null;
      try {
        data = xhr.responseText ? JSON.parse(xhr.responseText) : null;
      } catch {
        // ответ не JSON — если статус не ok, разберётся как fallback ниже
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(data);
      } else {
        reject(new ApiError(xhr.status, readableDetail(data?.detail, xhr.statusText || "Ошибка сервера")));
      }
    };
    // ontimeout — сработал именно xhr.timeout (наш таймаут, тот же смысл,
    // что и AbortError/controller.signal.aborted у fetch-версии в request()),
    // onerror — настоящий обрыв соединения. Разные сообщения пользователю
    // по той же причине, что описана в request() выше.
    xhr.ontimeout = () => reject(new ApiError(0, "Сервер не отвечает"));
    xhr.onerror = () => reject(new ApiError(0, "Нет соединения с сервером"));
    xhr.onabort = () => reject(new ApiError(0, "Запрос отменён"));

    xhr.send(JSON.stringify(body));
  });
}

/* ============================================================
   AUTH
   ============================================================ */

export function login(productKey, fingerprint) {
  return request("/auth/login", {
    method: "POST",
    body: { product_key: productKey, fingerprint },
  });
}

export function me(token) {
  return request("/auth/me", { token });
}

/* ============================================================
   ГЛАВЫ И ВОПРОСЫ
   Бэкенд отдаёт поля в своей форме (question_count, is_correct
   на каждом варианте ответа и т.д.) — normalize* приводят это
   к форме, которой пользуется quiz.js/render.js, чтобы им не
   нужно было знать про структуру ответа бэкенда.
   ============================================================ */

function normalizeChapter(raw, index) {
  return {
    id: raw.id,
    // Порядковый номер для бейджа в списке — ВСЕГДА позиция в массиве, не raw.order:
    // order по умолчанию 0 у каждой новой главы (см. ChapterCreate на бэкенде),
    // и "0 ?? index+1" из-за ?? не подставляет фолбэк (0 — не null/undefined),
    // так что при использовании order все главы показывали бы "00".
    num: index + 1,
    title: raw.title,
    description: raw.description ?? "",
    count: raw.question_count ?? 0,
  };
}

function detectImageMime(base64) {
  // Достаточно первых символов base64, чтобы отличить самые частые форматы —
  // "data:image/*" не валиден по спецификации, поэтому угадываем конкретный тип.
  if (base64.startsWith("iVBORw0KGgo")) return "image/png";
  if (base64.startsWith("/9j/")) return "image/jpeg";
  if (base64.startsWith("R0lGOD")) return "image/gif";
  if (base64.startsWith("UklGR")) return "image/webp";
  return "image/png"; // разумный дефолт, если сигнатура не распознана
}

function normalizeQuestion(raw) {
  const correctIndex = raw.answers.findIndex((a) => a.is_correct);
  return {
    id: raw.id,
    text: raw.text,
    options: raw.answers.map((a) => a.text),
    correctIndex,
    explanation: raw.hint ?? "",
    image: raw.image_base64
      ? `data:${detectImageMime(raw.image_base64)};base64,${raw.image_base64}`
      : null,
    // Автор/дата создания — бэкенд их и так отдаёт (см. QuestionOut на
    // сервере), раньше клиент их просто не читал. Нужны для подсказки при
    // наведении в списке вопросов редактора (см. render.renderEditorQuestionList).
    createdByEmail: raw.created_by_email ?? null,
    createdAt: raw.created_at ?? null,
  };
}

export async function listChapters(token) {
  const raw = await request("/chapters", { token });
  // Порядок глав в интерфейсе — по названию, а не по порядку/id с бэкенда
  // (по просьбе): раньше `num`-бейдж и порядок в списке были просто позицией
  // в ответе сервера (тем самым — фактически по id/order). localeCompare с
  // "ru" даёт корректную сортировку кириллицы (порядок алфавита, а не байтов).
  const sorted = [...raw].sort((a, b) => String(a.title ?? "").localeCompare(String(b.title ?? ""), "ru"));
  return sorted.map(normalizeChapter);
}

/**
 * @param {string|null} token
 * @param {number} chapterId
 * @param {(questionsSoFar: number) => void} [onProgress] — см.
 *   requestQuestionsWithProgress: вызывается по мере того, как в ответе
 *   появляются целиком пришедшие вопросы, а не один раз в самом конце.
 */
export async function listQuestions(token, chapterId, onProgress) {
  // Свой (увеличенный) таймаут — см. QUESTIONS_FETCH_TIMEOUT_MS в config.js:
  // ответ несёт все фото вопросов главы разом, дефолтного REQUEST_TIMEOUT_MS
  // на медленном канале не всегда хватает, особенно при кэшировании всех
  // глав подряд (см. questions.js refreshAllCache).
  const raw = await requestQuestionsWithProgress(`/chapters/${chapterId}/questions`, {
    token,
    timeoutMs: QUESTIONS_FETCH_TIMEOUT_MS,
    onProgress,
  });
  return raw.map(normalizeQuestion);
}

/* ============================================================
   Управление главами и заданиями — доступно editor/admin,
   бэкенд сам проверяет права (403, если роли не хватает) —
   здесь просто вызовы, без дублирования проверки прав на клиенте.
   ============================================================ */

export async function createChapter(token, { title, description, order }) {
  const raw = await request("/chapters", {
    method: "POST",
    token,
    body: { title, description: description || null, order: order ?? 0 },
  });
  return normalizeChapter(raw, 0);
}

/**
 * Меняет title и/или description главы. Роль editor теперь тоже может менять
 * оба поля (бэкенд запрещает ей менять только order, см. routers/chapters.py) —
 * отдельного "только title" вызова для fallback больше не нужно.
 */
export async function updateChapter(token, chapterId, { title, description }) {
  const raw = await request(`/chapters/${chapterId}`, {
    method: "PATCH",
    token,
    body: { title, description: description || null },
  });
  return normalizeChapter(raw, 0);
}

export function deleteChapter(token, chapterId) {
  return request(`/chapters/${chapterId}`, { method: "DELETE", token });
}

export async function createQuestion(token, chapterId, payload) {
  const raw = await request(`/chapters/${chapterId}/questions`, {
    method: "POST",
    token,
    body: {
      text: payload.text,
      order: payload.order ?? 0,
      hint: payload.hint || null,
      image_base64: payload.imageBase64 || null,
      answers: payload.answers, // [{text, is_correct}]
    },
  });
  return normalizeQuestion(raw);
}

export async function updateQuestion(token, chapterId, questionId, payload) {
  const raw = await request(`/chapters/${chapterId}/questions/${questionId}`, {
    method: "PATCH",
    token,
    body: {
      text: payload.text,
      order: payload.order,
      hint: payload.hint,
      image_base64: payload.imageBase64,
      answers: payload.answers, // [{text, is_correct}] или undefined, если не меняем
    },
  });
  return normalizeQuestion(raw);
}

export function deleteQuestion(token, chapterId, questionId) {
  return request(`/chapters/${chapterId}/questions/${questionId}`, {
    method: "DELETE",
    token,
  });
}

/* ============================================================
   Управление лицензиями — только admin, бэкенд сам проверяет
   права (require_admin). Ответы не нормализуем — это внутренние
   админские данные, поля бэкенда (product_key, user_type,
   license_until, is_blocked) уже говорящие сами по себе.
   ============================================================ */

export function listLicenses(token) {
  return request("/admin/licenses", { token });
}

export function createLicense(token, payload) {
  return request("/admin/licenses", { method: "POST", token, body: payload });
}

export function extendLicense(token, userId, extraDays) {
  return request(`/admin/licenses/${userId}/extend`, {
    method: "POST",
    token,
    body: { extra_days: extraDays },
  });
}

export function blockLicense(token, userId) {
  return request(`/admin/licenses/${userId}/block`, { method: "POST", token });
}

export function unblockLicense(token, userId) {
  return request(`/admin/licenses/${userId}/unblock`, { method: "POST", token });
}

export function resetDevice(token, userId) {
  return request(`/admin/licenses/${userId}/reset-device`, { method: "POST", token });
}

export function deleteLicense(token, userId) {
  return request(`/admin/licenses/${userId}`, { method: "DELETE", token });
}

/* ============================================================
   ПРОФИЛЬ — имя/фамилия/email пользователя (в отличие от
   updateSettings выше, это не произвольный JSON, а конкретные поля).
   ============================================================ */

/**
 * @param {string|null} token
 * @param {{firstName?: string, lastName?: string, email?: string, profilePhoto?: string|null}} fields
 * @param {{onUploadProgress?: (fraction: number) => void}} [options] — фракция
 *   0..1 отправки тела, актуальна только когда реально передаётся фото
 *   (см. ниже) — используется в ProfileScreen.svelte, чтобы вместо голой
 *   надписи "Загрузка…" показать реальный процент и было видно, что запрос
 *   не завис, а действительно передаёт данные.
 */
export async function updateProfile(token, { firstName, lastName, email, profilePhoto }, { onUploadProgress } = {}) {
  const body = { first_name: firstName || null, last_name: lastName || null, email: email || null };
  // profilePhoto специально undefined-able: если вызывающий код не передал
  // это поле вовсе (например, сохраняет только имя/email), поле не уйдет
  // в body и бэкенд не тронет уже сохраненное фото (см. photo_provided на
  // сервере). Если явно передали null — это осознанное "убрать фото".
  if (profilePhoto !== undefined) body.profile_photo = profilePhoto;

  if (!profilePhoto) {
    // Обычный случай (имя/email, либо явное удаление фото — null, лёгкое
    // тело) — как и раньше, общий request() с обычным REQUEST_TIMEOUT_MS.
    return request("/auth/me/profile", { method: "PATCH", token, body });
  }

  // С фото — свой (больший) таймаут, XHR ради прогресса отправки (см.
  // patchProfileWithProgress выше) и сверка после таймаута (см. ниже).
  try {
    return await patchProfileWithProgress(token, body, { timeoutMs: PHOTO_UPLOAD_TIMEOUT_MS, onUploadProgress });
  } catch (err) {
    // status === 0 у ApiError здесь означает именно "не дождались ответа"
    // (наш таймаут или обрыв связи), а не то, что сервер отверг запрос —
    // см. ontimeout/onerror в patchProfileWithProgress. На таком канале
    // (см. SERVER_BASE_URL — арендованная линия) вполне бывает так, что
    // ЗАПРОС сервер получил и обработал, а вот ОТВЕТ обратно не дошёл —
    // тогда показывать пользователю "не удалось сохранить" и заставлять
    // заливать фото заново неверно: сверяемся отдельным лёгким GET
    // /auth/me — если сервер сейчас отвечает и уже показывает именно то
    // фото, что мы отправляли, значит сохранение прошло, просто ответ на
    // PATCH потерялся/не успел за timeoutMs.
    if (err instanceof ApiError && err.status === 0) {
      try {
        const current = await me(token);
        if (current && current.profile_photo === profilePhoto) return current;
      } catch {
        // сверка тоже не прошла — сервера сейчас действительно не видно,
        // оставляем исходную ошибку как есть
      }
    }
    throw err;
  }
}

/* ============================================================
   ДРУЗЬЯ — заявки по email, принятие, удаление/отклонение.
   ============================================================ */

export function sendFriendRequest(token, email) {
  return request("/friends/requests", { method: "POST", token, body: { email } });
}

export function listIncomingFriendRequests(token) {
  return request("/friends/requests/incoming", { token });
}

export function listOutgoingFriendRequests(token) {
  return request("/friends/requests/outgoing", { token });
}

export function acceptFriendRequest(token, friendshipId) {
  return request(`/friends/requests/${friendshipId}/accept`, { method: "POST", token });
}

export function removeFriendship(token, friendshipId) {
  return request(`/friends/requests/${friendshipId}`, { method: "DELETE", token });
}

export function listFriends(token) {
  return request("/friends", { token });
}

export function getLeaderboard(token) {
  return request("/friends/leaderboard", { token });
}
