/**
 * Логика прохождения теста — перенесено из src-legacy/js/quiz.js.
 * Не знает про DOM — только операции над реактивным state, читают их
 * компоненты экранов (QuestionScreen.svelte/ResultScreen.svelte/...).
 *
 * УЛУЧШЕНИЕ (по просьбе): помимо "N из M правильно" теперь считаются баллы —
 * +1 за верный ответ, −1 за неверный, 0 за пропущенный вопрос (см. score в
 * finishQuiz). В оригинале был только процент правильных, неправильный
 * ответ ничем не отличался от пропущенного.
 *
 * Не перенесено (пока): интеграция с admin.js/friends.js — это отдельный
 * шаг (панель администрирования, друзья/лидерборд).
 */
import { state, MENU_ITEMS, RANDOM_COUNT_OPTIONS } from "./state.svelte.js";
import * as api from "./api/api.js";
import * as cache from "./api/cache.js";
import { loadChapterQuestions } from "./api/questions.js";
import { toast, setHint, confirmDialog } from "./stores/ui.svelte.js";

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export const HINT_MENU = [
  { keys: ["↑", "↓"], label: "выбрать" },
  { keys: ["1–9"], label: "быстрый выбор" },
  { keys: ["Enter"], label: "начать" },
];
const HINT_CHAPTERS = [
  { keys: ["↑", "↓"], label: "выбрать" },
  { keys: ["Space"], label: "отметить" },
  { keys: ["Enter"], label: "начать" },
];
const HINT_RANDOM_COUNT = [
  { keys: ["↑", "↓"], label: "количество" },
  { keys: ["Enter"], label: "начать" },
];
const HINT_QUESTION = [
  { keys: ["↑", "↓"], label: "вариант" },
  { keys: ["1–9"], label: "ответить" },
  { keys: ["Enter"], label: "подтвердить" },
  { keys: ["Space"], label: "пропустить" },
  { keys: ["←", "→"], label: "вопрос" },
];
const HINT_RESULT = [
  { keys: ["←", "→"], label: "разбор ответов" },
  { keys: ["Enter"], label: "пройти ещё раз" },
];

/** Пул вопросов по всем главам сразу — для режима "random" (там нужно
 *  реально любое количество вплоть до всего пула, см. RANDOM_COUNT_OPTIONS). */
async function getQuestionPool() {
  if (state.questionPoolCache) return state.questionPoolCache;
  const chapters = state.chapters.length ? state.chapters : await api.listChapters(state.token);
  const perChapter = await Promise.all(chapters.map((c) => loadChapterQuestions(c.id).catch(() => [])));
  const pool = perChapter.flat();
  state.questionPoolCache = pool;
  return pool;
}

const EXAM_QUESTION_COUNT = 10;

/**
 * Билет контрольного экзамена — всегда EXAM_QUESTION_COUNT вопросов.
 * Раньше для этого тоже звался getQuestionPool() — тот же полный пул по
 * ВСЕМ главам, что и для "тренировки по случайному билету" (где нужно
 * действительно любое количество, вплоть до всей базы). Без дискового
 * кэша это значило скачать ВСЮ базу вопросов ради всего десяти случайных —
 * отсюда и жалоба на медленную загрузку экзамена без кэша.
 *
 * Первая версия этой функции брала min(EXAM_QUESTION_COUNT, chapters.length)
 * случайных ГЛАВ по одному вопросу из каждой — баг: если глав меньше, чем
 * EXAM_QUESTION_COUNT (например, всего 4 главы), билет обрывался на 4
 * вопросах вместо 10, хотя суммарно вопросов в базе могло быть в разы
 * больше. Дело не в количестве ГЛАВ, а в количестве ВОПРОСОВ в них — а это
 * уже есть бесплатно в метаданных (`c.count` = question_count с бэкенда,
 * см. normalizeChapter в api.js), без похода в сеть за самими вопросами.
 * Поэтому теперь набираем случайные главы по очереди, суммируя их count,
 * пока "на бумаге" не наберётся нужное число вопросов — и только эти главы
 * реально запрашиваем (Promise.all, как и раньше). Если count у каких-то
 * глав не задан/устарел (старый кэш) — сумма просто не дотянет до need, и
 * в выборку уйдут вообще все главы (тот же результат, что раньше, просто
 * не по умолчанию, а как честный запасной вариант).
 */
