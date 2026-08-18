/**
 * Всё, что относится к редактированию контента и управлению лицензиями —
 * перенесено из src-legacy/js/admin.js. Доступно только editor/admin
 * (главы/вопросы) и только admin (лицензии) — сам этот модуль прав не
 * проверяет, это делает бэкенд (403); видимость элементов интерфейса
 * решает canEditContent()/isAdmin() из state.svelte.js.
 *
 * УЛУЧШЕНИЕ относительно оригинала: там этот модуль ещё и строил HTML
 * форм руками (render.openModal(html)) — здесь формы стали обычными
 * Svelte-компонентами (ChapterFormModal/QuestionFormModal/...), а этот
 * модуль остался тем, чем и должен быть — только данными и запросами.
 */
import { state, canEditContent } from "./state.svelte.js";
import * as api from "./api/api.js";
import * as cache from "./api/cache.js";
import { loadChapterQuestions } from "./api/questions.js";
import { toast, confirmDialog } from "./stores/ui.svelte.js";

/* ============================================================
   ГЛАВЫ
   ============================================================ */

/** Главы могли поменяться (создание/правка/удаление главы ИЛИ вопроса
 * внутри неё — у главы меняется question_count) — перечитываем список
 * целиком и сбрасываем всё, что от него зависит. */
export async function reloadChapters() {
  state.chapters = await api.listChapters(state.token);
  state.questionPoolCache = null; // состав вопросов мог поменяться
  await cache.clearAll(); // дисковый кэш вопросов по главам тоже мог устареть
  questionIndex = null; // индекс для поиска/дубликатов построен на старых данных
  if (state.chapterIndex >= state.chapters.length) {
    state.chapterIndex = Math.max(0, state.chapters.length - 1);
  }
  await refreshEditorQuestions();
}

export async function createChapter(title, description) {
  try {
    await api.createChapter(state.token, { title, description });
    await reloadChapters();
    return true;
  } catch (err) {
    toast(err instanceof api.ApiError ? err.message : "Не удалось создать главу", "error");
    return false;
  }
}

export async function renameChapter(chapter, title, description) {
  try {
    // Роль editor теперь тоже может менять title и description (бэкенд
    // запрещает ей менять только order) — отдельный fallback без description
    // больше не нужен, 403 здесь означает реальную ошибку прав/данных.
    await api.updateChapter(state.token, chapter.id, { title, description });
    await reloadChapters();
    return true;
  } catch (err) {
    toast(err instanceof api.ApiError ? err.message : "Не удалось сохранить главу", "error");
    return false;
  }
}

export async function confirmDeleteChapter(chapter) {
  const ok = await confirmDialog({
    title: "Удалить главу?",
    text: `Глава «${chapter.title}» будет удалена вместе со всеми вопросами внутри неё.`,
    confirmLabel: "Удалить",
    cancelLabel: "Отмена",
    danger: true,
  });
  if (!ok) return;
  try {
    await api.deleteChapter(state.token, chapter.id);
    state.chapterIndex = Math.max(0, state.chapterIndex - 1);
    await reloadChapters();
  } catch (err) {
    toast(err instanceof api.ApiError ? err.message : "Не удалось удалить главу", "error");
  }
}

/* ============================================================
   ВОПРОСЫ (в рамках выбранной главы)
   ============================================================ */

export async function refreshEditorQuestions() {
  if (!canEditContent()) return;
  const chapter = state.chapters[state.chapterIndex];
  if (!chapter) {
    state.editorQuestions = [];
    return;
  }
  try {
    state.editorQuestions = await loadChapterQuestions(chapter.id);
  } catch {
    state.editorQuestions = [];
  }
}

export async function createQuestion(payload) {
  try {
    const chapter = state.chapters[state.chapterIndex];
    await api.createQuestion(state.token, chapter.id, payload);
    await reloadChapters();
    return true;
  } catch (err) {
    toast(err instanceof api.ApiError ? err.message : "Не удалось сохранить вопрос", "error");
    return false;
  }
}

/**
 * chapterId передаётся явно (а не берётся из state.chapterIndex, как
 * раньше) — это позволяет сохранить правку, даже когда вопрос открыт не из
 * списка вопросов главы (ChaptersScreen), а прямо посреди билета
 * (QuestionScreen — см. пункт "редактирование билета на лету"), где текущий
 * вопрос почти всегда из другой главы, чем та, что выбрана в редакторе
 * (random/exam-билет вообще мешает вопросы из разных глав).
 * @param {number} chapterId
 * @param {number} questionId
 * @param {any} payload
 */
