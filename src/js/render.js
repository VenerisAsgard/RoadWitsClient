/**
 * Единственное место, которое пишет в DOM. quiz.js/admin.js/auth.js меняют
 * state и вызывают нужную render-функцию — сами DOM не трогают, и уж тем
 * более не делают fetch (это api.js через quiz.js/admin.js). Если понадобится
 * сменить способ рендера, менять нужно будет только этот файл.
 */
import {
  state,
  MENU_ITEMS,
  RANDOM_COUNT_OPTIONS,
  ROLE_LABELS,
  canEditContent,
  isAdmin,
  isLightTheme,
} from "./state.js";

export const $ = (id) => document.getElementById(id);

export function applyTheme() { document.documentElement.dataset.theme = isLightTheme() ? "light" : "dark"; }
export function renderConnection(status, detail = "") {
  const el = $("connection-status"); if (!el) return;
  el.dataset.status = status;
  // При "offline" причиной часто оказывается включённый VPN, который рвёт
  // соединение с сервером, — подсказку выводим прямо в тексте статуса
  // (а не только в title), иначе её почти никто не замечает.
  el.textContent =
    status === "ok" ? "Сервер: онлайн" :
    status === "degraded" ? "Сервер: проблемы" :
    "Сервер: нет связи — попробуйте отключить VPN";
  el.title = detail;
}

/**
 * Версия приложения — отдельный элемент рядом со статусом сервера в
 * status-bar (не часть его textContent: так своя стилизация и не нужно
 * склеивать/расклеивать строку на каждый вызов renderConnection, который
 * дёргается раз в HEALTHCHECK_POLL_MS). См. device.getAppVersion(), main.js.
 */
export function renderAppVersion(version) {
  const el = $("app-version");
  if (!el) return;
  el.textContent = version ? `v${version}` : "";
}

/* ============================================================
   Всё, что пришло с бэкенда или было введено редактором, вставляется
   через innerHTML — значит, обязано экранироваться. Раньше этого не
   было: глава с названием вроде "Знаки <особые>" ломала разметку списка,
   а вопрос с HTML в тексте выполнялся как разметка.
   ============================================================ */

function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/* ============================================================
   Тосты — короткие сообщения вместо alert(). alert блокирует
   окно, выглядит как браузер, а в открытой модалке ещё и перекрывает
   форму, которую пользователь как раз заполняет.
   ============================================================ */

export function toast(message, type = "info", ttl = 4200) {
  let stack = $("toast-stack");
  if (!stack) {
    // на случай, если разметка почему-то не содержит контейнер — тост всё
    // равно должен быть виден, а не тихо потеряться.
    stack = document.createElement("div");
    stack.id = "toast-stack";
    stack.className = "toast-stack";
    document.body.appendChild(stack);
  }
  const el = document.createElement("div");
  el.className = "toast" + (type === "error" ? " toast-error" : type === "success" ? " toast-success" : type === "info" ? " toast-info" : "");
  el.textContent = message;
  stack.appendChild(el);
  window.setTimeout(() => {
    el.classList.add("toast-out");
    window.setTimeout(() => el.remove(), 260);
  }, ttl);
}

/* ============================================================
   Просмотр иллюстрации во весь экран.
   ============================================================ */

export function openImageViewer(src) {
  if (!src) return;
  $("image-viewer-img").src = src;
  const viewer = $("image-viewer");
  viewer.classList.remove("hidden");
  viewer.setAttribute("aria-hidden", "false");
}

export function closeImageViewer() {
  const viewer = $("image-viewer");
  viewer.classList.add("hidden");
  viewer.setAttribute("aria-hidden", "true");
  $("image-viewer-img").removeAttribute("src");
}

export function isImageViewerOpen() {
  return !$("image-viewer").classList.contains("hidden");
}

/* ============================================================
   Сплэш — оверлей внутри главного окна, не отдельное Tauri-окно.
   ============================================================ */

export function hideSplash() {
  const el = $("splash-overlay");
  el.classList.add("splash-hidden");
  window.setTimeout(() => el.classList.add("hidden"), 250);
}

/* ============================================================
   Переключение login-view <-> app-shell
   ============================================================ */

export function showLogin() {
  $("app-shell").classList.add("hidden");
  $("account-chip").classList.add("hidden");
  $("leaderboard-btn").classList.add("hidden");
  $("logout-button").classList.add("hidden");
  $("check-updates-btn").classList.add("hidden");
  $("login-view").classList.remove("hidden");

  $("login-error").classList.add("hidden");
  $("login-error").textContent = "";
  $("product-key").value = "";
  setLoginSubmitting(false);
}

