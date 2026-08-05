/**
 * Единое состояние приложения. Здесь нет функций, только данные —
 * все модули читают/пишут в один и тот же объект вместо того, чтобы
 * тащить состояние каждый в своих замыканиях.
 */
export const state = {
  // --- auth ---
  token: null,
  user: null, // { id, email, first_name, last_name, license_until, user_type, is_blocked, settings, profile_photo }

  // --- навигация по экранам после входа ---
  screen: "menu", // "menu" | "chapters" | "random-count" | "question" | "result" | "profile"
  profileReturnScreen: "menu", // куда вернуться из профиля по Esc/кнопке "назад"
  originScreen: "menu", // куда вернуться, если выйти из ТЕКУЩЕГО теста незавершённым
  // (не путать с profileReturnScreen — это конкретно про "откуда начали тест":
  // chapters/random-count/menu, чтобы не кидать на корень меню без необходимости)

  // --- меню и главы ---
  chapters: [], // нормализованные главы с бэкенда, см. js/api.js
  menuIndex: 0,
  chapterIndex: 0,
  checkedChapters: new Set(), // мультивыбор нескольких глав разом (Space/чекбокс)

  // --- выбор количества вопросов для случайного билета ---
  randomCountIndex: 1,
  randomCount: 10,

  // --- редактирование контента (editor/admin) ---
  editMode: false, // переключатель "режима редактирования" на экране глав
  editorQuestions: [], // вопросы выбранной главы при просмотре её как editor/admin (не как прохождение теста)

  // --- прохождение теста ---
  mode: null, // "chapter" | "random" | "exam"
  chapterId: null, // выбрана ровно одна глава
  multiChapterIds: null, // выбрано несколько глав разом (см. checkedChapters)
  questions: [], // нормализованные вопросы текущего прохождения
  currentQ: 0,
  answers: {}, // { [questionId]: подтверждённый индекс варианта — уже раскрыт цветом }
  selected: {}, // { [questionId]: индекс, выбранный с клавиатуры, но ещё НЕ подтверждённый }

  timerSeconds: 0,
  timerHandle: null,
  connectionStatus: "checking",
  appVersion: "", // версия приложения (Tauri, см. device.getAppVersion()) — показывается рядом со статусом сервера
  examErrors: 0,
  examFailed: false,

  // --- разбор результата ---
  reviewIndex: 0,

  // --- кэш всех вопросов (для режимов "random"/"exam", которые тянут
  // вопросы сразу по всем главам) — считается один раз за сессию,
  // см. getQuestionPool() в js/quiz.js ---
  questionPoolCache: null,
};

/** Может редактировать контент (главы/задания) — и editor, и admin. */
export function canEditContent() {
  return !!state.user && (state.user.user_type === "admin" || state.user.user_type === "editor");
}

/** Может создавать/удалять главы и лицензии — только admin. */
export function userSettings() {
  return state.user?.settings && typeof state.user.settings === "object" ? state.user.settings : {};
}

export function isLightTheme() { return userSettings().theme === "light"; }

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
