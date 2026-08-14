/**
 * Всё, что касается самого Tauri-окружения (не бэкенда, не рендера) —
 * вызовы invoke() к Rust-командам из src-tauri/src/lib.rs, управление окном,
 * отключение поведений, неуместных для десктоп-приложения.
 *
 * Перенесено из src-legacy/js/device.js. УЛУЧШЕНИЕ: раньше всё шло через
 * window.__TAURI__ (единственный вариант для чистого JS без сборщика) —
 * теперь используется официальный npm-пакет @tauri-apps/api. Он даёт то же
 * самое API, но с типами/автодополнением и без завязки на глобальную
 * переменную, которая существует только благодаря withGlobalTauri: true
 * в tauri.conf.json (эта настройка больше не обязательна, но оставлена
 * в конфиге на случай, если она где-то ещё пригодится).
 */
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow, LogicalSize } from "@tauri-apps/api/window";
import { getVersion } from "@tauri-apps/api/app";

/**
 * УЛУЧШЕНИЕ: раньше (window.__TAURI__) любое обращение к Tauri API вне
 * самого приложения (например, открыть index.html в обычном браузере при
 * разработке вёрстки через `npm run dev`) роняло всё с необработанным
 * исключением — window.__TAURI__ было просто undefined и падало на первом
 * же обращении. @tauri-apps/api кидает исключение чуть глубже (при попытке
 * прочитать внутренние метаданные окна), эффект тот же. Явная проверка
 * ниже позволяет initWindowControls()/enforceLandscapeWindow() тихо
 * ничего не делать вне Tauri, вместо падения всего приложения.
 */
export const isTauriEnv = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

/**
 * pointer:coarse — самый надёжный кросс-платформенный признак "это тач-устройство",
 * не завязанный на ширину окна.
 */
export const isTouchDevice =
  typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches;

let devtoolsAllowed = false;
export function setDevtoolsAllowed(value) {
  devtoolsAllowed = !!value;
}

/* ============================================================
   Хранение сессии (fingerprint устройства, JWT) — через кастомные
   Rust-команды (см. src-tauri/src/lib.rs), которые сами шифруют/
   расшифровывают значения поверх tauri-plugin-store.
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

/** Версия приложения — показывается в status-bar рядом со статусом сервера. */
export async function getAppVersion() {
  try {
    return await getVersion();
  } catch {
    return "";
  }
}

/* ============================================================
   Управление окном (кастомный титлбар, decorations:false)
   ============================================================ */

export async function openDevtools() {
  if (!isTauriEnv) return;
  const appWindow = getCurrentWindow();
  if (typeof appWindow.openDevtools === "function") await appWindow.openDevtools();
}

export function initWindowControls() {
  if (!isTauriEnv) return;
  const appWindow = getCurrentWindow();

  document.getElementById("minimize")?.addEventListener("click", () => {
    appWindow.minimize();
  });

  document.getElementById("maximize")?.addEventListener("click", async () => {
    if (await appWindow.isMaximized()) {
      await appWindow.unmaximize();
    } else {
      await appWindow.maximize();
    }
  });

  document.getElementById("close")?.addEventListener("click", () => {
    appWindow.close();
  });
}

/**
 * Приложение должно оставаться горизонтальным на десктопе — см. подробное
 * объяснение в src-legacy/js/device.js. Логика не изменилась.
 */
export async function enforceLandscapeWindow() {
  if (!isTauriEnv) return;
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
  document.addEventListener("contextmenu", (event) => {
    event.preventDefault();
  });

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
