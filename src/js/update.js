/**
 * Self-update через tauri-plugin-updater (см. src-tauri/Cargo.toml,
 * lib.rs и tauri.conf.json → plugins.updater).
 *
 * Публикация версии — это git-тег → CI собирает подписанные билды для
 * каждой ОС → кладёт их вместе с latest.json в GitHub Release (см.
 * .github/workflows/release.yml). Апдейтер сам стучится по адресу из
 * tauri.conf.json → plugins.updater.endpoints и сверяет версию/подпись —
 * отдельный сервер обновлений не нужен.
 *
 * ВАЖНО ПЕРЕД ПЕРВЫМ РЕЛИЗОМ:
 *   1. `cargo tauri signer generate` — сгенерировать пару ключей.
 *      Приватный уходит в секреты CI (TAURI_SIGNING_PRIVATE_KEY /
 *      TAURI_SIGNING_PRIVATE_KEY_PASSWORD), публичный — в
 *      tauri.conf.json → plugins.updater.pubkey (сейчас там заглушка).
 *   2. В tauri.conf.json → plugins.updater.endpoints подставить реальные
 *      org/repo вместо "ORG/REPO".
 *   3. Без обоих пунктов апдейтер просто не сможет проверить/поставить
 *      обновление — это не баг в этом файле, а незаконченная настройка.
 *
 * API window.__TAURI__.updater/process даны по документации Tauri v2 на
 * момент написания (withGlobalTauri: true уже включён в tauri.conf.json).
 * Точную форму ответа check() стоит свериться на реальной сборке — если
 * плагин обновится и поменяет форму ответа, здесь достаточно поправить
 * одну функцию.
 */
import * as render from "./render.js";

let checking = false;

/**
 * @param {boolean} silent — если true (по умолчанию, автопроверка при
 * старте), ничего не показываем, если обновлений нет или проверка не
 * удалась (нет сети — обычное дело, не пугать тостом на каждый запуск).
 * Ручной вызов из UI ("Проверить обновления") должен передавать false.
 */
export async function checkForUpdates(silent = true) {
  if (checking) return;
  const updater = window.__TAURI__?.updater;
  const process = window.__TAURI__?.process;
  if (!updater) {
    if (!silent) render.toast("Модуль обновлений недоступен в этой сборке", "error");
    return;
  }

  checking = true;
  try {
    let update;
    try {
      update = await updater.check();
    } catch (err) {
      if (!silent) render.toast("Не удалось проверить обновления — нет связи с сервером", "error");
      return;
    }

    // На разных версиях плагина форма ответа отличалась (null vs
    // {available:false}) — проверяем оба варианта, чтобы не привязываться
    // к одной конкретной версии tauri-plugin-updater.
    const available = update && update.available !== false;
    if (!available) {
      if (!silent) render.toast("Установлена последняя версия", "success");
      return;
    }

    const version = update.version || update.currentVersion || "";
    render.toast(version ? `Найдено обновление ${version} — загружаю…` : "Найдено обновление — загружаю…", "info", 8000);

    try {
      await update.downloadAndInstall();
    } catch (err) {
      render.toast("Не удалось загрузить обновление", "error");
      return;
    }

    const restartNow = await render.confirmDialog({
      title: "Обновление готово",
      text: version
        ? `Roadwits обновлён до версии ${version}. Перезапустить сейчас, чтобы применить?`
        : "Обновление установлено. Перезапустить сейчас, чтобы применить?",
      confirmLabel: "Перезапустить",
      cancelLabel: "Позже",
    });
    if (restartNow && process?.relaunch) {
      await process.relaunch();
    }
  } finally {
    checking = false;
  }
}
