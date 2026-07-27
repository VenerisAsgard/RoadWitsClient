/* ============================================================
   PDD RB — console logic
   Keyboard AND mouse both fully supported for every flow.
   Data comes from a backend API when available; falls back to
   local DEMO data so the UI stays testable offline.
   ============================================================ */

const API_BASE = "/api"; // point this at your backend, e.g. "https://api.pdd-rb.by"

const ENDPOINTS = {
  chapters: () => `${API_BASE}/chapters`,
  chapterQuestions: (id) => `${API_BASE}/chapters/${id}/questions`,
  tickets: () => `${API_BASE}/tickets`,
  ticketQuestions: (id) => `${API_BASE}/tickets/${id}/questions`,
  randomQuestions: (count) => `${API_BASE}/questions?count=${count}`,
  submitResult: () => `${API_BASE}/results`,
};

/* ---------- demo fallback data ---------- */
const DEMO_QUESTIONS = {
  q1: {
    id: "q1",
    text: "Разрешено ли водителю движение задним ходом на перекрёстке?",
    options: [
      "Разрешено в любом случае",
      "Запрещено",
      "Разрешено только ночью",
      "Разрешено при отсутствии других участников",
    ],
    correctIndex: 1,
    explanation: "П. 8.11 — движение задним ходом на перекрёстках запрещено.",
  },
  q2: {
    id: "q2",
    text: "Что означает жёлтый мигающий сигнал светофора?",
    options: [
      "Движение запрещено",
      "Движение разрешено с повышенным вниманием",
      "Уступите дорогу пешеходам",
      "Остановка обязательна",
    ],
    correctIndex: 1,
    explanation:
      "Жёлтый мигающий сигнал предупреждает о нерегулируемом перекрёстке или переходе.",
  },
  q3: {
    id: "q3",
    text: "На каком минимальном расстоянии от пешеходного перехода запрещена остановка?",
    options: ["5 метров", "10 метров", "15 метров", "Остановка не ограничена"],
    correctIndex: 0,
    explanation:
      "П. 17.3 — остановка запрещена ближе 5 метров перед пешеходным переходом.",
  },
  q4: {
    id: "q4",
    text: "Какая максимальная скорость разрешена в населённом пункте, если не установлено иное?",
    options: ["50 км/ч", "60 км/ч", "70 км/ч", "90 км/ч"],
    correctIndex: 1,
    explanation:
      "В населённых пунктах разрешённая скорость — не более 60 км/ч.",
  },
  q5: {
    id: "q5",
    text: "Когда обязательно включение ближнего света фар вне населённого пункта?",
    options: [
      "Только ночью",
      "Круглосуточно",
      "Только в тумане",
      "Не требуется",
    ],
    correctIndex: 1,
    explanation:
      "Вне населённых пунктов ближний свет должен быть включён круглосуточно.",
  },
  q6: {
    id: "q6",
    text: "Лица, передвигающиеся на средствах персональной мобильности, приравниваются к:",
    options: ["Пешеходам", "Велосипедистам", "Пассажирам", "Водителям мопедов"],
    correctIndex: 0,
    explanation:
      "П. 2.1 — СПМ на дороге приравниваются к пешеходам с учётом особенностей ПДД.",
  },
  q7: {
    id: "q7",
    text: "Кто обязан уступить дорогу при завершении обгона?",
    options: ["Обгоняемый", "Обгоняющий", "Оба поровну", "Никто не обязан"],
    correctIndex: 1,
    explanation:
      "П. 12.5 — обгоняющий обязан вернуться, не создавая помех обгоняемому.",
  },
  q8: {
    id: "q8",
    text: "Где запрещена стоянка транспортных средств?",
    options: [
      "На тротуаре",
      "На платной парковке",
      "Во дворе",
      "На обочине вне города",
    ],
    correctIndex: 0,
    explanation:
      "Стоянка на тротуаре запрещена, кроме мест с соответствующим знаком.",
  },
};

