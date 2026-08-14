/**
 * Проверка обновлений «стандартным» способом — без тихой самозамены
 * бинарника. Перенесено из src-legacy/js/update.js. Логика:
 *
 *   1. Сверяем текущую версию с последним релизом на GitHub (публичный
 *      API, без токена — достаточно для редких проверок).
 *   2. Если есть новее — находим в ассетах релиза инсталлятор под текущую
 *      ОС (.exe для Windows, .dmg для macOS) и через Rust-команду
 *      download_and_run_installer скачиваем его во временную папку и
 *      запускаем — дальше пользователь проходит обычный OS-инсталлятор.
 *   3. Под Flatpak ничего не скачиваем: /app там доступен только на
 *      чтение, приложение физически не может себя заменить изнутри
 *      песочницы. Обновление Flatpak-версии — это `flatpak update`,
 *      отдельный процесс вне приложения (см. is_flatpak в lib.rs).
 *
 * Только вручную, кнопкой "Проверить обновления" в профиле — без
 * автопроверки при старте (см. комментарий в src-legacy/js/main.js: тихое
 * скачивание/накат в фоне без индикатора не даёт человеку решить, когда
 * обновляться).
 */
import { invoke } from "@tauri-apps/api/core";
import { getVersion } from "@tauri-apps/api/app";
import { isTauriEnv } from "./device.js";
import { toast, confirmDialog } from "./stores/ui.svelte.js";

const REPO = "VenerisAsgard/RoadWitsClient";
let checking = false;

function parseVersion(v) {
  return (v || "")
    .replace(/^v/, "")
    .split(".")
    .map((n) => parseInt(n, 10) || 0);
}

function isNewer(remote, local) {
  const a = parseVersion(remote);
  const b = parseVersion(local);
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const x = a[i] || 0;
    const y = b[i] || 0;
    if (x > y) return true;
    if (x < y) return false;
  }
  return false;
}

function pickAsset(assets) {
  const ua = navigator.userAgent || "";
  const isWindows = ua.includes("Windows");
  const isMac = ua.includes("Mac");
  if (isWindows) return assets.find((a) => a.name.toLowerCase().endsWith(".exe")) || null;
  if (isMac) return assets.find((a) => a.name.toLowerCase().endsWith(".dmg")) || null;
  return null;
}

async function openReleasePage(url) {
  try {
    const { openUrl } = await import("@tauri-apps/plugin-opener");
    await openUrl(url);
  } catch {
    // не критично — просто не откроется браузер
  }
}

/**
 * @param {boolean} silent — если true, ничего не показываем, если
 * обновлений нет или проверка не удалась (нет сети — обычное дело, не
 * пугать тостом на каждый запуск). Ручной вызов из UI ("Проверить
 * обновления") должен передавать false.
 */
export async function checkForUpdates(silent = true) {
  if (checking) return;
  checking = true;
  try {
    if (!isTauriEnv) {
      if (!silent) toast("Проверка обновлений недоступна в этой сборке", "error");
      return;
    }

    // Под Flatpak приложение не может само себя обновить — не пытаемся.
    let flatpak = false;
    try {
      flatpak = await invoke("is_flatpak");
    } catch {
      // если команда недоступна (старая сборка) — считаем, что не Flatpak
    }
    if (flatpak) {
      if (!silent) {
        toast(
          'Это Flatpak-версия — обновляйте её командой "flatpak update" (или через GNOME Software / KDE Discover), в самом приложении это не делается',
          "info",
          9000,
        );
      }
      return;
    }

    let releaseData;
    try {
      const res = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`);
      if (!res.ok) throw new Error(String(res.status));
      releaseData = await res.json();
    } catch {
      if (!silent) toast("Не удалось проверить обновления — нет связи с сервером", "error");
      return;
    }

    const remoteVersion = releaseData.tag_name || "";
    const localVersion = await getVersion();

    if (!isNewer(remoteVersion, localVersion)) {
      if (!silent) toast("Установлена последняя версия", "success");
      return;
    }

    const asset = pickAsset(releaseData.assets || []);
    if (!asset) {
      // Нет инсталлятора под эту ОС в ассетах — просто откроем страницу релиза.
      if (!silent) toast(`Доступна версия ${remoteVersion} — открываю страницу релиза`, "info", 8000);
      await openReleasePage(releaseData.html_url);
      return;
    }

    const proceed = await confirmDialog({
      title: "Доступно обновление",
      text: `Найдена версия ${remoteVersion}. Скачать и запустить установщик? Приложение закроется, чтобы установщик мог обновить файлы.`,
      confirmLabel: "Скачать и обновить",
      cancelLabel: "Позже",
    });
    if (!proceed) return;

    toast(`Загружаю ${remoteVersion}…`, "info", 8000);

    try {
      await invoke("download_and_run_installer", {
        url: asset.browser_download_url,
        filename: asset.name,
      });
    } catch {
      toast("Не удалось скачать или запустить установщик — открываю страницу релиза", "error");
      await openReleasePage(releaseData.html_url);
      return;
    }

    try {
      const { exit } = await import("@tauri-apps/plugin-process");
      await exit(0);
    } catch {
      // плагин process не подключен в этой сборке — установщик всё равно
      // запущен, пользователь может закрыть приложение сам
    }
  } finally {
    checking = false;
  }
}
