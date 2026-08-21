/**
 * Всё общение с backend'ом — в этом файле и только в нём (тот же принцип,
 * что был раньше). Раньше это был fetch/XHR прямо из webview на REST-сервер
 * (FastAPI, JSON, порт 8000); теперь сервер — gRPC (roadwits-rs, tonic,
 * порт 50051), а обычным браузерным fetch до gRPC/HTTP2 не достучаться —
 * поэтому весь сетевой код переехал в Rust (см. src-tauri/src/grpc/) и
 * здесь заменён на invoke(...) к Tauri-командам.
 *
 * Сигнатуры экспортируемых функций (login, me, listChapters, createQuestion
 * и т.д.) НЕ изменились — остальной фронтенд (quiz.js, auth.js, admin.js,
 * экраны) как вызывал их, так и вызывает, ничего не зная о том, что под
 * капотом раньше был JSON+HTTP, а теперь Protobuf+gRPC. Формы возвращаемых
 * объектов (snake_case-поля вроде question_count, is_correct,
 * created_by_email) тоже сохранены — их отдаёт уже Rust-сторона (см.
 * grpc/commands.rs), specifically чтобы normalizeChapter/normalizeQuestion
 * ниже не пришлось трогать.
 */
import { Channel, invoke } from "@tauri-apps/api/core";

export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

/**
 * Команды в src-tauri/src/grpc/commands.rs при ошибке возвращают Err(String),
 * где строка — JSON {"status": <число>, "message": <текст>} (см.
 * grpc/error.rs status_to_js): status === 0 сохраняет тот же смысл, что и
 * раньше при fetch — "не дождались ответа/сервер недоступен", а не "сервер
 * ответил отказом" (на этом различии завязана логика offline-режима в
 * auth.js tryAutoLogin и сверки после таймаута в updateProfile ниже).
 * Если Tauri почему-то вернул что-то, не похожее на этот формат (внутренняя
 * ошибка invoke, а не наша команда) — не роняем вызывающий код неведомым
 * исключением, а заворачиваем как есть в ApiError(500, ...).
 */
function toApiError(err) {
  if (typeof err === "string") {
    try {
      const parsed = JSON.parse(err);
      if (parsed && typeof parsed.status === "number" && typeof parsed.message === "string") {
        return new ApiError(parsed.status, parsed.message);
      }
    } catch {
      // не наш формат — падаем в общий случай ниже
    }
    return new ApiError(500, err);
  }
  return new ApiError(500, err?.message || "Неизвестная ошибка");
}

async function call(command, args) {
  try {
    return await invoke(command, args);
  } catch (err) {
    throw toApiError(err);
  }
}

export async function health() {
  return call("health");
}

/* ============================================================
   AUTH
   ============================================================ */

export function login(productKey, fingerprint) {
  return call("login", { productKey, fingerprint });
}

export function me(token) {
  return call("me", { token });
}

export function updateSettings(token, settings) {
  return call("update_settings", { token, settings });
}

/**
 * profilePhoto специально может быть undefined: если вызывающий код не
 * передал это поле вовсе (например, сохраняет только имя/email), ключ не
 * уйдёт в аргументы invoke() вовсе (JSON.stringify/сериализация Tauri
 * отбрасывают undefined-свойства) — на Rust-стороне соответствующий
 * Option<String>-параметр десериализуется в None, а это и значит "не
 * менять фото" (см. grpc/commands.rs update_profile). Явный null — осознанный
 * сброс фото, "" на сервере трактуется так же (см. api_migration_map.md).
 *
 * onUploadProgress: раньше здесь был РЕАЛЬНЫЙ процент отправки тела через
 * XMLHttpRequest.upload.onprogress — invoke() такого не даёт (это не потоковая
 * передача, а один вызов на весь запрос). Чтобы в ProfileScreen.svelte не
 * пропадала обратная связь на медленном канале совсем, эмулируем прогресс:
 * плавно растим процент до 90% пока ждём ответа, и сразу показываем 100% по
 * завершении. Это не точный процент отправки, а просто "видно, что идёт
 * работа, а не зависание".
 */
