<script>
  import { hint } from "$lib/stores/ui.svelte.js";
  import { isTouchDevice } from "$lib/device.js";

  // ОТСТУПЛЕНИЕ ОТ ЛЕГАСИ (по просьбе): там подсказки на экране меню
  // никогда не показывались (родовая причина — "цифры 1-9 и так видны
  // на пунктах меню"), но здесь навигационная подсказка на меню
  // добавлена намеренно — панель просто следует общему правилу
  // "прячется, только когда подсказок совсем нет" (см. CSS
  // #app-shell:has(.hint-bar.hidden) .stage — раскладка экрана зависит
  // именно от класса "hidden" на самой панели).
  const empty = $derived(!hint.keys.length);
</script>

{#if !isTouchDevice}
  <footer class="hint-bar" class:hidden={empty} id="hint-bar">
    <span class="hint-keys" id="hint-keys">
      {#if !empty}
        {#each hint.keys as h}
          <span class="hint-group">
            {#each h.keys as k}<kbd>{k}</kbd>{/each}
            <span class="hint-label">{h.label}</span>
          </span>
        {/each}
      {/if}
    </span>
  </footer>
{/if}
