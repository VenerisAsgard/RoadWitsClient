/**
 * Часть render.js (src-legacy/js/render.js), которая не привязана к
 * конкретному экрану: тосты, подсказка клавиш внизу, диалог подтверждения.
 * В оригинале это была прямая работа с DOM (innerHTML/classList) — здесь
 * то же самое, но как реактивное состояние, которое читают Toasts.svelte /
 * HintBar.svelte / ConfirmDialog.svelte.
 */

let toastId = 0;
/** @type {{id: number, text: string, kind: string}[]} */
export const toasts = $state([]);

/** Короткие сообщения (ошибки сети, валидация форм) вместо alert().
 * @param {string} text
 * @param {"info"|"success"|"error"} [kind]
 * @param {number} [timeoutMs] */
export function toast(text, kind = "info", timeoutMs = 3200) {
  const id = ++toastId;
  toasts.push({ id, text, kind });
  window.setTimeout(() => {
    const idx = toasts.findIndex((t) => t.id === id);
    if (idx !== -1) toasts.splice(idx, 1);
  }, timeoutMs);
}

/** @type {{keys: {keys: string[], label: string}[]}} */
export const hint = $state({ keys: [] }); // [{ keys: ["↑","↓"], label: "выбрать" }, ...]

/** @param {{keys: string[], label: string}[]} items */
export function setHint(items) {
  hint.keys = items;
}

/** Диалог подтверждения (заменяет window.confirm) — один экземпляр на
 * всё приложение, см. ConfirmDialog.svelte. resolve() дергает промис,
 * который вернула confirmDialog(). */
const confirmState = $state({
  open: false,
  title: "",
  text: "",
  confirmLabel: "Ок",
  cancelLabel: "Отмена",
  danger: false,
  /** Если задано — под текстом рисуется .product-key-box с этим значением
   * и кнопкой "копировать" (см. ConfirmDialog.svelte). Нужно для диалога
   * подтверждения выхода: там показываем Product Key, чтобы можно было
   * скопировать его перед уходом из аккаунта. */
  copyText: "",
  /** @type {((result: boolean) => void)|null} */
  _resolve: null,
});

export function confirmDialogState() {
  return confirmState;
}

/**
 * @param {{title: string, text: string, confirmLabel?: string, cancelLabel?: string, danger?: boolean, copyText?: string}} options
 * @returns {Promise<boolean>}
 */
export function confirmDialog({
  title,
  text,
  confirmLabel = "Ок",
  cancelLabel = "Отмена",
  danger = false,
  copyText = "",
}) {
  return new Promise((resolve) => {
    confirmState.title = title;
    confirmState.text = text;
    confirmState.confirmLabel = confirmLabel;
    confirmState.cancelLabel = cancelLabel;
    confirmState.danger = danger;
    confirmState.copyText = copyText;
    confirmState._resolve = resolve;
    confirmState.open = true;
  });
}

/** @param {boolean} result */
export function resolveConfirm(result) {
  confirmState.open = false;
  confirmState._resolve?.(result);
  confirmState._resolve = null;
}

/* ---------- generic-модалка с произвольным контентом (лидерборд) ---------- */
export const contentModal = $state({ open: false, title: "", wide: false });
/** @param {string} title @param {{wide?: boolean}} [options] */
export function openContentModal(title, { wide = false } = {}) {
  contentModal.title = title;
  contentModal.wide = wide;
  contentModal.open = true;
}
export function closeContentModal() {
  contentModal.open = false;
}
export const imageViewer = $state({ src: /** @type {string|null} */ (null) });
/** @param {string} src */
export function openImageViewer(src) {
  imageViewer.src = src;
}
export function closeImageViewer() {
  imageViewer.src = null;
}

/* ---------- профиль и настройки — раньше отдельные полноэкранные экраны
   (state.screen = "profile"/"settings"), теперь модалки поверх текущего
   экрана (по просьбе): тот же простой паттерн open/close, что и у
   aboutModal ниже, только без содержимого в самом сторе — разметка и
   данные остаются в ProfileScreen.svelte/SettingsScreen.svelte, эти два
   компонента просто всегда смонтированы (см. +page.svelte) и сами решают,
   рендерить ли себя, читая .open. ---------- */
export const profileModal = $state({ open: false });
export function openProfileModal() {
  profileModal.open = true;
}
export function closeProfileModal() {
  profileModal.open = false;
}

export const settingsModal = $state({ open: false });
export function openSettingsModal() {
  settingsModal.open = true;
}
export function closeSettingsModal() {
  settingsModal.open = false;
}

/* ---------- "О программе" — та же модалка-паттерн, что у лидерборда
   (contentModal), но отдельный стейт: у лидерборда контент грузится
   асинхронно с сервера, у "О программе" — статический, и оба должны
   уметь быть открыты независимо (например, "О программе" по клику на
   версию, не закрывая лидерборд, если вдруг оба как-то открыты разом). ---------- */
export const aboutModal = $state({ open: false });
export function openAboutModal() {
  aboutModal.open = true;
}
export function closeAboutModal() {
  aboutModal.open = false;
}

/* ---------- подсказка "автор · дата" при наведении на строку вопроса в
   редакторе главы (см. render.showEditorTooltip/hideEditorTooltip) — один
   общий плавающий элемент на всё приложение вместо нативного title,
   чтобы не обрезаться скроллом списка и выглядеть в теме приложения. ---------- */
export const eqTooltip = $state({ visible: false, text: "", top: 0, left: 0 });

/** @param {string} text @param {DOMRect} anchorRect */
export function showEqTooltip(text, anchorRect) {
  // Начальная (приблизительная) позиция — до того, как элемент реально
  // отрендерится и его можно будет измерить. EditorTooltip.svelte уточняет
  // top/left после маунта через getBoundingClientRect (см. компонент),
  // как и в оригинале (offsetWidth/offsetHeight после первого показа).
  const margin = 6;
  const approxHeight = 28;
  let top = anchorRect.top - approxHeight - margin;
  if (top < margin) top = anchorRect.bottom + margin;
  eqTooltip.text = text;
  eqTooltip.top = top;
  eqTooltip.left = anchorRect.left;
  eqTooltip.anchorRect = anchorRect;
  eqTooltip.visible = true;
}

export function hideEqTooltip() {
  eqTooltip.visible = false;
}
