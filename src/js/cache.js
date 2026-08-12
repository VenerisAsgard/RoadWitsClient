/**
 * Дисковый кэш списков вопросов по главам — IndexedDB.
 *
 * ИСТОРИЯ: раньше (см. git-историю) это был localStorage, сначала одним
 * общим ключом на всё (v1), потом раздельными ключами на главу (v2), чтобы
 * нехватка места роняла кэш только одной большой главы, а не всего сразу.
 * Это помогало, но не решало саму проблему: localStorage у большинства
 * WebView-движков (в том числе того, что использует Tauri) ограничен
 * единицами мегабайт НА ВСЁ происхождение сразу, а вопросы с фото в base64
 * это место съедают быстро — на практике встречались главы, вес которых
 * в закодированном виде уже сам по себе превышал всю квоту, и тогда не
 * кэшировалось вообще ничего, даже после "Обновить кэш сейчас".
 *
 * IndexedDB — тот же браузерный API, что уже доступен в WebView без
 * дополнительных Tauri-плагинов, но с квотой на порядки больше (обычно
 * привязана к свободному месту на диске, а не к фиксированным единицам
 * мегабайт) и рассчитана именно на большие объёмы структурированных данных.
 * Отсюда и единственное существенное отличие от прежнего API: все функции
 * этого модуля теперь возвращают Promise (IndexedDB асинхронен по своей
 * природе) — весь вызывающий код (quiz.js/questions.js/admin.js/auth.js/
 * render.js) обновлён на await соответствующим образом.
 *
 * Устройство хранилища: одна база (DB_NAME), один object store (STORE),
 * простые пары ключ→значение — по сути тот же плоский key-value, что был
 * в localStorage, просто с другим бэкендом. Значение — та же обёртка
 * { savedAt, value }, что и раньше, для единой логики TTL/протухания.
 *
 * Ключ по-прежнему включает fingerprint устройства и id пользователя (см.
 * baseKey), поэтому кэш с одного ПК/аккаунта не подставится на другом —
 * IndexedDB и так не синхронизируется между машинами, но ключ не завязан
 * только на userId, который в теории мог бы совпасть на сервере с другим
 * устройством, и explicit-но не даёт смене аккаунта на этом же ПК подхватить
 * чужой кэш.
 *
 * TTL (см. TTL_MS) — это НЕ про место на диске (IndexedDB того не требует),
 * а про свежесть контента: если редактор поменял вопросы, кэш на других
 * устройствах должен когда-нибудь сам подтянуть изменения, даже если никто
 * не нажимал "Обновить кэш сейчас" и не подключался к тому же ПК, где
 * правки увидели сразу (см. admin.js reloadChapters → clearAll — тот
 * сценарий про устройство самого редактора). Пока запись не старше TTL_MS,
 * getChapters()/getChapterQuestions() отдают её без похода в сеть —
 * это и есть тот самый "кэш", ради которого всё затевалось (не дёргать
 * сеть на каждый заход в главу за сессию). После TTL запись не удаляется,
 * а просто перестаёт считаться "свежей" — следующий запрос идёт в сеть,
 * и либо перезаписывает её более новой версией, либо, если сети нет,
 * используется как офлайн-подстраховка через *Stale-версии функций ниже,
 * которые TTL игнорируют намеренно (протухший кэш офлайн лучше, чем
 * пустой экран).
 */
import { state } from "./state.js";

const DB_NAME = "roadwits_cache_v3"; // v3 = IndexedDB; v1/v2 (localStorage) подчищаются отдельно, см. migrateOldCache
const DB_VERSION = 1;
const STORE = "kv";

const CACHE_PREFIX = "rw_qcache_";
const TTL_MS = 60 * 60 * 1000; // час — см. пояснение про TTL в шапке файла

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

let dbPromise = null;
/** Одно открытое соединение на всё приложение — переоткрывать на каждый
 * вызов накладно, а IndexedDB и так спокойно переживает параллельные
 * транзакции на одном соединении. */
function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    let req;
    try {
      req = indexedDB.open(DB_NAME, DB_VERSION);
    } catch (err) {
      reject(err);
      return;
    }
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error("IndexedDB заблокирована другой вкладкой/окном"));
  }).catch((err) => {
    dbPromise = null; // не кэшируем неудачное открытие — следующий вызов попробует снова
    throw err;
  });
  return dbPromise;
}

