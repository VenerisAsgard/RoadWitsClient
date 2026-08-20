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

/** Проставляет chapterId на каждый вопрос главы — бэкенд его не отдаёт
 * (вопрос и так лежит внутри /chapters/{id}/questions), а он нужен клиенту:
 * и разбору ответов (см. ResultScreen.svelte — "к какой главе принадлежит
 * вопрос"), и редактированию вопроса из середины теста (см. QuestionScreen/
 * QuestionFormModal — билет random/exam мешает вопросы из разных глав,
 * без chapterId было бы не с каким chapterId слать PATCH на сохранение).
 * @param {any[]} questions
 * @param {number} chapterId
 */
function withChapterId(questions, chapterId) {
  return questions.map((q) => (q.chapterId === chapterId ? q : { ...q, chapterId }));
}

/** @param {number} chapterId */
export async function loadChapterQuestions(chapterId) {
  const cached = await cache.getChapterQuestions(chapterId);
  if (cached) return withChapterId(cached, chapterId);

  try {
    const questions = await api.listQuestions(state.token, chapterId);
    await cache.setChapterQuestions(chapterId, questions);
    return withChapterId(questions, chapterId);
  } catch (err) {
    const stale = await cache.getChapterQuestionsStale(chapterId);
    if (stale) return withChapterId(stale, chapterId);
    throw err;
  }
}

/**
 * Ручной запуск кэширования (кнопка "Обновить кэш сейчас" в профиле, см.
 * render.renderCacheStatus/controls.js) — не ждёт, пока пользователь сам
 * дойдёт до каждой главы, а сразу тянет с сервера список глав и вопросы
 * КАЖДОЙ главы по очереди, обновляя дисковый кэш. Специально по одной
 * главе за раз, а не Promise.all — так onProgress даёт честный счётчик
 * и на слабом канале запросы не толкаются одновременно.
 *
 * onProgress получает { chaptersDone, chaptersTotal, questionsDone,
 * questionsTotal } — questionsTotal берётся из question_count, который
 * бэкенд отдаёт вместе со списком глав, ещё до похода за самими вопросами,
 * так что прогресс-бар сразу знает общее число и показывает реальную долю
 * скачанных вопросов, а не просто "глава N из M" (одна глава с полусотней
 * фото-вопросов и глава из трёх вопросов раньше занимали в индикаторе
 * одинаковый "один шаг"). questionsDone теперь растёт не только между
 * главами, но и ВНУТРИ главы, по мере того как приходят её вопросы (см.
 * api.listQuestions/requestQuestionsWithProgress в api.js) — раньше глава
 * из полусотни вопросов "висела" на месте до последнего байта ответа, а
 * потом сразу вся засчитывалась разом.
 *
 * Оптимизация загрузки: глава, чей дисковый кэш ещё не протух (см. TTL_MS
 * в cache.js), с сервера вообще не перезапрашивается — "Обновить кэш
 * сейчас" раньше безусловно перекачивало ВСЕ главы целиком (включая все
 * фото) при каждом нажатии, даже если ничего не изменилось с прошлого
 * раза. Теперь свежие главы просто засчитываются как уже готовые — это и
 * есть тот самый смысл TTL (см. заголовок cache.js), просто раньше кнопка
 * его игнорировала. force=true (см. ниже) отключает эту проверку, если
 * когда-нибудь понадобится настоящая безусловная перекачка.
 *
 * Ошибка на одной главе (например, сервер не успел ответить за отведённое
 * время — см. QUESTIONS_FETCH_TIMEOUT_MS в config.js) больше не обрывает
 * весь процесс: остальные главы всё равно докачиваются, а неудавшиеся
 * просто останутся на прежней (возможно, более старой) версии кэша и
 * попробуют снова при следующем "Обновить кэш" — вызывающий код (см.
 * SettingsScreen.svelte) сообщает об этом отдельным тостом через
 * failedChapters, вместо одной общей ошибки "сервер не отвечает" без
 * подробностей.
 * @param {(progress: {chaptersDone: number, chaptersTotal: number, questionsDone: number, questionsTotal: number}) => void} [onProgress]
 * @param {{force?: boolean}} [options] — force=true пропускает проверку
 *   свежести кэша и перекачивает вообще все главы, как раньше.
 */
export async function refreshAllCache(onProgress, { force = false } = {}) {
  const chapters = await api.listChapters(state.token);
  state.chapters = chapters;
  await cache.setChapters(chapters);
  state.questionPoolCache = null; // главы могли обновиться — старый пул для random/exam больше не актуален

  const chaptersTotal = chapters.length;
  const questionsTotal = chapters.reduce((sum, c) => sum + (c.count || 0), 0);
  let chaptersDone = 0;
  let questionsDone = 0;
  let cached = 0;
  let textOnly = 0;
  let skipped = 0;
  let failedChapters = 0;

  const report = () => onProgress?.({ chaptersDone, chaptersTotal, questionsDone, questionsTotal });
  report();

  for (const chapter of chapters) {
    try {
      // Пропускаем сеть целиком, если на диске уже есть свежая (не старше
      // TTL_MS) копия этой главы — см. пояснение про оптимизацию выше.
      if (!force) {
        const fresh = await cache.getChapterQuestions(chapter.id);
        if (fresh) {
          cached++;
          skipped++;
          questionsDone += fresh.length;
          chaptersDone++;
          report();
          continue;
        }
      }

      // Прогресс ВНУТРИ главы: questionsDone уже учитывает предыдущие
      // главы (questionsDoneBefore) — onQuestionProgress репортует
      // АБСОЛЮТНОЕ число вопросов, пришедших в этой главе на данный
      // момент, поэтому просто складываем с тем, что было накоплено раньше.
      const questionsDoneBefore = questionsDone;
      const onChapterProgress = (n) => {
        questionsDone = questionsDoneBefore + n;
        report();
      };

      let questions;
      try {
        questions = await api.listQuestions(state.token, chapter.id, onChapterProgress);
      } catch (err) {
        // Один повтор перед тем, как считать главу неудавшейся: "сервер
        // не отвечает" на медленном канале (см. QUESTIONS_FETCH_TIMEOUT_MS)
        // часто оказывается разовой заминкой, а не реальным обрывом связи —
        // повтор почти всегда проходит и избавляет от лишнего ручного клика
        // "Обновить кэш ещё раз". Настоящий обрыв связи (err.status === 0
        // и это не таймаут) повторять бессмысленно — сеть либо есть, либо
        // нет прямо сейчас.
        const retryable = err instanceof api.ApiError && err.status === 0;
        if (!retryable) throw err;
        questionsDone = questionsDoneBefore;
        questions = await api.listQuestions(state.token, chapter.id, onChapterProgress);
      }
      // setChapterQuestions() возвращает "full"/"text"/false — раньше провал
      // молча терялся, и кнопка "Обновить кэш" рапортовала об успехе, даже
      // если реально не закэшировалась ни одна глава (см. cache.js).
      const result = await cache.setChapterQuestions(chapter.id, questions);
      if (result) cached++;
      if (result === "text") textOnly++;
      questionsDone = questionsDoneBefore + questions.length; // точное число — на случай, если эвристика прогресса не досчиталась
    } catch {
      // См. пояснение выше — не прерываем цикл, просто считаем главу
      // неудавшейся и идём дальше.
      failedChapters++;
    }
    chaptersDone++;
    report();
  }
  return { chapters: chaptersTotal, cached, textOnly, failedChapters, skipped };
}
