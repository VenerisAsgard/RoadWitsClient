<script>
  import { fade } from "svelte/transition";
  import { toasts } from "$lib/stores/ui.svelte.js";

  // Классы, не data-атрибут: CSS (.toast-error/.toast-success/.toast-info)
  // заточен под класс, как в легаси render.toast() — data-kind тут ни с чем
  // не совпадал бы, и цветовая индикация тостов пропадала бы совсем.
  function kindClass(kind) {
    return kind === "error" ? " toast-error" : kind === "success" ? " toast-success" : kind === "info" ? " toast-info" : "";
  }
</script>

<div class="toast-stack" id="toast-stack" aria-live="polite">
  {#each toasts as t (t.id)}
    <div class="toast{kindClass(t.kind)}" out:fade={{ duration: 250 }}>{t.text}</div>
  {/each}
</div>
