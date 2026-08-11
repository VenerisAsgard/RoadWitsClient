/**
 * Загрузка вопросов главы: кэш (js/cache.js) → сеть → офлайн-подстраховка
 * протухшим кэшем, если сети нет. Раньше жила прямо в quiz.js, но
 * понадобилась и в admin.js — для поиска вопроса по всем главам и проверки
 * на дубликат при создании (см. admin.js). Вынесена в отдельный модуль,
 * а не импортирована из quiz.js в admin.js напрямую, потому что quiz.js
 * сам импортирует admin.js — вышел бы циклический импорт.
 */
import { state } from "./state.js";
import * as api from "./api.js";
import * as cache from "./cache.js";

export async function loadChapterQuestions(chapterId) {
  const cached = cache.getChapterQuestions(chapterId);
  if (cached) return cached;

  try {
    const questions = await api.listQuestions(state.token, chapterId);
    cache.setChapterQuestions(chapterId, questions);
    return questions;
  } catch (err) {
    const stale = cache.getChapterQuestionsStale(chapterId);
    if (stale) return stale;
    throw err;
  }
}