const DEMO_CHAPTERS = [
  {
    id: "c1",
    num: 1,
    title: "Общие положения и термины",
    count: 8,
    description:
      "Термины ПДД, область действия правил, обязанности участников движения.",
    questionIds: ["q6"],
  },
  {
    id: "c2",
    num: 2,
    title: "Общие обязанности водителей",
    count: 14,
    description: "Документы, техническое состояние, действия при ДТП.",
    questionIds: [],
  },
  {
    id: "c3",
    num: 3,
    title: "Применение специальных сигналов",
    count: 6,
    description:
      "Проблесковые маячки, звуковые сигналы, приоритет спецтранспорта.",
    questionIds: [],
  },
  {
    id: "c4",
    num: 4,
    title: "Обязанности пешеходов",
    count: 9,
    description: "Движение по тротуарам, переход проезжей части.",
    questionIds: [],
  },
  {
    id: "c5",
    num: 5,
    title: "Обязанности пассажиров",
    count: 5,
    description: "Посадка, высадка, использование ремней безопасности.",
    questionIds: [],
  },
  {
    id: "c6",
    num: 6,
    title: "Сигналы светофора и регулировщика",
    count: 10,
    description: "Значения сигналов, приоритет регулировщика.",
    questionIds: ["q2"],
  },
  {
    id: "c7",
    num: 7,
    title: "Расположение ТС на проезжей части",
    count: 11,
    description: "Полосы движения, встречный разъезд, реверсивное движение.",
    questionIds: ["q1"],
  },
  {
    id: "c8",
    num: 8,
    title: "Скорость движения",
    count: 9,
    description: "Ограничения скорости, дистанция и боковой интервал.",
    questionIds: ["q4"],
  },
  {
    id: "c9",
    num: 9,
    title: "Обгон, опережение и встречный разъезд",
    count: 12,
    description: "Условия безопасного обгона, запреты на обгон.",
    questionIds: ["q7"],
  },
  {
    id: "c10",
    num: 10,
    title: "Остановка и стоянка",
    count: 14,
    description: "Места, где остановка и стоянка запрещены или ограничены.",
    questionIds: ["q3", "q8"],
  },
  {
    id: "c11",
    num: 11,
    title: "Проезд перекрёстков",
    count: 18,
    description: "Приоритет, круговое движение, регулируемые перекрёстки.",
    questionIds: [],
  },
  {
    id: "c12",
    num: 12,
    title: "Освещение и видимость",
    count: 7,
    description: "Ближний, дальний свет, использование фар.",
    questionIds: ["q5"],
  },
  {
    id: "c13",
    num: 13,
    title: "Дорожные знаки",
    count: 45,
    description: "Предупреждающие, запрещающие, предписывающие знаки.",
    questionIds: [],
  },
];

/* ---------- demo thematic tickets ---------- */
const DEMO_TICKETS = [
  {
    id: "t1",
    num: 1,
    title: "Приоритет и манёвры",
    count: 2,
    description:
      "Движение задним ходом, обгон, опережение и завершение манёвров.",
    questionIds: ["q1", "q7"],
  },
  {
    id: "t2",
    num: 2,
    title: "Сигналы и освещение",
    count: 2,
    description: "Сигналы светофора, регулировщика, требования к освещению.",
    questionIds: ["q2", "q5"],
  },
  {
    id: "t3",
    num: 3,
    title: "Скорость, остановка и стоянка",
    count: 3,
    description:
      "Скоростные ограничения, запреты и особенности остановки и стоянки.",
    questionIds: ["q3", "q4", "q8"],
  },
  {
    id: "t4",
    num: 4,
    title: "Термины и участники движения",
    count: 1,
    description: "Базовые термины, статус пешеходов и СПМ.",
    questionIds: ["q6"],
  },
];