export async function updateProfile(token, { firstName, lastName, email, profilePhoto }, { onUploadProgress } = {}) {
  const args = { token, firstName: firstName || null, lastName: lastName || null, email: email || null };
  if (profilePhoto !== undefined) args.profilePhoto = profilePhoto;

  if (!profilePhoto || !onUploadProgress) {
    return call("update_profile", args);
  }

  let fraction = 0;
  const timer = window.setInterval(() => {
    fraction = Math.min(0.9, fraction + 0.1);
    onUploadProgress(fraction);
  }, 300);
  try {
    const result = await call("update_profile", args);
    onUploadProgress(1);
    return result;
  } finally {
    window.clearInterval(timer);
  }
}

/* ============================================================
   ГЛАВЫ И ВОПРОСЫ
   Бэкенд (Rust-сторона, grpc/commands.rs) уже отдаёт поля в привычной
   фронтенду форме (question_count, is_correct на каждом варианте ответа
   и т.д.) — normalize* здесь по-прежнему нужны (сортировка, дефолты,
   определение MIME картинки, вычисление correctIndex), просто больше не
   имеют дела с сырым HTTP-ответом.
   ============================================================ */

function normalizeChapter(raw, index) {
  return {
    id: raw.id,
    num: index + 1,
    title: raw.title,
    description: raw.description ?? "",
    count: raw.question_count ?? 0,
  };
}

function detectImageMime(base64) {
  if (base64.startsWith("iVBORw0KGgo")) return "image/png";
  if (base64.startsWith("/9j/")) return "image/jpeg";
  if (base64.startsWith("R0lGOD")) return "image/gif";
  if (base64.startsWith("UklGR")) return "image/webp";
  return "image/png";
}

function normalizeQuestion(raw) {
  const correctIndex = raw.answers.findIndex((a) => a.is_correct);
  return {
    id: raw.id,
    text: raw.text,
    options: raw.answers.map((a) => a.text),
    correctIndex,
    explanation: raw.hint ?? "",
    image: raw.image_base64 ? `data:${detectImageMime(raw.image_base64)};base64,${raw.image_base64}` : null,
    createdByEmail: raw.created_by_email ?? null,
    createdAt: raw.created_at ?? null,
  };
}

export async function listChapters(token) {
  const raw = await call("list_chapters", { token });
  const sorted = [...raw].sort((a, b) => String(a.title ?? "").localeCompare(String(b.title ?? ""), "ru"));
  return sorted.map(normalizeChapter);
}

/**
 * ListQuestions на сервере — server-streaming: вопросы главы приходят по
 * сети по одному, отдельными gRPC-сообщениями, а не все разом одним
 * большим ответом (см. content.proto/content_svc.rs). На Rust-стороне
 * команда list_questions (см. grpc/commands.rs) сама ничего не
 * возвращает — каждый пришедший по стриму вопрос она тут же пересылает
 * дальше через tauri::ipc::Channel, отдельным IPC-сообщением. Здесь эти
 * сообщения и собираются в массив по мере поступления, поэтому onProgress
 * (если передан) можно звать сразу, как только пришёл очередной вопрос, а
 * не только один раз в самом конце.
 * @param {string} token
 * @param {number} chapterId
 * @param {(n: number) => void} [onProgress] — n = сколько вопросов главы
 *   уже пришло (растёт с каждым сообщением, а не только "готово/не готово").
 */
async function requestQuestionsWithProgress(token, chapterId, onProgress) {
  const questions = [];
  const onEvent = new Channel();
  onEvent.onmessage = (question) => {
    questions.push(question);
    onProgress?.(questions.length);
  };
  try {
    await invoke("list_questions", { token, chapterId, onEvent });
  } catch (err) {
    throw toApiError(err);
  }
  return questions;
}

export async function listQuestions(token, chapterId, onProgress) {
  const raw = await requestQuestionsWithProgress(token, chapterId, onProgress);
  return raw.map(normalizeQuestion);
}

