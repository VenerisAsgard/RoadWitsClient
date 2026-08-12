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
 * ВАЖНО (v2 формата, см. миграцию с v1 ниже): каждая глава хранится под
 * СВОИМ отдельным ключом localStorage (rw_qcache_v2_<fp>_<uid>_ch_<id>),
 * а не все главы разом в одном общем JSON. Раньше (v1) весь кэш
 * пользователя — список глав и вопросы КАЖДОЙ главы, включая прикреплённые
 * фото в base64 — сериализовался в одну строку и писался одним
 * localStorage.setItem() под одним ключом. Проблема: localStorage
 * ограничен по объёму (обычно единицы МБ на источник), и как только
 * набор вопросов с фото по всем главам вместе перерастал этот лимит,
 * setItem() на общий ключ начинал падать (QuotaExceededError) —
 * СРАЗУ ДЛЯ ВСЕГО КЭША, а не только для той главы, что не поместилась.
 * Внешне это выглядело так, будто "кэш слетает": сегодня посмотрели
 * главу оффлайн — сохранилось, через пару глав с фото квота набралась —
 * и дальше ни одна новая глава уже не кэшируется, а после перезапуска
 * приложения (или через TTL) может не найтись вообще ничего, если самый
 * первый же setItem() крупного общего блока не прошёл. При раздельных
 * ключах на главу такая же нехватка места роняет кэш ровно одной
 * конкретной большой главы (см. writeJson: ошибка ловится и молча
 * возвращает false, остальной код это уже умеет переживать, см. вызывающий
 * код в quiz.js/questions.js) — все остальные, уже сохранённые главы,
 * никак не затрагиваются и продолжают отдаваться оффлайн.
 *
 * Ключ кэша включает fingerprint устройства и id пользователя (см.
 * baseKey), поэтому:
 *  - кэш, записанный на одном ПК, не подставится на другом — там
 *    просто не окажется файла с таким ключом (localStorage и так не
 *    синхронизируется между машинами, но ключ на всякий случай не
 *    завязан только на userId, который мог бы совпасть на сервере
 *    с другим устройством);
 *  - смена аккаунта на том же ПК тоже не подхватит чужой кэш — у
 *    другого userId свой ключ.
 * Кэш ещё и живёт ограниченное время (TTL_MS) для "свежих" чтений и
 * полностью сбрасывается при любом изменении контента редактором/админом
 * (см. admin.js reloadChapters → clearAll), так что подтянуть его на этом
 * же ПК под тем же аккаунтом безопасно даже после правок.
 */
import { state } from "./state.js";

const CACHE_PREFIX = "rw_qcache_v2_";
const OLD_CACHE_PREFIX = "rw_qcache_v1_"; // формат до разделения по ключам — только чтобы подчистить за собой
const TTL_MS = 60 * 60 * 1000; // час — достаточно, чтобы не дёргать сеть на каждый заход в главу за сессию

function baseKey() {
  const fp = state.fingerprint || "nofp";
  const uid = state.user?.id ?? "anon";
  return `${CACHE_PREFIX}${fp}_${uid}`;
}

function chaptersKey() {
  return `${baseKey()}_chapters`;
}

function chapterQuestionsKey(chapterId) {
  return `${baseKey()}_ch_${chapterId}`;
}

/** { savedAt, value } — обёртка одинаковая что для списка глав, что для
 * вопросов одной главы, чтобы читать/писать их одной парой функций. */
function readEntry(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || typeof data !== "object" || typeof data.savedAt !== "number") return null;
    return data;
  } catch {
    return null;
  }
}

function isFresh(entry) {
  return !!entry && Date.now() - entry.savedAt <= TTL_MS;
}

/** Возвращает true при успехе — вызывающий код (см. getStatus) использует
 * это, чтобы честно показать в интерфейсе, если конкретную главу закэшировать
 * не удалось (например, не хватило места из-за большого фото), а не молчать
 * об этом, как раньше. */
function writeEntry(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify({ savedAt: Date.now(), value }));
    return true;
  } catch {
    // localStorage может быть недоступен/переполнен — кэш тогда просто не
    // работает для ЭТОГО ключа, это не повод ломать загрузку вопросов
    // (см. вызывающий код в quiz.js/questions.js) и не повод стирать уже
    // сохранённые под другими ключами главы (см. комментарий в шапке файла).
    return false;
  }
}

export function getChapters() {
  const e = readEntry(chaptersKey());
  return isFresh(e) ? e.value : null;
}

