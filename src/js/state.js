/**
 * Единое состояние приложения. Здесь нет функций, только данные —
 * все модули читают/пишут в один и тот же объект вместо того, чтобы
 * тащить состояние каждый в своих замыканиях.
 */
export const state = {
  // --- auth ---
  token: null,
  user: null, // { id, email, first_name, last_name, license_until, user_type, is_blocked, settings, payment_info }

  // --- навигация по экранам после входа ---
  screen: "menu", // "menu" | "chapters" | "question" | "result" | "profile"
  profileReturnScreen: "menu", // куда вернуться из профиля по Esc/кнопке "назад"

  // --- меню и главы ---
  chapters: [], // нормализованные главы с бэкенда, см. js/api.js
  menuIndex: 0,
  chapterIndex: 0,

  // --- редактирование контента (editor/admin) ---
  editMode: false, // переключатель "режима редактирования" на экране глав
  editorQuestions: [], // вопросы выбранной главы при просмотре её как editor/admin (не как прохождение теста)

  // --- прохождение теста ---
  mode: null, // "chapter" | "random" | "exam"
  chapterId: null,
  questions: [], // нормализованные вопросы текущего прохождения
  currentQ: 0,
  answers: {}, // { [questionId]: подтверждённый индекс варианта — уже раскрыт цветом }
  selected: {}, // { [questionId]: индекс, выбранный с клавиатуры, но ещё НЕ подтверждённый }

  timerSeconds: 0,
  timerHandle: null,

  // --- разбор результата ---
  reviewIndex: 0,

  // --- двухшаговый Esc, чтобы не терять прогресс по случайному нажатию ---
  escArmed: false,
  escTimeout: null,

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
export function isAdmin() {
  return !!state.user && state.user.user_type === "admin";
}

export const MENU_ITEMS = [
  {
    id: "chapter",
    title: "Тренировка по главам ПДД",
    sub: "Выбери главу и отвечай без ограничения по времени",
  },
  {
    id: "random",
    title: "Тренировка по случайному билету",
    sub: "5 случайных вопросов, мгновенная проверка ответа",
  },
  {
    id: "exam",
    title: "Контрольный экзамен",
    sub: "Официальный формат, обратный отсчёт, разбор ошибок",
  },
];

export const ROLE_LABELS = {
  admin: "Администратор",
  editor: "Редактор",
  student: "Ученик",
};