function collectDemoQuestions(ids) {
  return ids.map((id) => DEMO_QUESTIONS[id]).filter(Boolean);
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const RANDOM_COUNT_OPTIONS = [5, 10, 20, 30];

/* ---------- state ---------- */
const state = {
  screen: "menu",
  usingDemo: true,
  chapters: [],
  tickets: [],

  menuIndex: 0,
  chapterIndex: 0,
  ticketIndex: 0,
  randomCountIndex: 1,

  checkedChapters: new Set(),

  mode: null, // "chapter" | "ticket" | "random" | "exam"
  chapterId: null,
  ticketId: null,
  multiChapterIds: null,
  randomCount: 5,
  originScreen: "menu", // screen to return to when exiting an in-progress test

  questions: [],
  currentQ: 0,
  answers: {},
  locked: false,

  timerSeconds: 0,
  timerHandle: null,

  reviewIndex: 0,
  modal: null,
};

const MENU_ITEMS = [
  {
    id: "chapter",
    title: "Тренировка по главам ПДД",
    sub: "Отметь чекбоксом одну или несколько глав и отвечай без ограничения по времени",
  },
  {
    id: "tickets",
    title: "Тренировка по тематическим билетам",
    sub: "Билеты, собранные по темам ПДД",
  },
  {
    id: "random",
    title: "Тренировка по случайному билету",
    sub: "Выбери количество вопросов, получай мгновенную проверку ответа",
  },
  {
    id: "exam",
    title: "Контрольный экзамен",
    sub: "Официальный формат, обратный отсчёт, разбор ошибок",
  },
];

/* ---------- helpers ---------- */
async function safeFetch(url, opts) {
  try {
    const res = await fetch(url, opts);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    return null;
  }
}

const $ = (id) => document.getElementById(id);

function setSignal(mode) {
  document.querySelector(".signal").dataset.mode = mode;
}

function setHint(text) {
  $("hint-keys").textContent = text;
}

function setBackendStatus() {
  $("backend-status").textContent = state.usingDemo
    ? "демо-режим · backend не подключён"
    : "подключено к серверу";
}

/* ---------- generic confirm modal ---------- */
function openModal({
  title,
  text,
  confirmLabel = "Да",
  cancelLabel = "Отмена",
  onConfirm,
  onCancel,
}) {
  state.modal = { onConfirm, onCancel };
  $("modal-title").textContent = title;
  $("modal-text").textContent = text;
  $("modal-confirm").textContent = confirmLabel;
  $("modal-cancel").textContent = cancelLabel;
  $("modal-overlay").classList.remove("hidden");
}

function closeModal() {
  $("modal-overlay").classList.add("hidden");
  state.modal = null;
  $("hint-keys").classList.remove("hint-warning");
}

/* ---------- screen switching ---------- */
function showScreen(name) {
  state.screen = name;
  ["menu", "chapters", "tickets", "question", "result", "random-count"].forEach(
    (s) => {
      $(`screen-${s}`).classList.toggle("hidden", s !== name);
    },
  );
}

/* ============================================================
   MENU
   ============================================================ */
function renderMenu() {
  const list = $("menu-list");
  list.innerHTML = "";
  MENU_ITEMS.forEach((item, i) => {
    const li = document.createElement("li");
    li.className = "menu-item" + (i === state.menuIndex ? " active" : "");
    li.innerHTML = `
      <span class="m-index">${String(i + 1).padStart(2, "0")}</span>
      <span class="m-body">
        <span class="m-title">${item.title}</span>
        <span class="m-sub">${item.sub}</span>
      </span>
    `;
    li.addEventListener("click", () => {
      state.menuIndex = i;
      menuConfirm();
    });
    list.appendChild(li);
  });
}

function renderMenuMeta() {
  const totalQ = state.chapters.reduce((s, c) => s + (c.count || 0), 0);
  $("menu-total-q").textContent = totalQ
    ? `${totalQ}+ вопросов в базе`
    : "— вопросов";
  $("menu-total-ch").textContent =
    `${state.chapters.length || DEMO_CHAPTERS.length} глав ПДД`;
}

function menuMove(delta) {
  state.menuIndex =
    (state.menuIndex + delta + MENU_ITEMS.length) % MENU_ITEMS.length;
  renderMenu();
}

function menuConfirm() {
  const choice = MENU_ITEMS[state.menuIndex].id;
  if (choice === "chapter") {
    state.chapterIndex = 0;
    state.checkedChapters = new Set();
    showScreen("chapters");
    renderChapters();
    setHint("↑↓ выбрать · Space/клик по ☐ отметить · Enter начать · Esc в меню");
    setSignal("idle");
  } else if (choice === "tickets") {
    state.ticketIndex = 0;
    showScreen("tickets");
    renderTickets();
    setHint("↑↓ выбрать билет · Enter начать · Esc в меню");
    setSignal("idle");
  } else if (choice === "random") {
    showScreen("random-count");
    renderRandomCount();
    setHint("↑↓ выбрать количество · Enter начать · Esc в меню");
    setSignal("idle");
  } else if (choice === "exam") {
    beginQuiz("exam");
  }
}

/* ============================================================
   CHAPTERS (multi-select via checkbox)
   ============================================================ */
async function loadChapters() {
  const data = await safeFetch(ENDPOINTS.chapters());
  if (data && Array.isArray(data) && data.length) {
    state.chapters = data;
    state.usingDemo = false;
  } else {
    state.chapters = DEMO_CHAPTERS;
    state.usingDemo = true;
  }
  setBackendStatus();
  renderMenuMeta();
}

async function loadTickets() {
  const data = await safeFetch(ENDPOINTS.tickets());
  state.tickets =
    data && Array.isArray(data) && data.length ? data : DEMO_TICKETS;
}

function renderChapters() {
  const list = $("chapter-list");
  list.innerHTML = "";
  state.chapters.forEach((c, i) => {
    const li = document.createElement("li");
    const hasQ = (c.count || 0) > 0;
    const checked = state.checkedChapters.has(c.id);
    li.className =
      "chapter-item" +
      (i === state.chapterIndex ? " active" : "") +
      (hasQ ? "" : " empty") +
      (checked ? " checked" : "");
    li.innerHTML = `<span class="c-checkbox" data-role="checkbox" role="checkbox" aria-checked="${checked}">${checked ? "☑" : "☐"}</span><span class="c-num">${String(c.num ?? i + 1).padStart(2, "0")}</span><span>${c.title}</span>`;
    li.addEventListener("click", (e) => {
      state.chapterIndex = i;
      if (e.target.closest('[data-role="checkbox"]')) {
        toggleChapterCheck(c);
      } else {
        renderChapters();
      }
    });
    list.appendChild(li);
  });
  renderChapterDetail();
  const active = list.querySelector(".chapter-item.active");
  if (active) active.scrollIntoView({ block: "nearest" });
}

function toggleChapterCheck(c) {
  if (!c || !(c.count > 0)) return;
  if (state.checkedChapters.has(c.id)) state.checkedChapters.delete(c.id);
  else state.checkedChapters.add(c.id);
  renderChapters();
}

function renderChapterDetail() {
  const c = state.chapters[state.chapterIndex];
  const wrap = $("chapter-detail");
  if (!c) {
    wrap.innerHTML = `<p class="loading">Нет данных о главе.</p>`;
    return;
  }
  const checkedCount = state.checkedChapters.size;
  const canStartSingle = (c.count || 0) > 0;
  wrap.innerHTML = `
    <p class="d-eyebrow">Глава ${c.num ?? state.chapterIndex + 1}</p>
    <h2>${c.title}</h2>
    <p class="d-desc">${c.description ?? ""}</p>
    <p class="d-count">${c.count ?? 0} вопросов в главе</p>
    ${checkedCount ? `<p class="d-selected">Отмечено глав: ${checkedCount}</p>` : ""}
    <p class="d-hint">Space или клик по ☐ — отметить главу (можно несколько) · Enter — начать</p>
    <button class="d-start-btn" id="chapter-start-btn" ${checkedCount || canStartSingle ? "" : "disabled"}>${
      checkedCount
        ? `Начать по ${checkedCount} ${checkedCount === 1 ? "главе" : "главам"}`
        : canStartSingle
          ? "Начать по этой главе"
          : "Нет вопросов"
    }</button>
  `;
  const btn = $("chapter-start-btn");
  if (btn) btn.addEventListener("click", chaptersConfirm);
}

function chaptersMove(delta) {
  const n = state.chapters.length;
  if (!n) return;
  state.chapterIndex = (state.chapterIndex + delta + n) % n;
  renderChapters();
}

function chaptersConfirm() {
  const checked = [...state.checkedChapters];
  if (checked.length) {
    const chosen = state.chapters.filter((c) => checked.includes(c.id));
    beginQuiz("chapter", {
      id: "multi",
      title: `Главы: ${chosen.map((c) => c.num ?? "?").join(", ")}`,
      questionIds: shuffle(chosen.flatMap((c) => c.questionIds || [])),
      sourceIds: checked,
    });
    return;
  }
  const c = state.chapters[state.chapterIndex];
  if (!c || !(c.count > 0)) return;
  beginQuiz("chapter", c);
}

/* ============================================================
   THEMATIC TICKETS
   ============================================================ */
function renderTickets() {
  const list = $("ticket-list");
  list.innerHTML = "";
  state.tickets.forEach((t, i) => {
    const li = document.createElement("li");
    const hasQ = (t.count || 0) > 0;
    li.className =
      "chapter-item" +
      (i === state.ticketIndex ? " active" : "") +
      (hasQ ? "" : " empty");
    li.innerHTML = `<span class="c-num">${String(t.num ?? i + 1).padStart(2, "0")}</span><span>${t.title}</span>`;
    li.addEventListener("click", () => {
      state.ticketIndex = i;
      renderTickets();
    });
    list.appendChild(li);
  });
  renderTicketDetail();
  const active = list.querySelector(".chapter-item.active");
  if (active) active.scrollIntoView({ block: "nearest" });
}

function renderTicketDetail() {
  const t = state.tickets[state.ticketIndex];
  const wrap = $("ticket-detail");
  if (!t) {
    wrap.innerHTML = `<p class="loading">Нет данных о билете.</p>`;
    return;
  }
  const canStart = (t.count || 0) > 0;
  wrap.innerHTML = `
    <p class="d-eyebrow">Билет ${t.num ?? state.ticketIndex + 1}</p>
    <h2>${t.title}</h2>
    <p class="d-desc">${t.description ?? ""}</p>
    <p class="d-count">${t.count ?? 0} вопросов в билете</p>
    <p class="d-hint">${canStart ? "Enter — начать тренировку по билету" : "Вопросы этого билета скоро появятся"}</p>
    <button class="d-start-btn" id="ticket-start-btn" ${canStart ? "" : "disabled"}>Начать по этому билету</button>
  `;
  const btn = $("ticket-start-btn");
  if (btn) btn.addEventListener("click", ticketsConfirm);
}

function ticketsMove(delta) {
  const n = state.tickets.length;
  if (!n) return;
  state.ticketIndex = (state.ticketIndex + delta + n) % n;
  renderTickets();
}

function ticketsConfirm() {
  const t = state.tickets[state.ticketIndex];
  if (!t || !(t.count > 0)) return;
  beginQuiz("ticket", t);
}

/* ============================================================
   RANDOM TICKET — ask question count first
   ============================================================ */
function renderRandomCount() {
  const list = $("random-count-list");
  list.innerHTML = "";
  RANDOM_COUNT_OPTIONS.forEach((count, i) => {
    const li = document.createElement("li");
    li.className = "menu-item" + (i === state.randomCountIndex ? " active" : "");
    li.innerHTML = `
      <span class="m-index">${String(i + 1).padStart(2, "0")}</span>
      <span class="m-body">
        <span class="m-title">${count} вопросов</span>
        <span class="m-sub">Случайная подборка из базы вопросов</span>
      </span>
    `;
    li.addEventListener("click", () => {
      state.randomCountIndex = i;
      randomCountConfirm();
    });
    list.appendChild(li);
  });
}

function randomCountMove(delta) {
  const n = RANDOM_COUNT_OPTIONS.length;
  state.randomCountIndex = (state.randomCountIndex + delta + n) % n;
  renderRandomCount();
}

function randomCountConfirm() {
  const count = RANDOM_COUNT_OPTIONS[state.randomCountIndex];
  beginQuiz("random", null, count);
}

/* ============================================================
   QUESTIONS / QUIZ
   ============================================================ */
async function beginQuiz(mode, item, count) {
  state.mode = mode;
  state.chapterId = mode === "chapter" ? item.id : null;
  state.ticketId = mode === "ticket" ? item.id : null;
  state.multiChapterIds =
    mode === "chapter" && item && item.id === "multi" ? item.sourceIds : null;
  if (mode === "random") state.randomCount = count || state.randomCount || 5;
  state.originScreen =
    mode === "chapter"
      ? "chapters"
      : mode === "ticket"
        ? "tickets"
        : mode === "random"
          ? "random-count"
          : "menu";
  state.currentQ = 0;
  state.answers = {};
  state.locked = false;

  let questions = [];
  if (mode === "chapter") {
    if (item.id === "multi") {
      questions = collectDemoQuestions(item.questionIds || []);
      if (!questions.length)
        questions = shuffle(Object.values(DEMO_QUESTIONS)).slice(0, 3);
    } else {
      const data = await safeFetch(ENDPOINTS.chapterQuestions(item.id));
      questions =
        data && Array.isArray(data) && data.length
          ? data
          : collectDemoQuestions(item.questionIds || []);
      if (!questions.length)
        questions = shuffle(Object.values(DEMO_QUESTIONS)).slice(0, 3);
    }
  } else if (mode === "ticket") {
    const data = await safeFetch(ENDPOINTS.ticketQuestions(item.id));
    questions =
      data && Array.isArray(data) && data.length
        ? data
        : collectDemoQuestions(item.questionIds || []);
    if (!questions.length)
      questions = shuffle(Object.values(DEMO_QUESTIONS)).slice(0, 3);
  } else if (mode === "random") {
    const n = state.randomCount;
    const data = await safeFetch(ENDPOINTS.randomQuestions(n));
    questions =
      data && Array.isArray(data) && data.length
        ? data
        : shuffle(Object.values(DEMO_QUESTIONS)).slice(
            0,
            Math.min(n, Object.values(DEMO_QUESTIONS).length),
          );
  } else if (mode === "exam") {
    const data = await safeFetch(ENDPOINTS.randomQuestions(20));
    questions =
      data && Array.isArray(data) && data.length
        ? data
        : shuffle(Object.values(DEMO_QUESTIONS));
  }

  state.questions = questions;
  $("q-total").textContent = questions.length;
  $("q-chapter-label").textContent =
    mode === "chapter"
      ? item.title
      : mode === "ticket"
        ? item.title
        : mode === "random"
          ? `Случайный билет · ${questions.length} вопр.`
          : "Контрольный экзамен";

  const timerEl = $("q-timer");
  if (mode === "exam") {
    timerEl.classList.remove("hidden");
    startTimer(questions.length * 60);
  } else {
    timerEl.classList.add("hidden");
    clearInterval(state.timerHandle);
  }

  showScreen("question");
  setSignal("active");
  renderQuestion();
  updateQuestionHint();
}

function startTimer(seconds) {
  clearInterval(state.timerHandle);
  state.timerSeconds = seconds;
  updateTimerDisplay();
  state.timerHandle = setInterval(() => {
    state.timerSeconds--;
    updateTimerDisplay();
    if (state.timerSeconds <= 0) {
      clearInterval(state.timerHandle);
      finishQuiz();
    }
  }, 1000);
}

function updateTimerDisplay() {
  const m = Math.floor(state.timerSeconds / 60)
    .toString()
    .padStart(2, "0");
  const s = (state.timerSeconds % 60).toString().padStart(2, "0");
  $("q-timer").textContent = `${m}:${s}`;
}

function updateQuestionHint() {
  setHint("1-4 или клик ответить · Space/Enter далее · ←назад · Esc выйти");
}

function renderQuestion() {
  const q = state.questions[state.currentQ];
  if (!q) return;
  $("q-current").textContent = state.currentQ + 1;

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
  const selected = state.answers[q.id];
  const revealed = state.mode !== "exam" && selected !== undefined;

  q.options.forEach((opt, i) => {
    const li = document.createElement("li");
    li.className = "q-option";
    if (selected === i) li.classList.add("selected");
    if (revealed) {
      if (i === q.correctIndex) li.classList.add("correct");
      else if (i === selected) li.classList.add("wrong");
    }
    li.innerHTML = `<span class="o-key">${i + 1}</span><span>${opt}</span>`;
    li.addEventListener("click", () => answerQuestion(i + 1));
    optsWrap.appendChild(li);
  });

  $("q-answer-value").textContent =
    selected === undefined ? "_" : String(selected + 1);

  const explainEl = $("q-explain");
  if (revealed && q.explanation) {
    explainEl.textContent = q.explanation;
    explainEl.classList.remove("hidden");
  } else {
    explainEl.classList.add("hidden");
    explainEl.textContent = "";
  }

  const pct = (state.currentQ / state.questions.length) * 100;
  $("progress-fill").style.width = `${pct}%`;

  const prevBtn = $("q-btn-prev");
  const nextBtn = $("q-btn-next");
  if (prevBtn) prevBtn.disabled = state.currentQ === 0;
  if (nextBtn)
    nextBtn.textContent =
      state.currentQ === state.questions.length - 1 ? "Завершить →" : "Далее →";
}

function answerQuestion(digit) {
  const q = state.questions[state.currentQ];
  if (!q) return;
  const idx = digit - 1;
  if (idx < 0 || idx >= q.options.length) return;
  state.answers[q.id] = idx;
  renderQuestion();
}

function questionNext() {
  if (state.currentQ < state.questions.length - 1) {
    state.currentQ++;
    renderQuestion();
  } else {
    finishQuiz();
  }
}

function questionPrev() {
  if (state.currentQ > 0) {
    state.currentQ--;
    renderQuestion();
  }
}

async function finishQuiz() {
  clearInterval(state.timerHandle);

  let correct = 0;
  state.questions.forEach((q) => {
    if (state.answers[q.id] === q.correctIndex) correct++;
  });
  const total = state.questions.length;
  const pct = total ? Math.round((correct / total) * 100) : 0;
  const passed = pct >= 80;

  showScreen("result");
  setSignal(passed ? "pass" : "fail");

  const circumference = 540;
  const offset = circumference - (circumference * pct) / 100;
  const gaugeFill = $("gauge-fill");
  gaugeFill.style.stroke = passed ? "var(--green)" : "var(--red)";
  gaugeFill.style.strokeDashoffset = circumference;
  requestAnimationFrame(() => (gaugeFill.style.strokeDashoffset = offset));

  $("gauge-score").textContent = `${pct}%`;
  $("gauge-verdict").textContent = passed ? "Сдал" : "Не сдал";
  $("result-summary").textContent =
    `Правильно: ${correct} из ${total} · проходной балл 80%`;

  safeFetch(ENDPOINTS.submitResult(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      correct,
      total,
      pct,
      mode: state.mode,
      answers: state.answers,
      ts: Date.now(),
    }),
  });

  state.reviewIndex = 0;
  buildReview();
  setHint("↑↓ или клик разбор ответов · Enter ещё раз · Esc в меню");
}