export function setChapters(chapters) {
  return writeEntry(chaptersKey(), chapters);
}

/** Игнорирует TTL — используется только как офлайн-подстраховка, когда
 * сеть недоступна и свежих данных взять неоткуда (см. quiz.js). */
export function getChaptersStale() {
  const e = readEntry(chaptersKey());
  return e ? e.value : null;
}

/** Список вопросов главы, если он ещё не протух — иначе null. */
export function getChapterQuestions(chapterId) {
  const e = readEntry(chapterQuestionsKey(chapterId));
  return isFresh(e) ? e.value : null;
}

/** Как getChapterQuestions, но игнорирует TTL — офлайн-подстраховка. */
export function getChapterQuestionsStale(chapterId) {
  const e = readEntry(chapterQuestionsKey(chapterId));
  return e ? e.value : null;
}

export function setChapterQuestions(chapterId, questions) {
  return writeEntry(chapterQuestionsKey(chapterId), questions);
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

/** Все ключи дискового кэша (главы + вопросы всех глав) этого устройства+
 * аккаунта — общий помощник для clearAll/getStatus, чтобы не дублировать
 * перебор localStorage в двух местах. */
function ownKeys() {
  const prefix = baseKey();
  const keys = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(prefix)) keys.push(k);
    }
  } catch {
    // localStorage недоступен — пустой список, вызывающий код это переживёт
  }
  return keys;
}

/** Полностью сбросить дисковый кэш этого устройства+аккаунта — после любой
 * правки контента редактором/админом (см. admin.js reloadChapters) или по
 * явному запросу пользователя (см. кнопка "Очистить кэш" в профиле,
 * controls.js). Возвращает число реально удалённых ключей — используется
 * подтверждающим тостом после очистки. */
export function clearAll() {
  const keys = ownKeys();
  let removed = 0;
  keys.forEach((k) => {
    try {
      localStorage.removeItem(k);
      removed++;
    } catch {
      // см. комментарий в writeEntry
    }
  });
  return removed;
}

/**
 * Сводка о текущем состоянии дискового кэша — для подробного индикатора
 * кэширования в профиле (см. render.renderCacheStatus). Раньше пользователь
 * никак не мог узнать, есть ли у него офлайн-копия базы вопросов и
 * насколько она свежая — просто не было такого экрана.
 */
export function getStatus() {
  const chaptersEntry = readEntry(chaptersKey());
  const totalChapters = state.chapters.length || chaptersEntry?.value?.length || 0;

  let cachedChapterCount = 0;
  let approxBytes = 0;
  let oldestSavedAt = null;
  let newestSavedAt = null;

  ownKeys().forEach((k) => {
    let raw = null;
    try {
      raw = localStorage.getItem(k);
    } catch {
      return;
    }
    if (raw == null) return;
    approxBytes += raw.length; // приблизительно, в символах — точный байтовый размер тут не принципиален
    if (k.includes("_ch_")) cachedChapterCount++;
    try {
      const parsed = JSON.parse(raw);
      if (typeof parsed?.savedAt === "number") {
        if (oldestSavedAt === null || parsed.savedAt < oldestSavedAt) oldestSavedAt = parsed.savedAt;
        if (newestSavedAt === null || parsed.savedAt > newestSavedAt) newestSavedAt = parsed.savedAt;
      }
    } catch {
      // повреждённая запись — не мешаем остальной сводке
    }
  });

  return {
    hasChapterList: !!chaptersEntry,
    chaptersFresh: isFresh(chaptersEntry),
    cachedChapterCount,
    totalChapters,
    approxBytes,
    oldestSavedAt,
    newestSavedAt,
    ttlMs: TTL_MS,
  };
}

/** Подчищает кэш старого формата (v1, единый блок на всё) при заходе на
 * новый — сам по себе он больше не читается (другой префикс ключа), но
 * иначе так и остался бы висеть в localStorage бесполезным мёртвым грузом,
 * а на переполненной квоте это только мешает новому (v2) кэшу писаться. */
export function migrateOldCache() {
  try {
    const fp = state.fingerprint || "nofp";
    const uid = state.user?.id ?? "anon";
    const oldKey = `${OLD_CACHE_PREFIX}${fp}_${uid}`;
    if (localStorage.getItem(oldKey) !== null) localStorage.removeItem(oldKey);
  } catch {
    // не критично — просто не подчистили в этот раз
  }
}
