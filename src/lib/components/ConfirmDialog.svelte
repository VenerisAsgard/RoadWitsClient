<script>
  import { onMount } from "svelte";
  import { confirmDialogState, resolveConfirm } from "$lib/stores/ui.svelte.js";
  const c = confirmDialogState();

  // Модалка перехватывает Esc/Enter раньше экрана под ней — тот же порядок
  // приоритетов, что в controls.js (isModalOpen() проверялась сразу после
  // isImageViewerOpen()). Капча-фаза + stopImmediatePropagation вместо
  // расчёта на порядок монтирования компонентов.
  onMount(() => {
    function onKeydown(e) {
      if (!c.open) return;
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopImmediatePropagation();
        resolveConfirm(false);
      } else if (e.key === "Enter") {
        e.preventDefault();
        e.stopImmediatePropagation();
        resolveConfirm(true);
      }
    }
    document.addEventListener("keydown", onKeydown, true);
    return () => document.removeEventListener("keydown", onKeydown, true);
  });
</script>

{#if c.open}
  <div class="modal-overlay" id="modal-overlay">
    <div class="modal-box" class:danger={c.danger} role="dialog" aria-modal="true">
      <div class="modal-header">
        <h2 id="modal-title">{c.title}</h2>
        <button class="ghost small" type="button" onclick={() => resolveConfirm(false)}>×</button>
      </div>
      <div class="modal-body">
        <p>{c.text}</p>
        <div class="modal-actions">
          <button type="button" class="ghost" onclick={() => resolveConfirm(false)}>{c.cancelLabel}</button>
          <button
            type="button"
            class={c.danger ? "danger" : ""}
            data-resolve="confirm"
            onclick={() => resolveConfirm(true)}
          >
            {c.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  </div>
{/if}