function idbGet(key) {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, "readonly");
        const req = tx.objectStore(STORE).get(key);
        req.onsuccess = () => resolve(req.result ?? null);
        req.onerror = () => reject(req.error);
      }),
  );
}

function idbSet(key, value) {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, "readwrite");
        tx.objectStore(STORE).put(value, key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      }),
  );
}

function idbDelete(key) {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, "readwrite");
        tx.objectStore(STORE).delete(key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      }),
  );
}

/** Все ключи вида prefix* — общий помощник для clearAll/getStatus/ownKeys,
 * чтобы не дублировать перебор курсором в двух местах. */
function idbKeysWithPrefix(prefix) {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const keys = [];
        const tx = db.transaction(STORE, "readonly");
        const req = tx.objectStore(STORE).openKeyCursor();
        req.onsuccess = (e) => {
          const cursor = e.target.result;
          if (!cursor) {
            resolve(keys);
            return;
          }
          if (String(cursor.key).startsWith(prefix)) keys.push(cursor.key);
          cursor.continue();
        };
        req.onerror = () => reject(req.error);
      }),
  );
}

/** { savedAt, value } — обёртка одинаковая что для списка глав, что для
 * вопросов одной главы, чтобы читать/писать их одной парой функций. */
async function readEntry(key) {
  try {
    const data = await idbGet(key);
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
 * не удалось, а не молчать об этом, как раньше. IndexedDB на порядки менее
 * склонна упираться в квоту, чем localStorage, но диск всё равно не резиновый
 * (см. QuotaExceededError, которую тоже умеет бросать indexedDB.open/put при
 * действительно заполненном диске) — поэтому try/catch тут остаётся. */
async function writeEntry(key, value) {
  try {
    await idbSet(key, { savedAt: Date.now(), value });
    return true;
  } catch {
    // Диск недоступен/переполнен — кэш тогда просто не работает для ЭТОГО
    // ключа, это не повод ломать загрузку вопросов (см. вызывающий код в
    // quiz.js/questions.js) и не повод стирать уже сохранённые под другими
    // ключами главы.
    return false;
  }
}

export async function getChapters() {
  const e = await readEntry(chaptersKey());
  return isFresh(e) ? e.value : null;
}

export function setChapters(chapters) {
  return writeEntry(chaptersKey(), chapters);
}

/** Игнорирует TTL — используется только как офлайн-подстраховка, когда
 * сеть недоступна и свежих данных взять неоткуда (см. quiz.js). */
export async function getChaptersStale() {
  const e = await readEntry(chaptersKey());
  return e ? e.value : null;
}

/** Список вопросов главы, если он ещё не протух — иначе null. */
export async function getChapterQuestions(chapterId) {
  const e = await readEntry(chapterQuestionsKey(chapterId));
  return isFresh(e) ? e.value : null;
}

/** Как getChapterQuestions, но игнорирует TTL — офлайн-подстраховка. */
export async function getChapterQuestionsStale(chapterId) {
  const e = await readEntry(chapterQuestionsKey(chapterId));
  return e ? e.value : null;
}

/**
 * Возвращает "full", если глава закэширована полностью (с фото), "text" —
 * если на диске совсем не осталось места и мы сохранили главу без фото
 * (вопросы/ответы — то, что реально нужно для тренировки офлайн), или
 * false, если не влезло вообще ничего. С IndexedDB это должно случаться
 * практически никогда (квота — это свободное место на диске, а не единицы
 * мегабайт), но подстраховка почти бесплатна, так что она остаётся.
 */
export async function setChapterQuestions(chapterId, questions) {
  const key = chapterQuestionsKey(chapterId);
  if (await writeEntry(key, questions)) return "full";

  const withoutImages = questions.map((q) => (q.image ? { ...q, image: null } : q));
  if (await writeEntry(key, withoutImages)) return "text";

  return false;
}

const USER_CACHE_PREFIX = "rw_cacheduser_";

/** Профиль пользователя с последнего успешного /auth/me — привязан только
 * к устройству (fingerprint), не к userId: на старте приложения, пока
 * сервер недоступен, мы ещё не знаем, чей это токен. Нужен для офлайн-входа
 * (см. auth.tryAutoLogin) — если сервера просто нет на связи, приложение
 * всё равно должно уметь войти на сохранённых данных, а не разлогинивать. */
export async function getCachedUser(fingerprint) {
  try {
    return await idbGet(USER_CACHE_PREFIX + (fingerprint || "nofp"));
  } catch {
    return null;
  }
}

export async function setCachedUser(fingerprint, user) {
  try {
    await idbSet(USER_CACHE_PREFIX + (fingerprint || "nofp"), user);
  } catch {
    // см. комментарий в writeEntry — некритично, просто не будет офлайн-входа
  }
}

/** Все ключи дискового кэша (главы + вопросы всех глав) этого устройства+
 * аккаунта — НЕ включает USER_CACHE_PREFIX (кэш пользователя переживает
 * "Очистить кэш"/reloadChapters нарочно: это не контент вопросов, а просто
 * последний известный профиль для офлайн-входа). */
async function ownKeys() {
  try {
    return await idbKeysWithPrefix(baseKey());
  } catch {
    return [];
  }
}

/** Полностью сбросить дисковый кэш вопросов этого устройства+аккаунта —
 * после любой правки контента редактором/админом (см. admin.js
 * reloadChapters) или по явному запросу пользователя (см. кнопка
 * "Очистить кэш" в профиле, controls.js). Возвращает число реально
 * удалённых ключей — используется подтверждающим тостом после очистки. */
export async function clearAll() {
  const keys = await ownKeys();
  let removed = 0;
  for (const k of keys) {
    try {
      await idbDelete(k);
      removed++;
    } catch {
      // см. комментарий в writeEntry
    }
  }
  return removed;
}

/**
 * Сводка о текущем состоянии дискового кэша — для подробного индикатора
 * кэширования в профиле (см. render.renderCacheStatus). Раньше пользователь
 * никак не мог узнать, есть ли у него офлайн-копия базы вопросов и
 * насколько она свежая — просто не было такого экрана.
 */
export async function getStatus() {
  const chaptersEntry = await readEntry(chaptersKey());
  const keys = await ownKeys();
  const totalChapters = state.chapters.length || chaptersEntry?.value?.length || 0;

  let cachedChapterCount = 0;
  let approxBytes = 0;
  let oldestSavedAt = null;
  let newestSavedAt = null;

  for (const k of keys) {
    let raw = null;
    try {
      raw = await idbGet(k);
    } catch {
      continue;
    }
    if (raw == null) continue;
    // Точный байтовый размер тут не принципиален — JSON.stringify().length
    // достаточно близко для индикатора "занимает ~N МБ" в интерфейсе.
    try {
      approxBytes += JSON.stringify(raw).length;
    } catch {
      // не сериализуется — пропускаем оценку размера именно этой записи
    }
    if (k.includes("_ch_")) cachedChapterCount++;
    if (typeof raw?.savedAt === "number") {
      if (oldestSavedAt === null || raw.savedAt < oldestSavedAt) oldestSavedAt = raw.savedAt;
      if (newestSavedAt === null || raw.savedAt > newestSavedAt) newestSavedAt = raw.savedAt;
    }
  }

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

/** Подчищает кэш старых форматов (v1/v2, оба жили в localStorage) при
 * заходе на новый (IndexedDB) — сами по себе они больше не читаются, но
 * иначе так и остались бы висеть в localStorage бесполезным мёртвым грузом
 * и продолжали бы съедать ту самую тесную квоту, из-за которой мы вообще
 * переехали на IndexedDB. */
export function migrateOldCache() {
  try {
    const fp = state.fingerprint || "nofp";
    const uid = state.user?.id ?? "anon";
    const suffix = `${fp}_${uid}`;
    const prefixesToClean = ["rw_qcache_v1_", "rw_qcache_v2_"];
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (!k) continue;
      if (prefixesToClean.some((p) => k === `${p}${suffix}` || k.startsWith(`${p}${suffix}_`))) {
        localStorage.removeItem(k);
      }
    }
    // Старый кэш профиля пользователя (v1, localStorage) — тоже больше не
    // читается (см. getCachedUser/setCachedUser выше, теперь IndexedDB).
    const oldUserKey = "rw_cacheduser_v1_" + fp;
    if (localStorage.getItem(oldUserKey) !== null) localStorage.removeItem(oldUserKey);
  } catch {
    // не критично — просто не подчистили в этот раз
  }
}
