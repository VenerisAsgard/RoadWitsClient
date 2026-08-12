/**
 * Всё, что касается самого Tauri-окружения (не бэкенда, не рендера) —
 * вызовы invoke() к Rust-командам из src-tauri/src/lib.rs, управление
 * окном, отключение поведений, неуместных для десктоп-приложения.
 *
 * window.__TAURI__ доступен благодаря "app.withGlobalTauri": true
 * в src-tauri/tauri.conf.json.
 */
const invoke = window.__TAURI__.core.invoke;

/**
 * pointer:coarse — самый надёжный кросс-платформенный признак "это тач-устройство"
 * (телефон/планшет), не завязанный на ширину окна: большой Android-планшет
 * в альбомной ориентации всё равно останется тач-устройством и на нём не должно
 * быть кнопок управления окном/подсказок клавиатуры — а десктопное окно даже
 * при таком же пикселном размере пусть их сохраняет.
 */
export const isTouchDevice = window.matchMedia("(pointer: coarse)").matches;
let devtoolsAllowed = false;
export function setDevtoolsAllowed(value) { devtoolsAllowed = !!value; }

/* ============================================================
   Хранение сессии (fingerprint устройства, JWT).
   Интерфейс отсюда не поменялся, но под капотом — tauri-plugin-store:
   Rust-команды ниже (см. src-tauri/src/lib.rs) сами читают/пишут в
   store через StoreExt, а не в самодельный JSON-файл, как раньше.
   Значения в этом store — не читаемый текст, а AES-256-GCM
   шифротекст, ключ для которого выводится из ID конкретного
   устройства и нигде не сохраняется, поэтому расшифровать сохранённый
   fingerprint/токен получится только на том же устройстве, где они
   были сохранены. Дергаем именно свои команды (а не JS-биндинги
   плагина напрямую) — так проще, и здесь чистый JS без сборщика,
   под npm-пакет @tauri-apps/plugin-store не заточенный.
   ============================================================ */

export async function getFingerprint() {
  return invoke("get_fingerprint");
}

export async function saveToken(token) {
  return invoke("save_token", { token });
}

export async function loadToken() {
  try {
    return await invoke("load_token");
  } catch (err) {
    console.error("Не удалось прочитать сохранённый токен:", err);
    return null;
  }
}

export async function clearToken() {
  try {
    await invoke("clear_token");
  } catch {
    // если стереть не удалось — не блокируем логаут из-за этого
  }
}

/**
 * Версия приложения (из tauri.conf.json/Cargo.toml) — показывается в
 * status-bar рядом со статусом сервера, чтобы было видно, какая сборка
 * запущена, не открывая "О программе". Требует core:app:allow-version
 * в capabilities/default.json.
 */
export async function getAppVersion() {
  try {
    return await window.__TAURI__.app.getVersion();
  } catch (err) {
    return "";
  }
}

/* ============================================================
   Управление окном (кастомный титлбар, decorations:false)
   ============================================================ */

export async function openDevtools() {
  const appWindow = window.__TAURI__.window.getCurrentWindow();
  if (typeof appWindow.openDevtools === "function") await appWindow.openDevtools();
}

export function initWindowControls() {
  const { getCurrentWindow } = window.__TAURI__.window;
  const appWindow = getCurrentWindow();

  document.getElementById("minimize").addEventListener("click", () => {
    appWindow.minimize();
  });

  document.getElementById("maximize").addEventListener("click", async () => {
    if (await appWindow.isMaximized()) {
      await appWindow.unmaximize();
    } else {
      await appWindow.maximize();
    }
  });

  document.getElementById("close").addEventListener("click", () => {
    appWindow.close();
  });
}

/**
 * Приложение должно оставаться горизонтальным на десктопе — minWidth/minHeight
 * в tauri.conf.json (860x520) уже не дают окну стать совсем маленьким и узким,
 * но это не мешает вытянуть окно по высоте больше ширины, перетаскивая только
 * нижнюю границу. minWidth/minHeight/maxHeight — это статичные границы, а не
 * "держи пропорцию" — в Tauri v2 нет отдельного конфига под aspect-ratio,
 * поэтому досчитываем это сами: слушаем resize и, если окно стало выше, чем
 * шире, мягко возвращаем его к горизонтальной форме.
 *
 * Это лучшее из доступного, а не гарантия на уровне ОС — если у используемой
 * версии @tauri-apps/api изменится сигнатура LogicalSize/onResized, здесь
 * может потребоваться правка под актуальный API.
 */
export async function enforceLandscapeWindow() {
  const { getCurrentWindow, LogicalSize } = window.__TAURI__.window;
  const appWindow = getCurrentWindow();

  appWindow.onResized(async ({ payload: size }) => {
    try {
      const scale = await appWindow.scaleFactor();
      const logical = size.toLogical(scale);
      if (logical.height > logical.width) {
        await appWindow.setSize(new LogicalSize(logical.height, logical.width));
      }
    } catch (err) {
      console.error("Не удалось скорректировать пропорции окна:", err);
    }
  });
}

/* ============================================================
   Отключение поведений, уместных для сайта, но не для приложения
   ============================================================ */

export function disableWebDefaults() {
  // Своё контекстное меню приложению не нужно — дефолтное браузерное
  // выглядит как "это веб-страница", а не нативный клиент.
  document.addEventListener("contextmenu", (event) => {
    event.preventDefault();
  });

  // DevTools открываются только сочетанием клавиш (F12, Ctrl+Shift+I,
  // Ctrl+Shift+C) — отдельная кнопка в панели администратора убрана
  // (она дублировала то же самое, но занимала место). Срабатывает
  // сочетание только при devtoolsAllowed === true (см. setDevtoolsAllowed,
  // вызывается из main.js только для user_type === "admin"). Для всех
  // остальных сочетания по-прежнему просто гасятся: обычному
  // ученику/редактору незачем видеть, что это вообще веб-страница
  // внутри Tauri.
  document.addEventListener("keydown", (e) => {
    const isDevtoolsShortcut =
      e.key === "F12" ||
      (e.ctrlKey && e.shiftKey && e.key === "I") ||
      (e.ctrlKey && e.shiftKey && e.key === "C");
    if (!isDevtoolsShortcut) return;

    e.preventDefault();
    if (devtoolsAllowed) openDevtools();
  });
}
