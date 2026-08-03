/**
 * Логика прохождения теста. Не знает про DOM (это render.js) и про то,
 * мышь это была или клавиатура (это controls.js) — просто набор операций
 * над state, вызываемых извне.
 */
import { state, MENU_ITEMS, RANDOM_COUNT_OPTIONS } from "./state.js";
import * as api from "./api.js";
import * as render from "./render.js";
import * as admin from "./admin.js";
import * as friends from "./friends.js";

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Пул вопросов по всем главам сразу — нужен режимам "random"/"exam".
 * Бэкенд не отдаёт вопросы одним запросом по всем главам разом
 * (только по одной главе за раз), поэтому тянем главы параллельно
 * и складываем в один массив. Кэшируем на сессию, чтобы не дёргать
 * сеть повторно при каждом заходе в "random"/"exam".
 */
async function getQuestionPool() {
  if (state.questionPoolCache) return state.questionPoolCache;

  const chapters = state.chapters.length ? state.chapters : await api.listChapters(state.token);
  const perChapter = await Promise.all(
    chapters.map((c) => api.listQuestions(state.token, c.id).catch(() => [])),
  );
  const pool = perChapter.flat();
  state.questionPoolCache = pool;
  return pool;
}

/**
 * mode: "chapter" | "random" | "exam".
 * chapterOrChapters — для "chapter": один объект главы ИЛИ массив глав
 * (мультивыбор через чекбоксы, см. toggleChapterCheck/chaptersConfirm).
 * count — для "random": сколько вопросов взять (см. randomCountConfirm).
 */
async function runQuiz(mode, chapterOrChapters, count) {
  state.mode = mode;
  state.currentQ = 0;
  state.answers = {};
  state.selected = {};
  state.examErrors = 0;
  state.examFailed = false;

  // Откуда вернуться, если выйти из теста незавершённым (см. controls.js
  // exit-confirm) — не всегда корень меню: если тест начали с экрана глав
  // или с выбора количества вопросов, логичнее вернуть именно туда.
  state.originScreen =
    mode === "chapter" ? "chapters" : mode === "random" ? "random-count" : "menu";

  let questions = [];
  let label = "";

  if (mode === "chapter") {
    if (Array.isArray(chapterOrChapters)) {
      // Мультивыбор: тянем вопросы каждой отмеченной главы и объединяем.
      const lists = await Promise.all(
        chapterOrChapters.map((c) => api.listQuestions(state.token, c.id)),
      );
      questions = shuffle(lists.flat());
      state.chapterId = null;
      state.multiChapterIds = chapterOrChapters.map((c) => c.id);
      label = `Главы: ${chapterOrChapters.map((c) => c.num ?? "?").join(", ")}`;
    } else {
      questions = await api.listQuestions(state.token, chapterOrChapters.id);
      state.chapterId = chapterOrChapters.id;
      state.multiChapterIds = null;
      label = chapterOrChapters.title;
    }
  } else if (mode === "random") {
    state.randomCount = count || state.randomCount || 10;
    const pool = await getQuestionPool();
    questions = shuffle(pool).slice(0, Math.min(state.randomCount, pool.length));
    label = `Случайный билет · ${questions.length} вопр.`;
  } else if (mode === "exam") {
    const pool = await getQuestionPool();
    questions = shuffle(pool).slice(0, Math.min(20, pool.length));
    label = "Контрольный экзамен";
  }

  state.questions = questions;
  render.$("q-total").textContent = questions.length;
  render.$("q-chapter-label").textContent = label;

  const timerEl = render.$("q-timer");
  if (mode === "exam") {
    timerEl.classList.remove("hidden");
    startTimer(900);
  } else {
    timerEl.classList.add("hidden");
    clearInterval(state.timerHandle);
  }

  render.showScreen("question");
  render.renderQuestion();
  updateQuestionHint();
}

/**
 * Публичная точка входа. Сеть может упасть (бэкенд недоступен, лицензия
 * протухла) — раньше beginQuiz отваливался необработанным промисом и экран
 * просто не менялся. Теперь ошибка видна и мы возвращаемся туда, откуда
 * тест запускали.
 */