async function getExamQuestions() {
  const chapters = state.chapters.length ? state.chapters : await api.listChapters(state.token);
  const totalKnown = chapters.reduce((sum, c) => sum + (c.count || 0), 0);
  const need = Math.min(EXAM_QUESTION_COUNT, totalKnown || EXAM_QUESTION_COUNT);

  const shuffledChapters = shuffle(chapters);
  const pickedChapters = [];
  let running = 0;
  for (const c of shuffledChapters) {
    if (running >= need) break;
    pickedChapters.push(c);
    running += c.count || 0;
  }

  const perChapter = await Promise.all(pickedChapters.map((c) => loadChapterQuestions(c.id).catch(() => [])));
  const pool = perChapter.flat();
  return shuffle(pool).slice(0, Math.min(need, pool.length));
}

export async function loadChapters() {
  try {
    state.chapters = await api.listChapters(state.token);
    await cache.setChapters(state.chapters);
  } catch (err) {
    const offline = await cache.getChaptersStale();
    if (offline) {
      state.chapters = offline;
      toast("Нет связи с сервером — показаны сохранённые данные (офлайн)", "info");
    } else {
      state.chapters = [];
      toast(err instanceof api.ApiError ? err.message : "Нет связи с сервером", "error");
    }
  }
  state.questionPoolCache = null;
}

async function runQuiz(mode, chapterOrChapters) {
  state.mode = mode;
  state.currentQ = 0;
  state.answers = {};
  state.selected = {};
  state.examErrors = 0;
  state.examFailed = false;
  state.questions = [];
  state.lastResult = null;

  state.originScreen = mode === "chapter" ? "chapters" : mode === "random" ? "random-count" : "menu";

  let questions = [];
  if (mode === "chapter") {
    if (Array.isArray(chapterOrChapters)) {
      const results = await Promise.allSettled(chapterOrChapters.map((c) => loadChapterQuestions(c.id)));
      const failedCount = results.filter((r) => r.status === "rejected").length;
      questions = shuffle(results.filter((r) => r.status === "fulfilled").flatMap((r) => r.value));
      if (failedCount && !questions.length) {
        throw results.find((r) => r.status === "rejected").reason;
      }
      if (failedCount) {
        toast(`Не удалось загрузить ${failedCount} из ${chapterOrChapters.length} глав — нет кэша и сети`, "error");
      }
      state.chapterId = null;
      state.multiChapterIds = chapterOrChapters.map((c) => c.id);
    } else {
      questions = await loadChapterQuestions(chapterOrChapters.id);
      state.chapterId = chapterOrChapters.id;
      state.multiChapterIds = null;
    }
  } else if (mode === "random") {
    const pool = await getQuestionPool();
    questions = shuffle(pool).slice(0, Math.min(state.randomCount, pool.length));
  } else if (mode === "exam") {
    questions = await getExamQuestions();
  }

  state.questionsLoading = false;
  state.questions = questions;

  if (mode === "exam") startTimer(900);

  setHint(HINT_QUESTION);
}

export async function beginQuiz(mode, chapterOrChapters, count) {
  state.questionsLoading = true;
  state.screen = "question";
  if (mode === "random") state.randomCount = count || state.randomCount || 10;
  try {
    await runQuiz(mode, chapterOrChapters);
  } catch (err) {
    state.questionsLoading = false;
    const msg = err instanceof api.ApiError ? err.message : "Не удалось загрузить вопросы";
    toast(msg, "error");
    returnToOrigin();
  }
}

function startTimer(seconds) {
  clearInterval(state.timerHandle ?? undefined);
  state.timerSeconds = seconds;
  state.timerHandle = setInterval(() => {
    state.timerSeconds--;
    if (state.timerSeconds <= 0) {
      clearInterval(state.timerHandle ?? undefined);
      finishQuiz();
    }
  }, 1000);
}

export function answerMove(delta) {
  const q = state.questions[state.currentQ];
  if (!q || !q.options.length) return;
  const current = state.selected[q.id] ?? state.answers[q.id] ?? 0;
  state.selected[q.id] = (current + delta + q.options.length) % q.options.length;
}

export function skipQuestion() {
  delete state.selected[state.questions[state.currentQ]?.id];
  goToNextUnanswered();
}

export function goToNextUnanswered() {
  const n = state.questions.length;
  if (!n) return;
  for (let step = 1; step <= n; step++) {
    const idx = (state.currentQ + step) % n;
    if (state.answers[state.questions[idx].id] === undefined) {
      state.currentQ = idx;
      return;
    }
  }
  finishQuiz();
}

export function phaseMove(delta) {
  if (state.mode !== "random" || state.questions.length <= 10) return;
  const totalPhases = Math.ceil(state.questions.length / 10);
  const currentPhase = Math.floor(state.currentQ / 10);
  const nextPhase = Math.max(0, Math.min(totalPhases - 1, currentPhase + delta));
  if (nextPhase === currentPhase) return;
  state.currentQ = nextPhase * 10;
}

