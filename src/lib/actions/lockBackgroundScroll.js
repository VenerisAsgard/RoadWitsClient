/**
 * Svelte-экшн: пока элемент (оверлей модалки) смонтирован, блокирует
 * scroll колесом мыши/тачпадом всего, что находится ВНЕ этого элемента.
 *
 * Баг, который это чинит: модалка (например LeaderboardModal) лежит
 * поверх экрана на position:fixed + z-index, но в вебвью Tauri
 * (особенно WebKitGTK на Linux) скролл колесом иногда не привязан
 * строго к topmost-элементу под курсором — событие может долетать до
 * скроллящегося контейнера экрана под модалкой (например
 * .chapter-list), и тот продолжает скроллиться вместе с/вместо
 * содержимого самой модалки. body у приложения намеренно
 * overflow:hidden (см. reset.css), но это не спасает от скролла
 * ВНУТРЕННИХ контейнеров экрана, у которых свой overflow-y:auto.
 *
 * Решение — слушать wheel/touchmove на window в capture-фазе (раньше
 * любого другого обработчика) и гасить событие, если его target не
 * лежит внутри самого оверлея. Скролл внутри модалки (.modal-body)
 * при этом работает как обычно, потому что он — часть node.
 *
 * @param {HTMLElement} node
 */
export function lockBackgroundScroll(node) {
  /** @param {Event} e */
  function isOutside(e) {
    return e.target instanceof Node && !node.contains(e.target);
  }
  /** @param {WheelEvent} e */
  function onWheel(e) {
    if (isOutside(e)) e.preventDefault();
  }
  /** @param {TouchEvent} e */
  function onTouchMove(e) {
    if (isOutside(e)) e.preventDefault();
  }
  window.addEventListener("wheel", onWheel, { passive: false, capture: true });
  window.addEventListener("touchmove", onTouchMove, { passive: false, capture: true });

  return {
    destroy() {
      window.removeEventListener("wheel", onWheel, true);
      window.removeEventListener("touchmove", onTouchMove, true);
    },
  };
}