export async function beginQuiz(mode, chapterOrChapters, count) {
  try {
    await runQuiz(mode, chapterOrChapters, count);
  } catch (err) {
    const msg = err instanceof api.ApiError ? err.message : "Не удалось загрузить вопросы";
    render.toast(msg, "error");
    returnToOrigin();
  }
}

function startTimer(seconds) {
  clearInterval(state.timerHandle);
  state.timerSeconds = seconds;
  render.updateTimerDisplay();
  state.timerHandle = setInterval(() => {
    state.timerSeconds--;
    render.updateTimerDisplay();
    if (state.timerSeconds <= 0) {
      clearInterval(state.timerHandle);
      finishQuiz();
    }
  }, 1000);
}

function updateQuestionHint() {
  render.setHint("↑↓ вариант · 1-9 ответить · Enter подтвердить · Space пропустить · ←→ вопрос · Esc выйти");
}

export function answerMove(delta) {
  const q = state.questions[state.currentQ];
  if (!q || !q.options.length) return;
  const current = state.selected[q.id] ?? state.answers[q.id] ?? 0;
  state.selected[q.id] = (current + delta + q.options.length) % q.options.length;
  render.renderQuestion();
}

export function skipQuestion() {
  delete state.selected[state.questions[state.currentQ]?.id];
  questionNext();
}

function firstUnanswered() {
  return state.questions.findIndex((q) => state.answers[q.id] === undefined);
}

export function questionNext() {
  if (state.currentQ < state.questions.length - 1) {
    state.currentQ++;
    render.renderQuestion();
    return;
  }
  const unanswered = firstUnanswered();
  if (unanswered >= 0) {
    state.currentQ = unanswered;
    render.renderQuestion();
    render.toast(`Остался вопрос ${unanswered + 1}`, "info");
  } else {
    finishQuiz();
  }
}

function handleExamAnswer(q, idx) {
  if (idx !== q.correctIndex) {
    state.examErrors += 1;
    if (state.examErrors >= 2) {
      state.examFailed = true;
      render.toast("Вторая ошибка. Экзамен прекращён: НЕЗАЧЁТ", "error");
      finishQuiz(true);
    }
  }
}

/**
 * Мышь: клик по варианту сразу фиксирует ответ и раскрывает цвета —
 * отдельного шага подтверждения не нужно, клик уже однозначное действие.
 */
export function selectOptionByClick(index) {
  const q = state.questions[state.currentQ];
  if (!q || index < 0 || index >= q.options.length) return;
  if (state.answers[q.id] !== undefined) return; // уже отвечен — повторный клик ничего не меняет
  state.answers[q.id] = index;
  delete state.selected[q.id];
  if (state.mode === "exam") {
    handleExamAnswer(q, index);
    if (state.examFailed) return;
  }
  render.renderQuestion();
}

/**
 * Клавиатура (не exam): цифра только подсвечивает вариант, ответ ещё
 * не зафиксирован — цвета не раскрываются, пока не придёт confirmPending().
 * В exam-режиме раскрытия цветов всё равно никогда не происходит, поэтому
 * там цифра сразу фиксирует ответ, как и было — доп. шаг не нужен.
 */
export function pressDigit(digit) {
  const q = state.questions[state.currentQ];
  if (!q) return;
  const idx = digit - 1;
  if (idx < 0 || idx >= q.options.length) return;

  if (state.mode === "exam") {
    state.answers[q.id] = idx;
    handleExamAnswer(q, idx);
    if (state.examFailed) return;
  } else {
    state.selected[q.id] = idx;
  }
  render.renderQuestion();
}

/**
 * Enter/Space на вопросе с клавиатуры: если есть неподтверждённый выбор —
 * подтверждает его (раскрывает цвета, остаётся на том же вопросе).
 * Если подтверждать нечего (уже отвечен, или ничего не выбрано, или exam) —
 * просто идёт дальше. Возвращает true, если это был именно "подтверждение"
 * (чтобы controls.js не переходил к следующему вопросу в этот же нажатие).
 */