export function showApp() {
  $("login-view").classList.add("hidden");
  $("app-shell").classList.remove("hidden");
  $("account-chip").classList.remove("hidden");
  $("leaderboard-btn").classList.remove("hidden");
  $("logout-button").classList.remove("hidden");
  $("check-updates-btn").classList.remove("hidden");
}

export function setLoginSubmitting(submitting) {
  const btn = $("login-submit");
  btn.disabled = submitting;
  btn.textContent = submitting ? "Входим..." : "Войти";
}

export function showLoginError(message) {
  const el = $("login-error");
  el.textContent = message;
  el.classList.remove("hidden");
}

function formatDate(iso) {
  try {
    return new Date(iso).toLocaleDateString("ru-RU", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}

/* ============================================================
   Аватар — инициалы + детерминированный цвет по id как фолбэк, либо
   фото профиля, если оно задано (User.profile_photo на бэкенде,
   см. auth.py/user.py — это личные данные, а не произвольная настройка).
   ============================================================ */

function initialsOf(user) {
  const first = (user.first_name || "").trim();
  const last = (user.last_name || "").trim();
  if (first || last) return ((first[0] || "") + (last[0] || "")).toUpperCase();
  if (user.email) return user.email[0].toUpperCase();
  return "U";
}

function avatarHueOf(user) {
  return (user.id * 47) % 360;
}

/** Красит один DOM-узел .avatar под конкретного пользователя — общая
 * логика для чипа в титлбаре, карточки профиля и строк лидерборда. */
export function paintAvatar(el, user) {
  const photo = user.profile_photo;
  el.textContent = photo ? "" : initialsOf(user);
  el.style.background = photo ? `url(${photo}) center/cover` : `hsl(${avatarHueOf(user)}, 55%, 40%)`;
}

export function renderAccountChip(user) {
  paintAvatar($("account-avatar"), user);

  const fullName = [user.first_name, user.last_name].filter(Boolean).join(" ");
  $("account-name").textContent = fullName || user.email || `Пользователь #${user.id}`;
  $("account-role").textContent = ROLE_LABELS[user.user_type] || user.user_type;
}

/* ============================================================
   Подсказка клавиш
   ============================================================ */

/* ============================================================
   Подсказка клавиш — рендерится как ряд "чипов" ⌨️ (клавиша(и) + подпись),
   а не голым текстом с точками-разделителями. Esc сюда принципиально не
   попадает: везде, где раньше писали "Esc — назад/в меню/выйти", уже есть
   отдельная кнопка "← Назад"/"Выйти" для мыши/тача — Esc продолжает
   работать как раньше (см. controls.js), просто не рекламируется текстом.
   ============================================================ */

export function setHint(groups) {
  const el = $("hint-keys");
  const bar = $("hint-bar");
  const empty = state.screen === "menu" || !groups || !groups.length;
  // Пустая плашка подсказок — просто серая полоса без смысла (см. правку
  // "прятать hint-bar, если подсказок нет"): не просто чистим текст, а
  // убираем саму панель из раскладки, чтобы она не занимала место.
  if (bar) bar.classList.toggle("hidden", empty);
  if (empty) {
    el.innerHTML = "";
    return;
  }
  el.innerHTML = groups
    .map(
      ({ keys, label }) =>
        `<span class="hint-group">${keys.map((k) => `<kbd>${escapeHtml(k)}</kbd>`).join("")}<span class="hint-label">${escapeHtml(label)}</span></span>`,
    )
    .join("");
}

/* ============================================================
   Переключение экранов внутри app-shell
   ============================================================ */

const SCREENS = ["menu", "chapters", "random-count", "question", "result", "profile"];

export function showScreen(name) {
  state.screen = name;
  SCREENS.forEach((s) => {
    $(`screen-${s}`).classList.toggle("hidden", s !== name);
  });
}

/* ============================================================
   MENU
   ============================================================ */

export function renderMenu() {
  const list = $("menu-list");
  list.innerHTML = "";
  MENU_ITEMS.forEach((item, i) => {
    const li = document.createElement("li");
    li.className = "menu-item" + (i === state.menuIndex ? " active" : "");
    li.dataset.index = String(i);
    li.innerHTML = `
      <span class="m-index">${String(i + 1).padStart(2, "0")}</span>
      <span class="m-body">
        <span class="m-title">${item.title}</span>
        <span class="m-sub">${item.sub}</span>
      </span>
    `;
    list.appendChild(li);
  });
}

export function renderMenuMeta() {
  const totalQ = state.chapters.reduce((s, c) => s + (c.count || 0), 0);
  $("menu-total-q").textContent = totalQ ? `${totalQ} вопросов` : "— вопросов";
  $("menu-total-ch").textContent = `${state.chapters.length} глав`;
}

/* ============================================================
   CHAPTERS
   ============================================================ */

function renderChaptersToolbar() {
  const editable = canEditContent();
  $("chapters-toolbar").classList.toggle("hidden", !editable);
  // Создание глав теперь разрешено и editor, и admin — см. POST /chapters
  // на бэкенде (require_editor_or_admin). Раньше здесь стояло isAdmin(),
  // из-за чего кнопка была не видна редактору, хотя бэкенд уже разрешал —
  // теперь оба места согласованы.
  $("chapter-add-btn").classList.toggle("hidden", !editable);
  const editToggle = $("chapters-edit-toggle");
  editToggle.classList.toggle("hidden", !editable);
  editToggle.classList.toggle("active", state.editMode);
}

export function renderChapters() {
  const list = $("chapter-list");
  list.innerHTML = "";
  const editable = canEditContent();

  state.chapters.forEach((c, i) => {
    const li = document.createElement("li");
    const hasQuestions = (c.count || 0) > 0;
    const checked = state.checkedChapters.has(c.id);
    li.className =
      "chapter-item" +
      (i === state.chapterIndex ? " active" : "") +
      (hasQuestions ? "" : " empty") +
      (checked ? " checked" : "");
    li.dataset.index = String(i);

    let controls = "";
    if (editable && state.editMode) {
      controls += `<button class="icon-btn tiny" data-action="rename-chapter" title="Переименовать">✏️</button>`;
      if (isAdmin()) {
        controls += `<button class="icon-btn tiny danger" data-action="delete-chapter" title="Удалить">❌</button>`;
      }
    }

    li.innerHTML = `
      <span class="c-checkbox" data-role="checkbox" role="checkbox" aria-checked="${checked}">${checked ? "☑" : "☐"}</span>
      <span class="c-num">${String(c.num ?? i + 1).padStart(2, "0")}</span>
      <span class="c-title">${escapeHtml(c.title)}</span>
      ${controls ? `<span class="c-controls">${controls}</span>` : ""}
    `;
    list.appendChild(li);
  });

  renderChaptersToolbar();
  renderChapterDetail();
  const active = list.querySelector(".chapter-item.active");
  if (active) active.scrollIntoView({ block: "nearest" });
}

export function renderChapterDetail() {
  const c = state.chapters[state.chapterIndex];
  const wrap = $("chapter-detail");
  if (!c) {
    wrap.innerHTML = `<p class="loading">Нет глав. ${canEditContent() ? "Добавь первую кнопкой + сверху." : ""}</p>`;
    return;
  }
  const hasQuestions = (c.count || 0) > 0;
  const editable = canEditContent();
  const checkedCount = state.checkedChapters.size;

  const startLabel = checkedCount
    ? `Начать по ${checkedCount} ${checkedCount === 1 ? "главе" : "главам"}`
    : hasQuestions
      ? "Начать тренировку"
      : "Нет вопросов";
  const startDisabled = !checkedCount && !hasQuestions;

  wrap.innerHTML = `
    <p class="d-eyebrow">Глава ${c.num ?? state.chapterIndex + 1}</p>
    <h2>${escapeHtml(c.title)}</h2>
    <p class="d-desc">${escapeHtml(c.description)}</p>
    <p class="d-count">${c.count ?? 0} вопросов в главе</p>
    ${checkedCount ? `<p class="d-selected">Отмечено глав: ${checkedCount}</p>` : ""}
    <p class="d-hint">Space или клик по ☐ — отметить главу (можно несколько)</p>
    <button id="chapter-start-btn" class="chapter-start" ${startDisabled ? "disabled" : ""}>${startLabel}</button>
    ${
      editable
        ? `
      <div class="questions-manage">
        <div class="questions-manage-header">
          <p class="panel-label">Вопросы главы</p>
          <button class="icon-btn" id="question-add-btn" type="button" title="Добавить вопрос">➕</button>
        </div>
        <ul class="editor-question-list" id="editor-question-list">
          <li class="loading">Загрузка…</li>
        </ul>
      </div>
    `
        : ""
    }
  `;
}

export function renderEditorQuestionList(questions) {
  const list = $("editor-question-list");
  if (!list) return; // деталь главы уже перерисована на что-то другое — не наш случай
  if (!questions.length) {
    list.innerHTML = `<li class="loading">Вопросов пока нет.</li>`;
    return;
  }
  list.innerHTML = "";
  questions.forEach((q, i) => {
    const li = document.createElement("li");
    li.className = "editor-question-item";
    li.dataset.id = String(q.id);
    li.innerHTML = `
      <span class="eq-num">${i + 1}</span>
      <span class="eq-text">${escapeHtml(q.text)}</span>
      <span class="eq-controls">
        <button class="icon-btn tiny" data-action="edit-question" title="Редактировать">✏️</button>
        <button class="icon-btn tiny danger" data-action="delete-question" title="Удалить">❌</button>
      </span>
    `;
    list.appendChild(li);
  });
}

/* ============================================================
   RANDOM COUNT — сколько вопросов взять для случайного билета
   ============================================================ */

export function renderRandomCount() {
  const list = $("random-count-list");
  list.innerHTML = "";
  RANDOM_COUNT_OPTIONS.forEach((count, i) => {
    const li = document.createElement("li");
    li.className = "menu-item" + (i === state.randomCountIndex ? " active" : "");
    li.dataset.index = String(i);
    li.innerHTML = `
      <span class="m-index">${String(i + 1).padStart(2, "0")}</span>
      <span class="m-body">
        <span class="m-title">${count} вопросов</span>
        <span class="m-sub">Случайная подборка из базы вопросов</span>
      </span>
    `;
    list.appendChild(li);
  });
}

/* ============================================================
   QUESTION (прохождение теста)
   ============================================================ */

export function renderQuestion() {
  const q = state.questions[state.currentQ];
  if (!q) return;
  const phase = $("q-phase");
  const phaseNav = $("q-phase-nav");
  const showPhaseNav = state.mode === "random" && state.questions.length > 10;
  if (phaseNav) phaseNav.classList.toggle("hidden", !showPhaseNav);
  if (phase) {
    const totalPhases = Math.ceil(state.questions.length / 10);
    phase.textContent = showPhaseNav ? `Фаза ${Math.floor(state.currentQ / 10) + 1} из ${totalPhases}` : "";
  }
  if (showPhaseNav) {
    const totalPhases = Math.ceil(state.questions.length / 10);
    const currentPhase = Math.floor(state.currentQ / 10);
    $("q-phase-prev").disabled = currentPhase === 0;
    $("q-phase-next").disabled = currentPhase === totalPhases - 1;
  }

  const imgWrap = $("q-image-wrap");
  if (q.image) {
    imgWrap.classList.remove("hidden");
    $("q-image").src = q.image;
  } else {
    imgWrap.classList.add("hidden");
  }

  $("q-text").textContent = q.text;

  const optsWrap = $("q-options");
  optsWrap.innerHTML = "";

  const confirmed = state.answers[q.id];
  const pending = state.selected[q.id];
  const revealed = state.mode !== "exam" && confirmed !== undefined;
  const highlighted = confirmed !== undefined ? confirmed : pending;

  q.options.forEach((opt, i) => {
    const li = document.createElement("li");
    li.className = "q-option";
    li.dataset.index = String(i);
    if (highlighted === i) li.classList.add("selected");
    if (revealed) {
      if (i === q.correctIndex) li.classList.add("correct");
      else if (i === confirmed) li.classList.add("wrong");
    }
    li.innerHTML = `<span class="o-key">${i + 1}</span><span>${escapeHtml(opt)}</span>`;
    optsWrap.appendChild(li);
  });

  $("q-answer-value").textContent = confirmed === undefined ? "_" : String(confirmed + 1);

  const explainEl = $("q-explain");
  if (revealed && q.explanation) {
    explainEl.textContent = q.explanation;
    explainEl.classList.remove("hidden");
  } else {
    explainEl.classList.add("hidden");
    explainEl.textContent = "";
  }

  // Продолжить — заменяет собой прежнюю постоянную кнопку "Завершить" под
  // вопросом: появляется только когда на текущий вопрос уже есть
  // подтверждённый ответ, а не с самого начала (см. правку про кнопки).
  const continueBtn = $("q-btn-continue");
  if (continueBtn) continueBtn.classList.toggle("hidden", confirmed === undefined);

  renderQuestionNav();
}

/**
 * Навигация под топбаром — ровно один из двух вариантов одновременно:
 *  - "вкладки" (точки) для random/exam — но не все сразу: только точки
 *    текущей "фазы" из 10 вопросов, следующие 10 подменяют их, когда
 *    прохождение до них доходит (currentQ переходит в следующий десяток).
 *  - для chapter — простые стрелки назад/вперёд со счётчиком "N / всего",
 *    без вкладок и без результата в конце (см. quiz.finishQuiz).
 */
function renderQuestionNav() {
  const dotsWrap = $("q-dots");
  const arrowNav = $("q-arrow-nav");
  const isChapter = state.mode === "chapter";

  arrowNav.classList.toggle("hidden", !isChapter);
  dotsWrap.classList.toggle("hidden", isChapter);

  if (isChapter) {
    $("q-arrow-counter").textContent = `${state.currentQ + 1} / ${state.questions.length}`;
    $("q-prev-btn").disabled = state.currentQ === 0;
    return;
  }

  dotsWrap.innerHTML = "";
  const start = Math.floor(state.currentQ / 10) * 10;
  const end = Math.min(start + 10, state.questions.length);
  for (let i = start; i < end; i++) {
    const q = state.questions[i];
    const answerIdx = state.answers[q.id];
    const revealed = state.mode !== "exam";

    let squareState = "empty";
    if (answerIdx !== undefined) {
      squareState = revealed ? (answerIdx === q.correctIndex ? "correct" : "wrong") : "answered";
    }

    const dot = document.createElement("button");
    dot.type = "button";
    dot.className = "q-dot" + (i === state.currentQ ? " current" : "");
    dot.dataset.state = squareState;
    dot.dataset.index = String(i);
    dot.title = `Вопрос ${i + 1}`;
    dot.textContent = String(i + 1);
    dotsWrap.appendChild(dot);
  }
}

export function updateTimerDisplay() {
  const m = Math.floor(state.timerSeconds / 60).toString().padStart(2, "0");
  const s = (state.timerSeconds % 60).toString().padStart(2, "0");
  $("q-timer").textContent = `${m}:${s}`;
}

/* ============================================================
   RESULT
   ============================================================ */

const GAUGE_CIRCUMFERENCE = 540;

export function renderResult({ correct, total, pct, passed, isExam }) {
  const gaugeFill = $("gauge-fill");
  // Тренировка (по главам/случайный билет) — не тест, вердикта "сдал/не сдал"
  // для неё не существует, датчик просто нейтрального цвета.
  const color = isExam ? (passed ? "var(--green)" : "var(--red)") : "var(--amber)";
  gaugeFill.style.stroke = color;
  gaugeFill.style.strokeDashoffset = String(GAUGE_CIRCUMFERENCE);
  const offset = GAUGE_CIRCUMFERENCE - (GAUGE_CIRCUMFERENCE * pct) / 100;
  requestAnimationFrame(() => {
    gaugeFill.style.strokeDashoffset = String(offset);
  });

  $("gauge-score").textContent = `${correct} из ${total}`;
  $("gauge-verdict").textContent = isExam ? (passed ? "Сдал" : "Не сдал") : "Готово";
  const errors = $("result-errors");
  if (errors) {
    errors.classList.toggle("hidden", !isExam);
    errors.textContent = isExam ? `Ошибок: ${state.examErrors} из 1 допустимой` : "";
  }
  $("result-summary").textContent = `Правильно: ${correct} из ${total}`;
}

/**
 * Разбор ответов на экране результата — переиспользует те же классы
 * (.q-dot/.q-body/.q-options и т.д.), что и сам экран прохождения теста,
 * чтобы визуально это выглядело продолжением того же интерфейса, а не
 * отдельным экраном (см. разметку #screen-result в index.html).
 */
export function buildReview() {
  const grid = $("review-grid");
  grid.innerHTML = "";
  state.questions.forEach((q, i) => {
    const userIdx = state.answers[q.id];
    const squareState = userIdx === undefined ? "empty" : userIdx === q.correctIndex ? "correct" : "wrong";

    const dot = document.createElement("button");
    dot.type = "button";
    dot.className = "q-dot" + (i === state.reviewIndex ? " current" : "");
    dot.dataset.state = squareState;
    dot.dataset.index = String(i);
    dot.title = `Вопрос ${i + 1}`;
    dot.textContent = String(i + 1);
    grid.appendChild(dot);
  });
  renderReviewDetail();
}

function renderReviewDetail() {
  const q = state.questions[state.reviewIndex];
  if (!q) return;
  const userIdx = state.answers[q.id];

  const imgWrap = $("review-image-wrap");
  if (q.image) {
    imgWrap.classList.remove("hidden");
    $("review-image").src = q.image;
  } else {
    imgWrap.classList.add("hidden");
  }

  $("review-text").textContent = `${state.reviewIndex + 1}. ${q.text}`;

  const optsWrap = $("review-options");
  optsWrap.innerHTML = "";
  q.options.forEach((opt, i) => {
    const li = document.createElement("li");
    li.className = "q-option";
    li.dataset.index = String(i);
    if (i === q.correctIndex) li.classList.add("correct");
    else if (i === userIdx) li.classList.add("wrong");
    li.innerHTML = `<span class="o-key">${i + 1}</span><span>${escapeHtml(opt)}</span>`;
    optsWrap.appendChild(li);
  });

  $("review-answer-line").textContent =
    userIdx === undefined ? "ОТВЕТ НЕ ВЫБРАН" : `ВАШ ОТВЕТ: ${userIdx + 1}`;

  const explainEl = $("review-explain");
  if (q.explanation) {
    explainEl.textContent = q.explanation;
    explainEl.classList.remove("hidden");
  } else {
    explainEl.classList.add("hidden");
    explainEl.textContent = "";
  }
}

export function scrollActiveReviewIntoView() {
  const active = $("review-grid").querySelector(".q-dot.current");
  if (active) active.scrollIntoView({ block: "nearest" });
}

/** Для навигации (стрелки/клик) — не перестраивает всю сетку, только активную точку + деталь. */
export function updateReviewActive() {
  const grid = $("review-grid");
  grid.querySelectorAll(".q-dot").forEach((dot) => {
    dot.classList.toggle("current", Number(dot.dataset.index) === state.reviewIndex);
  });
  renderReviewDetail();
}

/* ============================================================
   PROFILE — информация о себе; у admin здесь же панель администрирования.
   ============================================================ */

export function renderProfile(user) {
  const fullName = [user.first_name, user.last_name].filter(Boolean).join(" ");
  const isLight = isLightTheme();

  $("profile-card").innerHTML = `
    <div class="profile-menu-bar">
      <label class="theme-switch" title="Тема оформления">
        <span class="theme-switch-icon">🌙</span>
        <input type="checkbox" id="profile-theme-toggle" ${isLight ? "checked" : ""} />
        <span class="theme-switch-track"><span class="theme-switch-thumb"></span></span>
        <span class="theme-switch-icon">☀️</span>
      </label>
    </div>
    <div class="profile-head">
      <button type="button" class="avatar-upload-btn" id="avatar-upload-btn" title="Изменить фото">
        <span class="avatar large" id="profile-avatar"></span>
        <span class="avatar-upload-hint">Изменить</span>
      </button>
      <input id="profile-photo-input" type="file" accept="image/*" class="hidden" />
      <div>
        <h2>${escapeHtml(fullName) || "Без имени"}</h2>
        <p class="profile-role">${ROLE_LABELS[user.user_type] || user.user_type}</p>
      </div>
    </div>
    <dl class="profile-fields">
      <dt>Лицензия действует до</dt><dd>${formatDate(user.license_until)}</dd>
      <dt>Статус</dt><dd>${user.is_blocked ? "Заблокирован" : "Активна"}</dd>
    </dl>
    <div class="profile-settings">
      <p class="panel-label">Личные данные</p>
      <label>Имя<input id="profile-first-name" type="text" maxlength="100" value="${escapeHtml(user.first_name || "")}" /></label>
      <label>Фамилия<input id="profile-last-name" type="text" maxlength="100" value="${escapeHtml(user.last_name || "")}" /></label>
      <label>Email<input id="profile-email" type="email" value="${escapeHtml(user.email || "")}" /></label>
      <p class="modal-hint">Сохраняется автоматически при выходе из профиля. Фото меняется кликом по аватарке выше — можно выбрать любой снимок, он сам обрежется в квадрат и сожмётся.</p>
    </div>
    <div class="profile-settings">
      <p class="panel-label">Друзья</p>
      <div class="friends-section" id="friends-incoming"><p class="loading">Загрузка…</p></div>
      <div class="friends-section" id="friends-outgoing"></div>
      <div class="friends-section" id="friends-accepted"></div>
      <div class="friend-add-row">
        <input id="profile-friend-email" type="email" placeholder="email@example.com" autocomplete="off" />
        <button type="button" class="icon-btn friend-add-btn" id="profile-friend-add-btn" title="Добавить друга">+</button>
      </div>
    </div>
    ${isAdmin() ? `<div class="admin-panel" id="admin-panel"><p class="panel-label">Администрирование</p><div class="admin-licenses" id="admin-licenses"><p class="loading">Загрузка лицензий…</p></div><button class="chapter-start" id="license-add-btn" type="button">➕ Выдать лицензию</button>
      <button class="ghost" id="devtools-open-btn" type="button">Открыть DevTools</button></div>` : ""}
  `;
  paintAvatar($("profile-avatar"), user);
}

function friendPartner(friendship, currentUserId) {
  return friendship.requester.id === currentUserId ? friendship.addressee : friendship.requester;
}

function friendLabel(person) {
  const name = [person.first_name, person.last_name].filter(Boolean).join(" ");
  return escapeHtml(name || person.email || `#${person.id}`);
}

export function renderFriends({ incoming, outgoing, accepted }) {
  const incomingEl = $("friends-incoming");
  const outgoingEl = $("friends-outgoing");
  const acceptedEl = $("friends-accepted");
  if (!incomingEl || !outgoingEl || !acceptedEl) return;
  const myId = state.user?.id;

  incomingEl.innerHTML = incoming.length
    ? `<p class="friends-label">Входящие заявки</p><ul class="friends-list">${incoming
        .map(
          (f) => `<li class="friend-row" data-id="${f.id}">
            <span class="friend-email">${friendLabel(friendPartner(f, myId))}</span>
            <span class="friend-row-actions">
              <button type="button" class="icon-btn tiny" data-friend-action="accept" title="Принять">✓</button>
              <button type="button" class="icon-btn tiny danger" data-friend-action="decline" title="Отклонить">✕</button>
            </span>
          </li>`
        )
        .join("")}</ul>`
    : "";

  outgoingEl.innerHTML = outgoing.length
    ? `<p class="friends-label">Отправленные заявки</p><ul class="friends-list">${outgoing
        .map(
          (f) => `<li class="friend-row" data-id="${f.id}">
            <span class="friend-email">${friendLabel(friendPartner(f, myId))}</span>
            <span class="friend-row-actions">
              <span class="friend-pending-hint">ожидает</span>
              <button type="button" class="icon-btn tiny danger" data-friend-action="cancel" title="Отозвать">✕</button>
            </span>
          </li>`
        )
        .join("")}</ul>`
    : "";

  acceptedEl.innerHTML = `<p class="friends-label">Друзья</p><ul class="friends-list">${
    accepted.length
      ? accepted
          .map(
            (f) => `<li class="friend-row" data-id="${f.id}">
              <span class="friend-email">${friendLabel(friendPartner(f, myId))}</span>
              <button type="button" class="icon-btn tiny danger" data-friend-action="remove" title="Удалить">✕</button>
            </li>`
          )
          .join("")
      : `<li class="friends-empty">Пока никого не добавлено</li>`
  }</ul>`;
}

export function renderLicenseList(licenses) {
  const wrap = $("admin-licenses");
  if (!wrap) return;
  if (!licenses.length) {
    wrap.innerHTML = `<p class="loading">Лицензий пока нет.</p>`;
    return;
  }
  wrap.innerHTML = "";
  licenses.forEach((lic) => {
    const row = document.createElement("div");
    row.className = "license-row" + (lic.is_blocked ? " blocked" : "");
    row.dataset.id = String(lic.id);
    row.innerHTML = `
      <span class="license-key">${escapeHtml(lic.product_key)}</span>
      <span class="license-role">${ROLE_LABELS[lic.user_type] || lic.user_type}</span>
      <span class="license-until">до ${formatDate(lic.license_until)}</span>
      <span class="license-controls">
        <button class="icon-btn tiny" data-action="license-extend" title="Продлить на 30 дней">+30д</button>
        <button class="icon-btn tiny danger" data-action="license-reset-device" title="Сбросить устройство">↻</button>
        <button class="icon-btn tiny" data-action="license-toggle-block" title="${lic.is_blocked ? "Разблокировать" : "Заблокировать"}">${lic.is_blocked ? "🔓" : "🔒"}</button>
        <button class="icon-btn tiny danger" data-action="license-delete" title="Удалить пользователя">🗑</button>
      </span>
    `;
    wrap.appendChild(row);
  });
}

/* ============================================================
   МОДАЛКА — единый переиспользуемый контейнер под формы
   (глава/вопрос/лицензия), см. admin.js.
   ============================================================ */

export function openModal(title, bodyHtml) {
  $("modal-title").textContent = title;
  $("modal-body").innerHTML = bodyHtml;
  $("modal-box").classList.remove("danger");
  $("modal-overlay").classList.remove("hidden");
  const firstInput = $("modal-body").querySelector("input, textarea, select");
  if (firstInput) firstInput.focus();
}

export function closeModal() {
  $("modal-overlay").classList.add("hidden");
  $("modal-body").innerHTML = "";
  // confirmDialog() слушает это, чтобы не зависнуть неразрешённым промисом,
  // если модалку закрыли крестиком/Esc, а не одной из её собственных кнопок.
  $("modal-overlay").dispatchEvent(new CustomEvent("modal:closed"));
}

export function isModalOpen() {
  return !$("modal-overlay").classList.contains("hidden");
}

/**
 * Тематический да/нет-диалог (взамен браузерного confirm()) — тот же
 * модальный контейнер, что и формы редактирования, просто с двумя кнопками
 * вместо формы. Возвращает Promise<boolean> — true, если подтвердили.
 */
export function confirmDialog({ title, text, confirmLabel = "Да", cancelLabel = "Отмена", danger = false }) {
  return new Promise((resolve) => {
    let settled = false;
    const settle = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };

    openModal(
      title,
      `
        <p class="modal-text">${escapeHtml(text)}</p>
        <div class="modal-actions">
          <button type="button" class="modal-btn modal-btn-ghost" data-resolve="cancel">${cancelLabel}</button>
          <button type="button" class="modal-btn ${danger ? "modal-btn-danger" : ""}" data-resolve="confirm">${confirmLabel}</button>
        </div>
      `,
    );
    if (danger) $("modal-box").classList.add("danger");

    const onBodyClick = (e) => {
      const btn = e.target.closest("[data-resolve]");
      if (!btn) return;
      settle(btn.dataset.resolve === "confirm");
      closeModal();
    };
    const onClosed = () => {
      settle(false);
      $("modal-body").removeEventListener("click", onBodyClick);
      $("modal-overlay").removeEventListener("modal:closed", onClosed);
    };

    $("modal-body").addEventListener("click", onBodyClick);
    $("modal-overlay").addEventListener("modal:closed", onClosed);
  });
}

/* ============================================================
   ЛИДЕРБОРД — себя + принятых друзей по баллам (сумма правильных
   ответов из settings.quiz_stats, см. GET /friends/leaderboard).
   ============================================================ */

const MEDALS = ["🥇", "🥈", "🥉"];

function leaderboardRowHtml(entry, rank) {
  const name = [entry.first_name, entry.last_name].filter(Boolean).join(" ") || entry.email || `Пользователь #${entry.user_id}`;
  const medal = MEDALS[rank] || `${rank + 1}`;
  const hue = (entry.user_id * 47) % 360;
  const avatarStyle = entry.profile_photo
    ? `background: url(${entry.profile_photo}) center/cover`
    : `background: hsl(${hue}, 55%, 40%)`;
  const initials = entry.profile_photo
    ? ""
    : ((entry.first_name?.[0] || "") + (entry.last_name?.[0] || "")).toUpperCase() || (entry.email?.[0] || "U").toUpperCase();
  return `
    <li class="leaderboard-row ${entry.is_me ? "leaderboard-row-me" : ""}">
      <span class="leaderboard-rank">${medal}</span>
      <span class="avatar" style="${avatarStyle}">${initials}</span>
      <span class="leaderboard-name">${escapeHtml(name)}${entry.is_me ? " <em>(вы)</em>" : ""}</span>
      <span class="leaderboard-points">${entry.points} ${pointsWord(entry.points)}</span>
    </li>
  `;
}

function pointsWord(n) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return "балл";
  if ([2, 3, 4].includes(mod10) && ![12, 13, 14].includes(mod100)) return "балла";
  return "баллов";
}