export async function updateQuestionById(chapterId, questionId, payload) {
  try {
    const updated = await api.updateQuestion(state.token, chapterId, questionId, payload);
    const withChapter = { ...updated, chapterId };
    // Если этот вопрос сейчас в билете (тренировка/экзамен) — обновляем его
    // прямо в state.questions, чтобы правка была видна сразу на экране
    // вопроса, без выхода из теста и повторной загрузки билета.
    const qIdx = state.questions.findIndex((q) => q.id === questionId);
    if (qIdx !== -1) state.questions[qIdx] = { ...state.questions[qIdx], ...withChapter };
    await reloadChapters();
    return true;
  } catch (err) {
    toast(err instanceof api.ApiError ? err.message : "Не удалось сохранить вопрос", "error");
    return false;
  }
}

export async function confirmDeleteQuestion(chapterId, questionId) {
  const ok = await confirmDialog({
    title: "Удалить вопрос?",
    text: "Это действие нельзя отменить.",
    confirmLabel: "Удалить",
    cancelLabel: "Отмена",
    danger: true,
  });
  if (!ok) return false;
  try {
    await api.deleteQuestion(state.token, chapterId, questionId);
    await reloadChapters();
    return true;
  } catch (err) {
    toast(err instanceof api.ApiError ? err.message : "Не удалось удалить вопрос", "error");
    return false;
  }
}

export function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/* ============================================================
   ПОИСК ВОПРОСА ПО ВСЕМ ГЛАВАМ / ПРОВЕРКА НА ДУБЛИКАТ

   questionIndex — вопросы всех глав разом (через кэш-загрузчик, поэтому
   после первого построения почти всегда мгновенно), используется и
   поиском (searchQuestions), и предупреждением о дубликате в форме
   создания вопроса (см. QuestionFormModal.svelte).
   ============================================================ */

let questionIndex = null; // { [chapterId]: Question[] } | null

export async function buildQuestionIndex() {
  if (questionIndex) return questionIndex;
  const entries = await Promise.all(
    state.chapters.map(async (c) => [c.id, await loadChapterQuestions(c.id).catch(() => [])]),
  );
  questionIndex = Object.fromEntries(entries);
  return questionIndex;
}

/** Нормализация текста для сравнения: регистр, "ё"→"е", знаки препинания
 * и лишние пробелы не должны мешать считать два вопроса одинаковыми. */
