/**
 * Всё общение с backend'ом (roadwits-server) — в этом файле и только в нём.
 * Остальной код (quiz.js, auth.js, render.js) не знает про fetch, про формат
 * JSON конкретных эндпоинтов бэкенда и т.п. — он работает с уже нормализованными
 * объектами (см. normalizeChapter/normalizeQuestion ниже).
 *
 * Адрес сервера и таймаут запроса вынесены в js/config.js — там единственное
 * место, которое нужно менять под другой backend (прод/стейджинг/свой порт).
 */
import { SERVER_BASE_URL, REQUEST_TIMEOUT_MS } from "./config.js";

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

async function request(path, { method = "GET", body, token } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

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
    const timedOut = err?.name === "AbortError";
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
  };
}

export async function listChapters(token) {
  const raw = await request("/chapters", { token });
  return raw.map(normalizeChapter);
}

export async function listQuestions(token, chapterId) {
  const raw = await request(`/chapters/${chapterId}/questions`, { token });
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

export async function updateChapterTitle(token, chapterId, title) {
  // Намеренно отправляем только title — так этим же вызовом может
  // пользоваться и editor (ему бэкенд разрешает менять только его).
  const raw = await request(`/chapters/${chapterId}`, {
    method: "PATCH",
    token,
    body: { title },
  });
  return normalizeChapter(raw, 0);
}

/**
 * Как updateChapterTitle, но заодно шлёт description — используется формой
 * редактирования главы (см. admin.js chapterFormHtml), которая теперь
 * позволяет менять описание так же, как при создании. Роли, которым бэкенд
 * не разрешает менять description (editor — см. комментарий выше), получат
 * 403 на это поле; в таком случае откатываемся на updateChapterTitle.
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

export function updateProfile(token, { firstName, lastName, email, profilePhoto }) {
  const body = { first_name: firstName || null, last_name: lastName || null, email: email || null };
  // profilePhoto специально undefined-able: если вызывающий код не передал
  // это поле вовсе (например, сохраняет только имя/email), поле не уйдет
  // в body и бэкенд не тронет уже сохраненное фото (см. photo_provided на
  // сервере). Если явно передали null — это осознанное "убрать фото".
  if (profilePhoto !== undefined) body.profile_photo = profilePhoto;
  return request("/auth/me/profile", { method: "PATCH", token, body });
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