export function renderLeaderboard(entries) {
  const body = entries.length
    ? `<ul class="leaderboard-list">${entries.map((e, i) => leaderboardRowHtml(e, i)).join("")}</ul>`
    : `<p class="modal-hint">Пока пусто — добавьте друзей в профиле, чтобы сравнивать баллы.</p>`;
  openModal("👑 Лидерборд друзей", body);
}

export function renderLeaderboardLoading() {
  openModal("👑 Лидерборд друзей", `<p class="loading">Загрузка…</p>`);
}

export function renderLeaderboardError(message) {
  openModal("👑 Лидерборд друзей", `<p class="modal-hint">${escapeHtml(message)}</p>`);
}

/* ============================================================
   Разовый показ Product Key после выдачи лицензии: раньше это был
   alert(), из которого ключ нельзя скопировать, а второго шанса нет.
   ============================================================ */

export function showProductKey(productKey) {
  openModal(
    "Лицензия создана",
    `
      <p class="modal-text">Product Key показывается только сейчас и больше нигде не появится.</p>
      <p class="product-key-box" id="product-key-box">${escapeHtml(productKey)}</p>
      <div class="modal-actions">
        <button type="button" class="modal-btn modal-btn-ghost" data-action="modal-cancel">Закрыть</button>
        <button type="button" id="product-key-copy">Скопировать</button>
      </div>
    `,
  );

  const btn = $("product-key-copy");
  btn.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(productKey);
      btn.textContent = "Скопировано";
    } catch {
      // Буфер обмена недоступен — выделяем ключ, чтобы его можно было взять руками.
      const range = document.createRange();
      range.selectNodeContents($("product-key-box"));
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
      btn.textContent = "Скопируй вручную";
    }
  });
}
