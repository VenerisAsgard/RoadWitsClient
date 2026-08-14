<script>
  import { onMount } from "svelte";
  import { imageViewer, closeImageViewer } from "$lib/stores/ui.svelte.js";

  // Картинка во весь экран перекрывает всё — Esc/Enter/Space должны только
  // закрыть её и не долетать до обработчиков экрана под ней (тот же порядок,
  // что был в controls.js: проверка isImageViewerOpen() стояла первой).
  // Капча-фаза + stopImmediatePropagation гарантируют это независимо от
  // порядка монтирования компонентов.
  onMount(() => {
    function onKeydown(e) {
      if (!imageViewer.src) return;
      if (e.key === "Escape" || e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        e.stopImmediatePropagation();
        closeImageViewer();
      }
    }
    document.addEventListener("keydown", onKeydown, true);
    return () => document.removeEventListener("keydown", onKeydown, true);
  });
</script>

<div class="image-viewer" class:hidden={!imageViewer.src} id="image-viewer" aria-hidden={!imageViewer.src} onclick={closeImageViewer}>
  {#if imageViewer.src}
    <img id="image-viewer-img" src={imageViewer.src} alt="Иллюстрация к вопросу во весь экран" />
  {/if}
  <p class="image-viewer-hint">Клик или Esc — закрыть</p>
</div>
