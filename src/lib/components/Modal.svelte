<!--
  Единый переиспользуемый контейнер модалки — Svelte-эквивалент
  render.openModal()/closeModal() из src-legacy/js/render.js. Раньше один
  #modal-overlay в разметке подменял innerHTML под конкретную форму
  (глава/вопрос/лицензия) — здесь вместо этого каждая форма отдельный
  компонент (ChapterFormModal/QuestionFormModal/LicenseFormModal/...),
  который просто оборачивается в этот шелл через snippet-children.
-->
<script>
  import { onMount } from "svelte";
  import { lockBackgroundScroll } from "$lib/actions/lockBackgroundScroll.js";

  let { title, wide = false, danger = false, onclose, children } = $props();

  let boxEl = $state(null);

  onMount(() => {
    // Легаси openModal() всегда фокусит первое поле формы — сохраняем то же
    // поведение для любой модалки-обёртки (глава/вопрос/поиск/лицензия и т.д.).
    boxEl?.querySelector("input, textarea, select")?.focus();

    function onKeydown(e) {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopImmediatePropagation();
      onclose?.();
    }
    document.addEventListener("keydown", onKeydown, true);
    return () => document.removeEventListener("keydown", onKeydown, true);
  });
</script>

<div class="modal-overlay" id="modal-overlay" use:lockBackgroundScroll>
  <div class="modal-box" class:wide class:danger role="dialog" aria-modal="true" bind:this={boxEl}>
    <div class="modal-header">
      <h2 id="modal-title">{title}</h2>
      <button class="ghost small" type="button" onclick={() => onclose?.()}>×</button>
    </div>
    <div class="modal-body" id="modal-body">
      {@render children?.()}
    </div>
  </div>
</div>
