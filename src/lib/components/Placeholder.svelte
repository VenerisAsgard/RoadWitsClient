<script>
  import { state } from "$lib/state.svelte.js";
  export let title = "Экран в разработке";
  export let text = "Этот экран ещё переносится на новый фронтенд.";
  export let back = "menu";
</script>

<section class="screen" data-screen="placeholder">
  <button class="ghost small screen-back" type="button" onclick={() => (state.screen = back)}>← Меню</button>
  <h1 class="brand-title" style="font-size: clamp(24px, 4vw, 34px)">{title}</h1>
  <p class="brand-sub">{text}</p>
</section>
