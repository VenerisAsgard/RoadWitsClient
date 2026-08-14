<script>
  import { state as appState } from "$lib/state.svelte.js";

  // Двухшаговое скрытие, как в оригинале (render.hideSplash): сперва
  // .splash-hidden (плавно гасит прозрачность/blur и снимает pointer-events
  // сразу, чтобы сплэш не перехватывал клики по кнопке логина/меню под
  // собой), затем через 250мс — .hidden (display:none, полностью вне
  // layout). Раньше здесь по ошибке применялся только общий .hidden без
  // .splash-hidden — сплэш не гас плавно и вдобавок до срабатывания
  // .hidden продолжал перехватывать клики.
  let fullyHidden = $state(false);
  $effect(() => {
    if (appState.booting) {
      fullyHidden = false;
      return;
    }
    const id = window.setTimeout(() => {
      fullyHidden = true;
    }, 250);
    return () => window.clearTimeout(id);
  });
</script>

<div class="splash" class:splash-hidden={!appState.booting} class:hidden={fullyHidden} id="splash-overlay">
  <div class="splash-body">
    <h1>Roadwits</h1>
    <div class="loader"></div>
  </div>
</div>
