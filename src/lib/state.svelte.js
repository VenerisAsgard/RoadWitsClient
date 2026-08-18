/**
 * Единое состояние приложения — перенесено из src-legacy/js/state.js.
 *
 * УЛУЧШЕНИЕ: в оригинале это был обычный мутируемый объект, а экраны
 * узнавали об изменениях только потому, что render.js вручную перечитывал
 * его и руками правил DOM после каждого действия. $state() из Svelte 5
 * делает этот же объект реактивным: компоненты, которые читают state.xxx,
 * перерисовываются сами при изменении — форма (state.token = x) и весь
 * остальной код, который эти поля читает/пишет, не поменялись.
 *
 * JSDoc-типы ниже — не часть переноса как такового, а отдельное улучшение:
 * без них `user: null` в инициализаторе выводился TypeScript'ом как тип
 * `never`, и svelte-check шумел на КАЖДОМ обращении к state.user по всему
 * проекту (даже в файлах, которых перенос не касался). Явные @type
 * возвращают нормальную проверку типов вместо повсеместного `any`/`never`.
 */

/**
 * @typedef {Object} User
 * @property {number} id
 * @property {string} product_key
 * @property {string} email
 * @property {string|null} first_name
 * @property {string|null} last_name
 * @property {string|null} license_until
 * @property {"admin"|"editor"|"student"} user_type
 * @property {boolean} is_blocked
 * @property {Record<string, any>} [settings]
 * @property {string|null} [profile_photo]
 */

/**
 * @typedef {Object} Chapter
 * @property {number} id
 * @property {number} [num]
 * @property {string} title
 * @property {string} [description]
 * @property {number} [count]
 */

/**
 * @typedef {Object} Question
 * @property {number} id
 * @property {string} text
 * @property {string[]} options
 * @property {number} correctIndex
 * @property {string} explanation
 * @property {string|null} image
 * @property {string|null} [createdByEmail]
 * @property {string|null} [createdAt]
 * @property {number} [chapterId]
 */

/**
 * @typedef {Object} License
 * @property {number} id
 * @property {string} product_key
 * @property {"admin"|"editor"|"student"} user_type
 * @property {string|null} email
 * @property {string|null} first_name
 * @property {string|null} last_name
 * @property {string|null} license_until
 * @property {boolean} is_blocked
 * @property {number} max_devices
 * @property {number} device_count
 * @property {string} [created_at]
 */

export const state = $state({
  // --- auth ---
  token: /** @type {string|null} */ (null),
  /** @type {User|null} */
  user: null,
  fingerprint: /** @type {string|null} */ (null), // ID устройства — используется как часть ключа кэша (см. cache.js)

  questionsLoading: false,

  // --- навигация по экранам после входа ---
  screen: "menu", // "menu" | "chapters" | "random-count" | "question" | "result" | "profile" | "settings" | "admin" | "credits"
  profileReturnScreen: "menu",
  originScreen: "menu",

  // --- меню и главы ---
  /** @type {Chapter[]} */
  chapters: [],
  menuIndex: 0,
  chapterIndex: 0,
  /** @type {Set<number>} */
  checkedChapters: new Set(),

  // --- выбор количества вопросов для случайного билета ---
  randomCountIndex: 1,
  randomCount: 10,

  // --- редактирование контента (editor/admin) ---
  editMode: false,
  /** @type {Question[]} */
  editorQuestions: [],

  // --- панель администрирования ---
  /** @type {License[]} */
  licenses: [],
  licenseFilter: "",
  licenseSort: { field: /** @type {string} */ ("created_at"), dir: /** @type {"asc"|"desc"} */ ("desc") },

  // --- прохождение теста ---
  mode: /** @type {"chapter"|"random"|"exam"|null} */ (null),
  chapterId: /** @type {number|null} */ (null),
  multiChapterIds: /** @type {number[]|null} */ (null),
  /** @type {Question[]} */
  questions: [],
  currentQ: 0,
  /** @type {Record<number, number>} */
  answers: {},
  /** @type {Record<number, number>} */
  selected: {},

  timerSeconds: 0,
  timerHandle: /** @type {number|null} */ (null),
  connectionStatus: "checking",
  connectionDetail: "",
  appVersion: "",
  examErrors: 0,
  examFailed: false,

  // --- результат последнего теста (см. quiz.js finishQuiz) ---
  // score = correct - incorrect — баллы за тест: +1 верный, -1 неверный,
  // 0 пропущенный (УЛУЧШЕНИЕ поверх оригинала, где был только % правильных).
  /** @type {{correct: number, incorrect: number, total: number, pct: number, passed: boolean, isExam: boolean, score: number}|null} */
  lastResult: null,

  // --- разбор результата ---
  reviewIndex: 0,

  // --- кэш всех вопросов (режимы random/exam) ---
  /** @type {Question[]|null} */
  questionPoolCache: null,

  // --- UI-уровень, которого не было в оригинале как part of state:
  // сплэш и логин теперь управляются реактивно, а не через классы .hidden ---
  booting: true, // пока true — показан сплэш поверх всего
  loggedIn: false,
  loginSubmitting: false,
  loginError: "",
});

/** Может редактировать контент (главы/задания) — и editor, и admin. */
export function canEditContent() {
  return !!state.user && (state.user.user_type === "admin" || state.user.user_type === "editor");
}

export function userSettings() {
  return state.user?.settings && typeof state.user.settings === "object" ? state.user.settings : {};
}

export function isLightTheme() {
  return userSettings().theme === "light";
}

/** Пресеты акцентного цвета — по запросу из ai_work.md todo. Ключ "amber" —
 * цвет по умолчанию (совпадает с --amber из variables.css), поэтому для
 * него никакого CSS-переопределения не требуется — только именование
 * пункта в списке выбора. */
export const ACCENT_PRESETS = [
  { id: "amber", label: "Янтарный", swatch: "#ffb020" },
  { id: "blue", label: "Синий", swatch: "#3d8bfd" },
  { id: "green", label: "Зелёный", swatch: "#3acb6e" },
  { id: "purple", label: "Фиолетовый", swatch: "#a06bff" },
  { id: "rose", label: "Розовый", swatch: "#ff5c8a" },
  { id: "teal", label: "Бирюзовый", swatch: "#2bd0c9" },
];

export function accentColor() {
  const id = userSettings().accent;
  return ACCENT_PRESETS.some((p) => p.id === id) ? id : "amber";
}

export function isAdmin() {
  return !!state.user && state.user.user_type === "admin";
}

export const MENU_ITEMS = [
  {
    id: "chapter",
    title: "Тренировка по главам ПДД",
    sub: "Отметь одну или несколько глав и отвечай без ограничения по времени",
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

export const RANDOM_COUNT_OPTIONS = [10, 30, 60, 90];

export const ROLE_LABELS = {
  admin: "Администратор",
  editor: "Редактор",
  student: "Ученик",
};
