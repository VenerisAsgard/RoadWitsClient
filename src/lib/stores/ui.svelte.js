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
  /** @type {((result: boolean) => void)|null} */
  _resolve: null,
});

export function confirmDialogState() {
  return confirmState;
}

/**
 * @param {{title: string, text: string, confirmLabel?: string, cancelLabel?: string, danger?: boolean}} options
 * @returns {Promise<boolean>}
 */
export function confirmDialog({ title, text, confirmLabel = "Ок", cancelLabel = "Отмена", danger = false }) {
  return new Promise((resolve) => {
    confirmState.title = title;
    confirmState.text = text;
    confirmState.confirmLabel = confirmLabel;
    confirmState.cancelLabel = cancelLabel;
    confirmState.danger = danger;
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
