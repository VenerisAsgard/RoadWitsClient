/**
 * Логика прохождения теста. Не знает про DOM (это render.js) и про то,
 * мышь это была или клавиатура (это controls.js) — просто набор операций
 * над state, вызываемых извне.
 */
import { state, MENU_ITEMS } from "./state.js";
import * as api from "./api.js";
import * as render from "./render.js";
import * as admin from "./admin.js";

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

export async function beginQuiz(mode, chapter) {
  state.mode = mode;
  state.chapterId = chapter ? chapter.id : null;
  state.currentQ = 0;
  state.answers = {};
  state.selected = {};

  let questions = [];
  if (mode === "chapter") {
    questions = await api.listQuestions(state.token, chapter.id);
  } else if (mode === "random") {
    questions = shuffle(await getQuestionPool()).slice(0, 5);
  } else if (mode === "exam") {
    const pool = await getQuestionPool();
    questions = shuffle(pool).slice(0, Math.min(20, pool.length));
  }

  state.questions = questions;
  render.$("q-total").textContent = questions.length;
  render.$("q-chapter-label").textContent =
    mode === "chapter"
      ? chapter.title
      : mode === "random"
        ? "Случайный билет"
        : "Контрольный экзамен";

  const timerEl = render.$("q-timer");
  if (mode === "exam") {
    timerEl.classList.remove("hidden");
    startTimer(questions.length * 60);
  } else {
    timerEl.classList.add("hidden");
    clearInterval(state.timerHandle);
  }

  render.showScreen("question");
  render.setSignal("active");
  render.renderQuestion();
  updateQuestionHint();
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
  render.setHint("1-4 ответить · Space/Enter далее · ←назад · Esc выйти");
}

/**
 * Мышь: клик по варианту сразу фиксирует ответ и раскрывает цвета —
 * отдельного шага подтверждения не нужно, клик уже однозначное действие.
 */
export function selectOptionByClick(index) {
  const q = state.questions[state.currentQ];
  if (!q || index < 0 || index >= q.options.length) return;
  state.answers[q.id] = index;
  delete state.selected[q.id];
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

export function questionNext() {
  if (state.currentQ < state.questions.length - 1) {
    state.currentQ++;
    render.renderQuestion();
  } else {
    finishQuiz();
  }
}

export function questionPrev() {
  if (state.currentQ > 0) {
    state.currentQ--;
    render.renderQuestion();
  }
}

export async function finishQuiz() {
  clearInterval(state.timerHandle);

  let correct = 0;
  state.questions.forEach((q) => {
    if (state.answers[q.id] === q.correctIndex) correct++;
  });
  const total = state.questions.length;
  const pct = total ? Math.round((correct / total) * 100) : 0;
  const passed = pct >= 80;

  render.showScreen("result");
  render.setSignal(passed ? "pass" : "fail");
  render.renderResult({ correct, total, pct, passed });

  state.reviewIndex = 0;
  render.buildReview();
  render.setHint("↑↓ разбор ответов · Enter ещё раз · Esc в меню");
}

export function reviewMove(delta) {
  const n = state.questions.length;
  if (!n) return;
  state.reviewIndex = Math.max(0, Math.min(n - 1, state.reviewIndex + delta));
  render.buildReview();
  render.scrollActiveReviewIntoView();
}

export function reviewJumpTo(index) {
  const n = state.questions.length;
  if (!n || index < 0 || index >= n) return;
  state.reviewIndex = index;
  render.buildReview();
}

/* ============================================================
   MENU
   ============================================================ */

export function menuMove(delta) {
  state.menuIndex = (state.menuIndex + delta + MENU_ITEMS.length) % MENU_ITEMS.length;
  render.renderMenu();
}

export function menuConfirm() {
  const choice = MENU_ITEMS[state.menuIndex].id;
  if (choice === "chapter") {
    state.chapterIndex = 0;
    render.showScreen("chapters");
    render.renderChapters();
    render.setHint("↑↓ выбрать главу · Enter начать · Esc в меню");
    render.setSignal("idle");
    admin.refreshEditorQuestions();
  } else if (choice === "random") {
    beginQuiz("random");
  } else if (choice === "exam") {
    beginQuiz("exam");
  }
}

export function returnToMenu() {
  clearInterval(state.timerHandle);
  render.showScreen("menu");
  render.setSignal("idle");
  render.renderMenu();
  render.setHint("↑↓ выбрать · Enter принять");
}

/* ============================================================
   CHAPTERS
   ============================================================ */

export async function loadChapters() {
  state.chapters = await api.listChapters(state.token);
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

export function chaptersConfirm() {
  const c = state.chapters[state.chapterIndex];
  if (!c || !(c.count > 0)) return;
  beginQuiz("chapter", c);
}

/* ============================================================
   PROFILE
   ============================================================ */

export function openProfile() {
  state.profileReturnScreen = state.screen;
  render.showScreen("profile");
  render.renderProfile(state.user);
  render.setSignal("idle");
  render.setHint("Esc — назад");
  if (state.user.user_type === "admin") {
    admin.loadLicenses();
  }
}

export function closeProfile() {
  render.showScreen(state.profileReturnScreen);
  if (state.profileReturnScreen === "menu") {
    render.setHint("↑↓ выбрать · Enter принять");
  } else if (state.profileReturnScreen === "chapters") {
    render.setHint("↑↓ выбрать главу · Enter начать · Esc в меню");
  }
}