function normalizeQuestionText(text) {
  return String(text ?? "")
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function wordSet(text) {
  return new Set(normalizeQuestionText(text).split(" ").filter(Boolean));
}

/** Похожесть двух множеств слов (0..1) — доля общих слов от объединения. */
function jaccard(a, b) {
  if (!a.size && !b.size) return 0;
  let intersection = 0;
  for (const w of a) if (b.has(w)) intersection++;
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/**
 * Ищет вопросы, похожие на text, по уже построенному индексу. threshold —
 * минимальная похожесть слов, чтобы попасть в выдачу (не считая точных/
 * строковых совпадений — те попадают всегда).
 */
export function findSimilarQuestions(index, text, { threshold = 0.5, excludeId = null, limit = 10 } = {}) {
  const norm = normalizeQuestionText(text);
  if (norm.length < 2) return [];
  const words = wordSet(text);

  const results = [];
  for (const chapter of state.chapters) {
    const list = index[chapter.id] || [];
    for (const q of list) {
      if (excludeId && q.id === excludeId) continue;
      const qNorm = normalizeQuestionText(q.text);
      const exact = qNorm === norm;
      const substring = !exact && qNorm.length > 0 && (qNorm.includes(norm) || norm.includes(qNorm));
      const score = exact ? 1 : jaccard(words, wordSet(q.text));
      if (exact || substring || score >= threshold) {
        results.push({
          question: q,
          chapter,
          exact,
          score: exact ? 1 : substring ? Math.max(score, 0.5) : score,
        });
      }
    }
  }
  results.sort((a, b) => b.score - a.score);
  return results.slice(0, limit);
}

/* ============================================================
   ЛИЦЕНЗИИ (панель администрирования, только admin)
   ============================================================ */

/** Применяет текущие поиск (state.licenseFilter) и сортировку
 * (state.licenseSort) к сырому списку с бэкенда — обе чисто клиентские,
 * повторный запрос к серверу не нужен ни при вводе в поиск, ни при клике
 * по заголовку столбца. */
export function visibleLicenses() {
  const q = state.licenseFilter.trim().toLowerCase();
  let list = state.licenses;
  if (q) {
    list = list.filter((lic) =>
      [lic.product_key, lic.email, lic.first_name, lic.last_name]
        .filter(Boolean)
        .some((field) => String(field).toLowerCase().includes(q)),
    );
  }

  const { field, dir } = state.licenseSort;
  const sign = dir === "asc" ? 1 : -1;
  return [...list].sort((a, b) => {
    let av = a[field];
    let bv = b[field];
    if (field === "is_blocked") {
      av = av ? 1 : 0;
      bv = bv ? 1 : 0;
    }
    if (av == null) av = "";
    if (bv == null) bv = "";
    if (typeof av === "string") av = av.toLowerCase();
    if (typeof bv === "string") bv = bv.toLowerCase();
    if (av < bv) return -1 * sign;
    if (av > bv) return 1 * sign;
    return 0;
  });
}

export async function loadLicenses() {
  try {
    state.licenses = await api.listLicenses(state.token);
  } catch (err) {
    state.licenses = [];
    toast(err instanceof api.ApiError ? err.message : "Не удалось загрузить список лицензий", "error");
  }
}

export function setLicenseFilter(text) {
  state.licenseFilter = text;
}

/** Клик по заголовку столбца: тот же столбец — разворачиваем направление,
 * другой — сортируем по нему по возрастанию. */
export function setLicenseSort(field) {
  if (state.licenseSort.field === field) {
    state.licenseSort = { field, dir: state.licenseSort.dir === "asc" ? "desc" : "asc" };
  } else {
    state.licenseSort = { field, dir: "asc" };
  }
}

export async function copyLicenseKey(productKey) {
  try {
    await navigator.clipboard.writeText(productKey);
    toast("Ключ скопирован", "success");
  } catch {
    toast("Не удалось скопировать — скопируйте вручную", "error");
  }
}

export async function createLicense({ userType, email, licenseDays, maxDevices }) {
  try {
    const created = await api.createLicense(state.token, {
      user_type: userType,
      email: email || null,
      license_days: licenseDays,
      // Сколько устройств можно привязать к лицензии одновременно (1..3 на
      // бэкенде, см. LicenseCreateRequest.max_devices) — по умолчанию 1,
      // если форма ничего не передала.
      max_devices: maxDevices || 1,
    });
    await loadLicenses();
    return created; // { product_key, ... } — показывается один раз вызывающим кодом
  } catch (err) {
    toast(err instanceof api.ApiError ? err.message : "Не удалось создать лицензию", "error");
    return null;
  }
}

export async function extendLicenseById(userId) {
  try {
    await api.extendLicense(state.token, userId, 30);
    await loadLicenses();
  } catch (err) {
    toast(err instanceof api.ApiError ? err.message : "Не удалось продлить лицензию", "error");
  }
}

export async function toggleBlockLicense(userId, currentlyBlocked) {
  try {
    if (currentlyBlocked) await api.unblockLicense(state.token, userId);
    else await api.blockLicense(state.token, userId);
    await loadLicenses();
  } catch (err) {
    toast(err instanceof api.ApiError ? err.message : "Не удалось изменить статус лицензии", "error");
  }
}

export async function resetDeviceById(userId) {
  const ok = await confirmDialog({
    title: "Сбросить устройство?",
    text: "Пользователь сможет войти с нового устройства.",
    confirmLabel: "Сбросить",
    cancelLabel: "Отмена",
    danger: true,
  });
  if (!ok) return;
  try {
    await api.resetDevice(state.token, userId);
    toast("Устройство сброшено", "success");
  } catch (err) {
    toast(err instanceof api.ApiError ? err.message : "Не удалось сбросить устройство", "error");
  }
}

export async function deleteLicenseById(userId) {
  const ok = await confirmDialog({
    title: "Удалить пользователя?",
    text: "Необратимо: product key перестанет работать, доступ будет отозван немедленно.",
    confirmLabel: "Удалить",
    cancelLabel: "Отмена",
    danger: true,
  });
  if (!ok) return;
  try {
    await api.deleteLicense(state.token, userId);
    toast("Пользователь удалён", "success");
    await loadLicenses();
  } catch (err) {
    toast(err instanceof api.ApiError ? err.message : "Не удалось удалить пользователя", "error");
  }
}