function buildReview() {
  const list = $("review-list");
  list.innerHTML = "";
  state.questions.forEach((q, i) => {
    const userIdx = state.answers[q.id];
    const correct = userIdx === q.correctIndex;
    const item = document.createElement("div");
    item.className = "review-item" + (i === state.reviewIndex ? " active" : "");
    const userLine =
      userIdx === undefined
        ? `<p class="rev-wrong">Ответ не выбран</p>`
        : correct
          ? `<p class="rev-correct">Ваш ответ: ${userIdx + 1}) ${q.options[userIdx]} — верно</p>`
          : `<p class="rev-wrong">Ваш ответ: ${userIdx + 1}) ${q.options[userIdx]}</p>`;
    const correctLine = !correct
      ? `<p class="rev-correct">Верно: ${q.correctIndex + 1}) ${q.options[q.correctIndex]}</p>`
      : "";
    item.innerHTML = `
      <p class="rev-q">${i + 1}. ${q.text}</p>
      ${userLine}
      ${correctLine}
      <p class="rev-explain">${q.explanation ?? ""}</p>
    `;
    item.addEventListener("click", () => {
      state.reviewIndex = i;
      buildReview();
    });
    list.appendChild(item);
  });
}

function reviewMove(delta) {
  const n = state.questions.length;
  if (!n) return;
  state.reviewIndex = Math.max(0, Math.min(n - 1, state.reviewIndex + delta));
  buildReview();
  const active = $("review-list").querySelector(".review-item.active");
  if (active) active.scrollIntoView({ block: "nearest" });
}

