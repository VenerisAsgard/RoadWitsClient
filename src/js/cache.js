/**
 * Дисковый кэш списков вопросов по главам (localStorage — он в Tauri
 * webview и так живёт в профиле приложения на этом ПК, ничего
 * дополнительно поднимать не нужно).
 *
 * Раньше пул вопросов для random/exam пересчитывался с нуля при каждом
 * запуске приложения (state.questionPoolCache — только на сессию, см.
 * quiz.js), а режим "по главам" вообще не кэшировался: заход в каждую
 * главу заново дёргал сеть. На небольшой базе вопросов это не страшно,
 * но с ростом базы список по главам стал заметно долго грузиться.
 *
 * Ключ кэша включает fingerprint устройства и id пользователя (см.
 * cacheKey), поэтому:
 *  - кэш, записанный на одном ПК, не подставится на другом — там
 *    просто не окажется файла с таким ключом (localStorage и так не
 *    синхронизируется между машинами, но ключ на всякий случай не
 *    завязан только на userId, который мог бы совпасть на сервере
 *    с другим устройством);
 *  - смена аккаунта на том же ПК тоже не подхватит чужой кэш — у
 *    другого userId свой ключ.
 * Кэш ещё и живёт ограниченное время (TTL_MS) и полностью сбрасывается
 * при любом изменении контента редактором/админом (см. admin.js
 * reloadChapters → clearAll), так что подтянуть его на этом же ПК под
 * тем же аккаунтом безопасно даже после правок.
 */
import { state } from "./state.js";

const CACHE_PREFIX = "rw_qcache_v1_";
const TTL_MS = 60 * 60 * 1000; // час — достаточно, чтобы не дёргать сеть на каждый заход в главу за сессию

function cacheKey() {
  const fp = state.fingerprint || "nofp";
  const uid = state.user?.id ?? "anon";
  return `${CACHE_PREFIX}${fp}_${uid}`;
}

function readEntry(ignoreTtl = false) {
  try {
    const raw = localStorage.getItem(cacheKey());
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || typeof data !== "object" || typeof data.savedAt !== "number") return null;
    if (!ignoreTtl && Date.now() - data.savedAt > TTL_MS) return null;
    return data;
  } catch {
    return null;
  }
}

function writeEntry(mutate) {
  try {
    // Мёрджим на "протухший, но всё ещё в файле" снимок (ignoreTtl), а не
    // только на свежий — иначе если общий TTL уже истёк, а обновляем мы
    // прямо сейчас только одну главу, все остальные ранее закэшированные
    // главы стёрлись бы из файла, хотя как офлайн-подстраховка они ещё
    // вполне годятся (см. getChapterQuestionsStale).
    const current = readEntry(true) || { savedAt: Date.now(), byChapter: {} };
    current.savedAt = Date.now();
    current.byChapter = current.byChapter || {};
    mutate(current);
    localStorage.setItem(cacheKey(), JSON.stringify(current));
  } catch {
    // localStorage может быть недоступен/переполнен — кэш тогда просто не работает,
    // это не повод ломать загрузку вопросов (см. вызывающий код в quiz.js).
  }
}

export function getChapters() {
  return readEntry()?.chapters ?? null;
}

export function setChapters(chapters) {
  writeEntry((entry) => {
    entry.chapters = chapters;
  });
}

/** Игнорирует TTL — используется только как офлайн-подстраховка, когда
 * сеть недоступна и свежих данных взять неоткуда (см. quiz.js). */
export function getChaptersStale() {
  return readEntry(true)?.chapters ?? null;
}

const USER_CACHE_PREFIX = "rw_cacheduser_v1_";

/** Профиль пользователя с последнего успешного /auth/me — привязан только
 * к устройству (fingerprint), не к userId: на старте приложения, пока
 * сервер недоступен, мы ещё не знаем, чей это токен. Нужен для офлайн-входа
 * (см. auth.tryAutoLogin) — если сервера просто нет на связи, приложение
 * всё равно должно уметь войти на сохранённых данных, а не разлогинивать. */
export function getCachedUser(fingerprint) {
  try {
    const raw = localStorage.getItem(USER_CACHE_PREFIX + (fingerprint || "nofp"));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function setCachedUser(fingerprint, user) {
  try {
    localStorage.setItem(USER_CACHE_PREFIX + (fingerprint || "nofp"), JSON.stringify(user));
  } catch {
    // см. комментарий в writeEntry — некритично, просто не будет офлайн-входа
  }
}

/** Список вопросов главы, если он ещё не протух — иначе null. */
export function getChapterQuestions(chapterId) {
  return readEntry()?.byChapter?.[chapterId] ?? null;
}

/** Как getChapterQuestions, но игнорирует TTL — офлайн-подстраховка. */
export function getChapterQuestionsStale(chapterId) {
  return readEntry(true)?.byChapter?.[chapterId] ?? null;
}

export function setChapterQuestions(chapterId, questions) {
  writeEntry((entry) => {
    entry.byChapter[chapterId] = questions;
  });
}

/** Полностью сбросить кэш этого устройства+аккаунта — после любой правки
 * контента редактором/админом (см. admin.js reloadChapters). */
export function clearAll() {
  try {
    localStorage.removeItem(cacheKey());
  } catch {
    // см. комментарий в writeEntry
  }
}
