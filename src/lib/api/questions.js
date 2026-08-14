/**
 * Загрузка вопросов главы: кэш (js/cache.js) → сеть → офлайн-подстраховка
 * протухшим кэшем, если сети нет. Раньше жила прямо в quiz.js, но
 * понадобилась и в admin.js — для поиска вопроса по всем главам и проверки
 * на дубликат при создании (см. admin.js). Вынесена в отдельный модуль,
 * а не импортирована из quiz.js в admin.js напрямую, потому что quiz.js
 * сам импортирует admin.js — вышел бы циклический импорт.
 */
import { state } from "../state.svelte.js";
import * as api from "./api.js";
import * as cache from "./cache.js";

export async function loadChapterQuestions(chapterId) {
  const cached = await cache.getChapterQuestions(chapterId);
  if (cached) return cached;

  try {
    const questions = await api.listQuestions(state.token, chapterId);
    await cache.setChapterQuestions(chapterId, questions);
    return questions;
  } catch (err) {
    const stale = await cache.getChapterQuestionsStale(chapterId);
    if (stale) return stale;
    throw err;
  }
}

/**
 * Ручной запуск кэширования (кнопка "Обновить кэш сейчас" в профиле, см.
 * render.renderCacheStatus/controls.js) — не ждёт, пока пользователь сам
 * дойдёт до каждой главы, а сразу тянет с сервера список глав и вопросы
 * КАЖДОЙ главы по очереди, обновляя дисковый кэш. Специально по одной
 * главе за раз, а не Promise.all — так onProgress даёт честный счётчик
 * "готово X из Y", и на слабом канале запросы не толкаются одновременно.
 * chapterId, на котором не хватило места на диске (см. cache.js),
 * просто не даст своей главе закэшироваться — остальные это не остановит,
 * а вызывающий код (renderCacheStatus) покажет актуальное состояние по
 * cache.getStatus() уже после того, как всё это отработает.
 */
export async function refreshAllCache(onProgress) {
  const chapters = await api.listChapters(state.token);
  state.chapters = chapters;
  await cache.setChapters(chapters);
  state.questionPoolCache = null; // главы могли обновиться — старый пул для random/exam больше не актуален

  const total = chapters.length;
  onProgress?.(0, total);
  let cached = 0;
  let textOnly = 0;
  for (let i = 0; i < chapters.length; i++) {
    const questions = await api.listQuestions(state.token, chapters[i].id);
    // setChapterQuestions() возвращает "full"/"text"/false — раньше провал
    // молча терялся, и кнопка "Обновить кэш" рапортовала об успехе, даже
    // если реально не закэшировалась ни одна глава (см. cache.js).
    const result = await cache.setChapterQuestions(chapters[i].id, questions);
    if (result) cached++;
    if (result === "text") textOnly++;
    onProgress?.(i + 1, total);
  }
  return { chapters: total, cached, textOnly };
}
