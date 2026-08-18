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
 * Вложенные модалки (например QuestionFormModal поверх
 * QuestionSearchModal — форма редактирования, открытая по ✏️ из
 * результатов поиска): обе модалки — это отдельные <Modal>, а значит
 * ДВА независимых .modal-overlay, которые в DOM лежат РЯДОМ (не
 * вложены друг в друга — Svelte-компоненты, а не HTML-вложенность), у
 * каждого свой use:lockBackgroundScroll. Без стека ниже — каждый вызов
 * этого экшна вешал СВОЙ собственный window-листенер: то есть при двух
 * открытых модалках слушателей уже два, и оба проверяют "лежит ли
 * target внутри МОЕГО узла". Для внешней (search) модалки узел формы
 * редактирования — не потомок (это сосед в дереве), поэтому её
 * листенер решал "target снаружи" и глушил скролл ВНУТРИ формы
 * редактирования — хотя визуально она поверх и должна получать колесо
 * первой. Починено общим стеком узлов на модуль: слушатель всего один
 * на оба wheel/touchmove, и он всегда сверяется только с последним
 * (самым верхним из открытых, т.е. смонтированным позже всех) узлом —
 * так учитывается вложенность модалок любой глубины.
 *
 * @param {HTMLElement} node
 */

/** @type {HTMLElement[]} */
const lockStack = [];
let listenersInstalled = false;

/** @param {Event} e */
function onWheel(e) {
  const top = lockStack[lockStack.length - 1];
  if (top && e.target instanceof Node && !top.contains(e.target)) e.preventDefault();
}
/** @param {Event} e */
function onTouchMove(e) {
  const top = lockStack[lockStack.length - 1];
  if (top && e.target instanceof Node && !top.contains(e.target)) e.preventDefault();
}

export function lockBackgroundScroll(node) {
  lockStack.push(node);
  if (!listenersInstalled) {
    window.addEventListener("wheel", onWheel, { passive: false, capture: true });
    window.addEventListener("touchmove", onTouchMove, { passive: false, capture: true });
    listenersInstalled = true;
  }

  return {
    destroy() {
      const i = lockStack.indexOf(node);
      if (i !== -1) lockStack.splice(i, 1);
      if (lockStack.length === 0 && listenersInstalled) {
        window.removeEventListener("wheel", onWheel, true);
        window.removeEventListener("touchmove", onTouchMove, true);
        listenersInstalled = false;
      }
    },
  };
}