export function confirmPendingOrAdvance() {
  const q = state.questions[state.currentQ];
  if (!q) return false;

  const hasPending = state.mode !== "exam" && state.selected[q.id] !== undefined;
  const alreadyAnswered = state.answers[q.id] !== undefined;

  if (hasPending && !alreadyAnswered) {
    state.answers[q.id] = state.selected[q.id];
    delete state.selected[q.id];
    render.renderQuestion();
    return true;
  }

  questionNext();
  return false;
}



export function questionPrev() {
  if (state.currentQ > 0) {
    state.currentQ--;
    render.renderQuestion();
  }
}

/** Клик по точке в навигаторе — переход к любому вопросу напрямую, не только соседнему. */
export function jumpToQuestion(index) {
  if (index < 0 || index >= state.questions.length) return;
  state.currentQ = index;
  render.renderQuestion();
}

export async function finishQuiz(forcedFail = false) {
  clearInterval(state.timerHandle);

  let correct = 0;
  state.questions.forEach((q) => {
    if (state.answers[q.id] === q.correctIndex) correct++;
  });
  const total = state.questions.length;
  const pct = total ? Math.round((correct / total) * 100) : 0;
  const isExam = state.mode === "exam";
  const passed = isExam ? !forcedFail && !state.examFailed && state.examErrors <= 1 : null; // экзамен: максимум одна ошибка
  const settings = state.user?.settings && typeof state.user.settings === "object" ? state.user.settings : {};
  const stats = settings.quiz_stats && typeof settings.quiz_stats === "object" ? settings.quiz_stats : {};
  const key = isExam ? "exam" : state.chapterId ? `chapter:${state.chapterId}` : "mixed";
  stats[key] = { ...(stats[key] || {}), passed: (stats[key]?.passed || 0) + (passed === true ? 1 : 0), failed: (stats[key]?.failed || 0) + (passed === false ? 1 : 0), answered: (stats[key]?.answered || 0) + correct, unanswered: (stats[key]?.unanswered || 0) + (total - Object.keys(state.answers).length) };
  if (state.user) { state.user.settings = { ...settings, quiz_stats: stats }; api.updateSettings(state.token, state.user.settings).catch(() => {}); }

  render.showScreen("result");
  render.renderResult({ correct, total, pct, passed, isExam });

  state.reviewIndex = 0;
  render.buildReview();
  render.setHint("↑↓ или клик — разбор ответов · Enter — пройти ещё раз · Esc — в меню");
}

export function reviewMove(delta) {
  const n = state.questions.length;
  if (!n) return;
  state.reviewIndex = Math.max(0, Math.min(n - 1, state.reviewIndex + delta));
  render.updateReviewActive();
  render.scrollActiveReviewIntoView();
}

export function reviewJumpTo(index) {
  const n = state.questions.length;
  if (!n || index < 0 || index >= n) return;
  state.reviewIndex = index;
  render.updateReviewActive();
}

/** "Пройти ещё раз" на экране результата — тот же режим/выбор заново. */
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

export function menuDigit(digit) {
  if (digit < 1 || digit > MENU_ITEMS.length) return;
  state.menuIndex = digit - 1;
  render.renderMenu();
  menuConfirm();
}

export function menuMove(delta) {
  state.menuIndex = (state.menuIndex + delta + MENU_ITEMS.length) % MENU_ITEMS.length;
  render.renderMenu();
}

export function menuConfirm() {
  const choice = MENU_ITEMS[state.menuIndex].id;
  if (choice === "chapter") {
    state.chapterIndex = 0;
    state.checkedChapters = new Set();
    render.showScreen("chapters");
    render.renderChapters();
    render.setHint("↑↓ выбрать · Space/клик по ☐ отметить · Enter начать · Esc в меню");
    admin.refreshEditorQuestions();
  } else if (choice === "random") {
    render.showScreen("random-count");
    render.renderRandomCount();
    render.setHint("↑↓ выбрать количество · Enter начать · Esc в меню");
  } else if (choice === "exam") {
    beginQuiz("exam");
  }
}