function replayQuiz() {
  if (state.mode === "chapter") {
    if (state.chapterId === "multi" && state.multiChapterIds) {
      const chosen = state.chapters.filter((c) =>
        state.multiChapterIds.includes(c.id),
      );
      beginQuiz("chapter", {
        id: "multi",
        title: `Главы: ${chosen.map((c) => c.num ?? "?").join(", ")}`,
        questionIds: shuffle(chosen.flatMap((c) => c.questionIds || [])),
        sourceIds: state.multiChapterIds,
      });
    } else {
      const c = state.chapters.find((x) => x.id === state.chapterId);
      if (c) beginQuiz("chapter", c);
    }
  } else if (state.mode === "ticket") {
    const t = state.tickets.find((x) => x.id === state.ticketId);
    if (t) beginQuiz("ticket", t);
  } else if (state.mode === "random") {
    beginQuiz("random", null, state.randomCount);
  } else {
    beginQuiz(state.mode);
  }
}

/* ============================================================
   EXIT CONFIRMATION — colored footer warning + confirm prompt
   ============================================================ */
function requestExit() {
  if (state.screen !== "question") return;
  $("hint-keys").classList.add("hint-warning");
  setHint("⚠ Подтвердите выход — прогресс текущего теста будет потерян");
  openModal({
    title: "Выйти из теста?",
    text: "Текущий прогресс не будет сохранён. Вы уверены, что хотите выйти?",
    confirmLabel: "Да, выйти",
    cancelLabel: "Остаться",
    onConfirm: () => {
      closeModal();
      returnToOrigin();
    },
    onCancel: () => {
      closeModal();
      updateQuestionHint();
    },
  });
}

