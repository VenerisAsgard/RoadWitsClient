/**
 * Всё общение с backend'ом (roadwits-server) — в этом файле и только в нём.
 * Остальной код (quiz.js, auth.js, render.js) не знает про fetch, про формат
 * JSON конкретных эндпоинтов бэкенда и т.п. — он работает с уже нормализованными
 * объектами (см. normalizeChapter/normalizeQuestion ниже).
 *
 * В деве бэкенд поднят через docker-compose на 8000 (см. roadwits-server/.env
 * APP_PORT). Для прод-сборки поменяй под реальный адрес API.
 */
const API_BASE_URL = "http://localhost:8000";

export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

async function request(path, { method = "GET", body, token } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    let detail = res.statusText;
    try {
      const data = await res.json();
      detail = data.detail ?? detail;
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
    num: raw.order ?? index + 1,
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