function firstUnanswered() {
  return state.questions.findIndex((q) => state.answers[q.id] === undefined);
}

export function questionNext() {
  if (state.currentQ < state.questions.length - 1) {
    state.currentQ++;
    return;
  }
  const unanswered = firstUnanswered();
  if (unanswered >= 0) {
    state.currentQ = unanswered;
    toast(`Остался вопрос ${unanswered + 1}`, "info");
  } else {
    finishQuiz();
  }
}

function handleExamAnswer(q, idx) {
  if (idx !== q.correctIndex) {
    state.examErrors += 1;
    if (state.examErrors >= 2) {
      state.examFailed = true;
      toast("Вторая ошибка. Экзамен прекращён: НЕЗАЧЁТ", "error");
      finishQuiz(true);
    }
  }
}

export function selectOptionByClick(index) {
  const q = state.questions[state.currentQ];
  if (!q || index < 0 || index >= q.options.length) return;
  if (state.answers[q.id] !== undefined) return;
  state.answers[q.id] = index;
  delete state.selected[q.id];
  if (state.mode === "exam") handleExamAnswer(q, index);
}

export function pressDigit(digit) {
  const q = state.questions[state.currentQ];
  if (!q) return;
  const idx = digit - 1;
  if (idx < 0 || idx >= q.options.length) return;

  if (state.mode === "exam") {
    state.answers[q.id] = idx;
    handleExamAnswer(q, idx);
  } else {
    state.selected[q.id] = idx;
  }
}

export function confirmPendingOrAdvance() {
  const q = state.questions[state.currentQ];
  if (!q) return false;

  const hasPending = state.mode !== "exam" && state.selected[q.id] !== undefined;
  const alreadyAnswered = state.answers[q.id] !== undefined;

  if (hasPending && !alreadyAnswered) {
    state.answers[q.id] = state.selected[q.id];
    delete state.selected[q.id];
    return true;
  }

  questionNext();
  return false;
}

export function questionPrev() {
  if (state.currentQ > 0) state.currentQ--;
}

export function jumpToQuestion(index) {
  if (index < 0 || index >= state.questions.length) return;
  state.currentQ = index;
}

/** +1 за верный ответ, −1 за неверный, 0 за пропущенный — новая метрика
 * поверх процента правильных (см. комментарий в шапке файла). */
export function computeScore() {
  let correct = 0;
  let incorrect = 0;
  state.questions.forEach((q) => {
    const a = state.answers[q.id];
    if (a === undefined) return;
    if (a === q.correctIndex) correct++;
    else incorrect++;
  });
  return { correct, incorrect, score: correct - incorrect };
}

export async function finishQuiz(forcedFail = false) {
  clearInterval(state.timerHandle ?? undefined);

  const isChapter = state.mode === "chapter";

  if (!forcedFail && Object.keys(state.answers).length === 0) {
    if (isChapter) returnToOrigin();
    else returnToMenu();
    return;
  }

  const { correct, incorrect, score } = computeScore();
  const total = state.questions.length;
  const pct = total ? Math.round((correct / total) * 100) : 0;
  const isExam = state.mode === "exam";
  const passed = isExam ? !forcedFail && !state.examFailed && state.examErrors <= 1 : null;

  const settings = state.user?.settings && typeof state.user.settings === "object" ? state.user.settings : {};
  const stats = settings.quiz_stats && typeof settings.quiz_stats === "object" ? settings.quiz_stats : {};
  const key = isExam ? "exam" : state.chapterId ? `chapter:${state.chapterId}` : "mixed";
  stats[key] = {
    ...(stats[key] || {}),
    passed: (stats[key]?.passed || 0) + (passed === true ? 1 : 0),
    failed: (stats[key]?.failed || 0) + (passed === false ? 1 : 0),
    answered: (stats[key]?.answered || 0) + correct,
    unanswered: (stats[key]?.unanswered || 0) + (total - Object.keys(state.answers).length),
  };
  if (state.user) {
    state.user.settings = { ...settings, quiz_stats: stats };
    api.updateSettings(state.token, state.user.settings).catch(() => {});
  }

  if (isChapter) {
    toast(`Готово: ${correct} из ${total} правильно · баллы: ${score >= 0 ? "+" : ""}${score}`, "info", 6000);
    returnToOrigin();
    return;
  }

  state.reviewIndex = 0;
  state.screen = "result";
  setHint(HINT_RESULT);
  state.lastResult = { correct, incorrect, total, pct, passed, isExam, score };
}