function returnToMenu() {
  clearInterval(state.timerHandle);
  showScreen("menu");
  setSignal("idle");
  renderMenu();
  setHint("↑↓ выбрать · Enter принять");
}

/* When leaving an in-progress test, go back to the screen the user
   configured their selection on (chapters / tickets / random count),
   not straight to the root menu — unless there was no such screen
   (e.g. the control exam, which starts directly from the menu). */
function returnToOrigin() {
  clearInterval(state.timerHandle);
  const origin = state.originScreen || "menu";
  if (origin === "chapters") {
    showScreen("chapters");
    renderChapters();
    setSignal("idle");
    setHint("↑↓ выбрать · Space/клик по ☐ отметить · Enter начать · Esc в меню");
  } else if (origin === "tickets") {
    showScreen("tickets");
    renderTickets();
    setSignal("idle");
    setHint("↑↓ выбрать билет · Enter начать · Esc в меню");
  } else if (origin === "random-count") {
    showScreen("random-count");
    renderRandomCount();
    setSignal("idle");
    setHint("↑↓ выбрать количество · Enter начать · Esc в меню");
  } else {
    returnToMenu();
  }
}

/* ============================================================
   STATIC CONTROLS (bound once — buttons that persist in the DOM)
   ============================================================ */
function bindStaticControls() {
  $("modal-confirm").addEventListener("click", () => {
    if (state.modal) state.modal.onConfirm();
  });
  $("modal-cancel").addEventListener("click", () => {
    if (state.modal) state.modal.onCancel();
  });

  $("q-btn-prev").addEventListener("click", questionPrev);
  $("q-btn-next").addEventListener("click", questionNext);
  $("q-btn-exit").addEventListener("click", requestExit);

  $("result-btn-again").addEventListener("click", replayQuiz);
  $("result-btn-menu").addEventListener("click", returnToMenu);

  $("chapters-back-btn").addEventListener("click", returnToMenu);
  $("tickets-back-btn").addEventListener("click", returnToMenu);
  $("random-count-back-btn").addEventListener("click", returnToMenu);
}