/* ============================================================
   Управление главами и заданиями — доступно editor/admin,
   бэкенд сам проверяет права (PERMISSION_DENIED, если роли не хватает) —
   здесь просто вызовы, без дублирования проверки прав на клиенте.
   ============================================================ */

export async function createChapter(token, { title, description, order }) {
  const raw = await call("create_chapter", { token, title, description: description || null, order: order ?? 0 });
  return normalizeChapter(raw, 0);
}

/**
 * Меняет title и/или description главы. order сознательно не передаём —
 * его presence на сервере означает намерение сменить порядок, а это
 * разрешено только admin (см. grpc/commands.rs update_chapter).
 */
export async function updateChapter(token, chapterId, { title, description }) {
  const raw = await call("update_chapter", {
    token,
    chapterId,
    title,
    description: description || null,
  });
  return normalizeChapter(raw, 0);
}

export function deleteChapter(token, chapterId) {
  return call("delete_chapter", { token, chapterId });
}

export async function createQuestion(token, chapterId, payload) {
  const raw = await call("create_question", {
    token,
    chapterId,
    text: payload.text,
    order: payload.order ?? 0,
    hint: payload.hint || null,
    imageBase64: payload.imageBase64 || null,
    answers: payload.answers, // [{text, is_correct}]
  });
  return normalizeQuestion(raw);
}

/**
 * payload.answers может быть undefined (правка вопроса без изменения
 * ответов) — answersProvided явно говорит серверу, менять ли их (см.
 * api_migration_map.md: repeated-поля не поддерживают proto3 optional,
 * поэтому presence выражена отдельным флагом).
 */
export async function updateQuestion(token, chapterId, questionId, payload) {
  const raw = await call("update_question", {
    token,
    chapterId,
    questionId,
    text: payload.text,
    order: payload.order,
    hint: payload.hint,
    imageBase64: payload.imageBase64,
    answers: payload.answers ?? [],
    answersProvided: payload.answers !== undefined,
  });
  return normalizeQuestion(raw);
}

export function deleteQuestion(token, chapterId, questionId) {
  return call("delete_question", { token, chapterId, questionId });
}

/* ============================================================
   Управление лицензиями — только admin, бэкенд сам проверяет права.
   Ответы не нормализуем — это внутренние админские данные, поля с
   Rust-стороны (product_key, user_type, license_until, is_blocked)
   уже говорящие сами по себе.
   ============================================================ */

export function listLicenses(token) {
  return call("list_licenses", { token });
}

export function createLicense(token, payload) {
  return call("create_license", {
    token,
    userType: payload.user_type,
    email: payload.email ?? null,
    firstName: payload.first_name ?? null,
    lastName: payload.last_name ?? null,
    licenseDays: payload.license_days,
    maxDevices: payload.max_devices,
  });
}

export function extendLicense(token, userId, extraDays) {
  return call("extend_license", { token, userId, extraDays });
}

export function blockLicense(token, userId) {
  return call("block_license", { token, userId });
}

export function unblockLicense(token, userId) {
  return call("unblock_license", { token, userId });
}

export function resetDevice(token, userId) {
  return call("reset_device", { token, userId });
}

export function deleteLicense(token, userId) {
  return call("delete_license", { token, userId });
}

/* ============================================================
   ДРУЗЬЯ — заявки по email, принятие, удаление/отклонение.
   ============================================================ */

export function sendFriendRequest(token, email) {
  return call("send_friend_request", { token, email });
}

export function listIncomingFriendRequests(token) {
  return call("list_incoming_friend_requests", { token });
}

export function listOutgoingFriendRequests(token) {
  return call("list_outgoing_friend_requests", { token });
}

export function acceptFriendRequest(token, friendshipId) {
  return call("accept_friend_request", { token, friendshipId });
}

export function removeFriendship(token, friendshipId) {
  return call("remove_friendship", { token, friendshipId });
}

export function listFriends(token) {
  return call("list_friends", { token });
}

export function getLeaderboard(token) {
  return call("get_leaderboard", { token });
}