export function returnToMenu() {
  clearInterval(state.timerHandle);
  render.showScreen("menu");
  render.renderMenu();
  render.setHint("↑↓ выбрать · Enter принять");
}

/**
 * Выход из теста ДО его завершения — по Esc или кнопке "Выйти". Тематическая
 * модалка (render.confirmDialog) вместо браузерного confirm(), возвращает
 * туда, откуда тест начали настраивать (см. returnToOrigin).
 */
export async function requestExit() {
  if (state.screen !== "question") return;
  const ok = await render.confirmDialog({
    title: "Выйти из теста?",
    text: "Текущий прогресс не будет сохранён. Вы уверены, что хотите выйти?",
    confirmLabel: "Да, выйти",
    cancelLabel: "Остаться",
    danger: true,
  });
  if (ok) returnToOrigin();
}

/**
 * Выход из НЕЗАВЕРШЁННОГО теста — возвращает туда, где тест начали
 * настраивать (главы / выбор количества), а не сразу в корень меню.
 * Экзамен стартует прямо с меню (нет промежуточного экрана выбора),
 * поэтому для него originScreen и так "menu" — ведёт себя как returnToMenu.
 */
export function returnToOrigin() {
  clearInterval(state.timerHandle);
  const origin = state.originScreen || "menu";
  if (origin === "chapters") {
    render.showScreen("chapters");
    render.renderChapters();
    render.setHint("↑↓ выбрать · Space/клик по ☐ отметить · Enter начать · Esc в меню");
  } else if (origin === "random-count") {
    render.showScreen("random-count");
    render.renderRandomCount();
    render.setHint("↑↓ выбрать количество · Enter начать · Esc в меню");
  } else {
    returnToMenu();
  }
}

/* ============================================================
   CHAPTERS (мультивыбор чекбоксами)
   ============================================================ */

export async function loadChapters() {
  // Ошибку сети нельзя выпускать наружу: auth.tryAutoLogin() ловит любое
  // исключение из enterApp() как признак невалидного токена и разлогинивает,
  // то есть упавший на минуту бэкенд стирал сохранённую сессию.
  try {
    state.chapters = await api.listChapters(state.token);
  } catch (err) {
    state.chapters = [];
    render.toast(err instanceof api.ApiError ? err.message : "Нет связи с сервером", "error");
  }
  state.questionPoolCache = null; // главы обновились — старый кэш пула вопросов больше не актуален
  render.renderMenuMeta();
}

export function chaptersMove(delta) {
  const n = state.chapters.length;
  if (!n) return;
  state.chapterIndex = (state.chapterIndex + delta + n) % n;
  render.renderChapters();
  admin.refreshEditorQuestions();
}

export function toggleChapterCheck(chapter) {
  if (!chapter || !(chapter.count > 0)) return;
  if (state.checkedChapters.has(chapter.id)) state.checkedChapters.delete(chapter.id);
  else state.checkedChapters.add(chapter.id);
  render.renderChapters();
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
  render.renderRandomCount();
}

export function randomCountConfirm() {
  const count = RANDOM_COUNT_OPTIONS[state.randomCountIndex];
  beginQuiz("random", null, count);
}

/* ============================================================
   PROFILE
   ============================================================ */

export function openProfile() {
  // Если уже на профиле (повторный клик по аккаунту) — не затираем прежний
  // profileReturnScreen текущим "profile", иначе Esc/кнопка "Назад" начинают
  // возвращать на сам профиль и выйти из него становится нельзя.
  if (state.screen !== "profile") {
    state.profileReturnScreen = state.screen;
  }
  render.showScreen("profile");
  render.renderProfile(state.user);
  render.setHint("Esc — назад");
  friends.loadFriends();
  if (state.user.user_type === "admin") {
    admin.loadLicenses();
  }
}

export function closeProfile() {
  render.showScreen(state.profileReturnScreen);
  if (state.profileReturnScreen === "menu") {
    render.setHint("↑↓ выбрать · Enter принять");
  } else if (state.profileReturnScreen === "chapters") {
    render.setHint("↑↓ выбрать · Space/клик по ☐ отметить · Enter начать · Esc в меню");
  }
}