/* ============================================================
   KEYBOARD CONTROL — single source of truth for all navigation
   (mouse controls are bound alongside rendering / above)
   ============================================================ */
document.addEventListener("keydown", (e) => {
  if (state.modal) {
    if (e.key === "Enter") {
      e.preventDefault();
      state.modal.onConfirm();
    } else if (e.key === "Escape") {
      e.preventDefault();
      state.modal.onCancel();
    }
    return;
  }

  const key = e.key;

  switch (state.screen) {
    case "menu": {
      if (key === "ArrowUp") {
        e.preventDefault();
        menuMove(-1);
      } else if (key === "ArrowDown") {
        e.preventDefault();
        menuMove(1);
      } else if (key === "Enter") {
        e.preventDefault();
        menuConfirm();
      }
      break;
    }
    case "chapters": {
      if (key === "ArrowUp") {
        e.preventDefault();
        chaptersMove(-1);
      } else if (key === "ArrowDown") {
        e.preventDefault();
        chaptersMove(1);
      } else if (key === " ") {
        e.preventDefault();
        toggleChapterCheck(state.chapters[state.chapterIndex]);
      } else if (key === "Enter") {
        e.preventDefault();
        chaptersConfirm();
      } else if (key === "Escape") {
        e.preventDefault();
        returnToMenu();
      }
      break;
    }
    case "tickets": {
      if (key === "ArrowUp") {
        e.preventDefault();
        ticketsMove(-1);
      } else if (key === "ArrowDown") {
        e.preventDefault();
        ticketsMove(1);
      } else if (key === "Enter") {
        e.preventDefault();
        ticketsConfirm();
      } else if (key === "Escape") {
        e.preventDefault();
        returnToMenu();
      }
      break;
    }
    case "random-count": {
      if (key === "ArrowUp") {
        e.preventDefault();
        randomCountMove(-1);
      } else if (key === "ArrowDown") {
        e.preventDefault();
        randomCountMove(1);
      } else if (key === "Enter") {
        e.preventDefault();
        randomCountConfirm();
      } else if (key === "Escape") {
        e.preventDefault();
        returnToMenu();
      }
      break;
    }
    case "question": {
      if (["1", "2", "3", "4"].includes(key)) {
        e.preventDefault();
        answerQuestion(Number(key));
      } else if (key === " " || key === "Enter" || key === "ArrowRight") {
        e.preventDefault();
        questionNext();
      } else if (key === "ArrowLeft" || key === "Backspace") {
        e.preventDefault();
        questionPrev();
      } else if (key === "Escape") {
        e.preventDefault();
        requestExit();
      }
      break;
    }
    case "result": {
      if (key === "ArrowUp") {
        e.preventDefault();
        reviewMove(-1);
      } else if (key === "ArrowDown") {
        e.preventDefault();
        reviewMove(1);
      } else if (key === "Enter") {
        e.preventDefault();
        replayQuiz();
      } else if (key === "Escape") {
        e.preventDefault();
        returnToMenu();
      }
      break;
    }
  }
});

/* ---------- init ---------- */
(async function init() {
  renderMenu();
  setSignal("idle");
  setHint("↑↓ выбрать · Enter принять");
  bindStaticControls();
  await Promise.all([loadChapters(), loadTickets()]);
})();