export function reviewMove(delta) {
  const n = state.questions.length;
  if (!n) return;
  state.reviewIndex = Math.max(0, Math.min(n - 1, state.reviewIndex + delta));
}

export function reviewJumpTo(index) {
  const n = state.questions.length;
  if (!n || index < 0 || index >= n) return;
  state.reviewIndex = index;
}

export function retryQuiz() {
  if (state.mode === "chapter") {
    if (state.multiChapterIds) {
      const chosen = state.chapters.filter((c) => state.multiChapterIds.includes(c.id));
      beginQuiz("chapter", chosen);
    } else {
      const c = state.chapters.find((x) => x.id === state.chapterId);
      beginQuiz("chapter", c);
    }
  } else if (state.mode === "random") {
    beginQuiz("random", null, state.randomCount);
  } else {
    beginQuiz(state.mode);
  }
}

/* ============================================================
   MENU
   ============================================================ */

export function menuMove(delta) {
  state.menuIndex = (state.menuIndex + delta + MENU_ITEMS.length) % MENU_ITEMS.length;
}

export function menuDigit(digit) {
  if (digit < 1 || digit > MENU_ITEMS.length) return;
  state.menuIndex = digit - 1;
  menuConfirm();
}

export function menuConfirm() {
  const choice = MENU_ITEMS[state.menuIndex].id;
  if (choice === "chapter") {
    state.chapterIndex = 0;
    state.checkedChapters = new Set();
    state.screen = "chapters";
    setHint(HINT_CHAPTERS);
  } else if (choice === "random") {
    state.screen = "random-count";
    setHint(HINT_RANDOM_COUNT);
  } else if (choice === "exam") {
    beginQuiz("exam");
  }
}

export function returnToMenu() {
  clearInterval(state.timerHandle ?? undefined);
  state.screen = "menu";
  setHint(HINT_MENU);
}

export async function requestExit() {
  if (state.screen !== "question") return;
  const ok = await confirmDialog({
    title: "Выйти из теста?",
    text: "Текущий прогресс не будет сохранён. Вы уверены, что хотите выйти?",
    confirmLabel: "Да, выйти",
    cancelLabel: "Остаться",
    danger: true,
  });
  if (ok) returnToOrigin();
}

export async function requestFinish() {
  if (state.screen !== "question") return;
  const ok = await confirmDialog({
    title: "Завершить тест?",
    text: "Вопросы без ответа будут засчитаны как неотвеченные.",
    confirmLabel: "Да, завершить",
    cancelLabel: "Остаться",
    danger: true,
  });
  if (ok) finishQuiz();
}

export function returnToOrigin() {
  clearInterval(state.timerHandle ?? undefined);
  const origin = state.originScreen || "menu";
  if (origin === "chapters") {
    state.screen = "chapters";
    setHint(HINT_CHAPTERS);
  } else if (origin === "random-count") {
    state.screen = "random-count";
    setHint(HINT_RANDOM_COUNT);
  } else {
    returnToMenu();
  }
}

/* ============================================================
   CHAPTERS (мультивыбор чекбоксами)
   ============================================================ */

export function chaptersMove(delta) {
  const n = state.chapters.length;
  if (!n) return;
  state.chapterIndex = (state.chapterIndex + delta + n) % n;
}

export function toggleChapterCheck(chapter) {
  if (!chapter || !(chapter.count > 0)) return;
  if (state.checkedChapters.has(chapter.id)) state.checkedChapters.delete(chapter.id);
  else state.checkedChapters.add(chapter.id);
  // Set — Svelte 5 не видит мутацию сама, форсируем реактивность переприсваиванием.
  state.checkedChapters = new Set(state.checkedChapters);
}

export function chaptersConfirm() {
  const checked = [...state.checkedChapters];
  if (checked.length) {
    const chosen = state.chapters.filter((c) => checked.includes(c.id));
    beginQuiz("chapter", chosen);
    return;
  }
  const c = state.chapters[state.chapterIndex];
  if (!c || !(c.count > 0)) return;
  beginQuiz("chapter", c);
}

/* ============================================================
   RANDOM COUNT
   ============================================================ */

export function randomCountMove(delta) {
  const n = RANDOM_COUNT_OPTIONS.length;
  state.randomCountIndex = (state.randomCountIndex + delta + n) % n;
}

export function randomCountConfirm() {
  const count = RANDOM_COUNT_OPTIONS[state.randomCountIndex];
  beginQuiz("random", null, count);
}
