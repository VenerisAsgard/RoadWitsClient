<script>
  import { eqTooltip } from "$lib/stores/ui.svelte.js";

  let el = $state(null);

  // Легаси: показывает тултип прозрачным, меряет offsetWidth/offsetHeight,
  // клампит по правому краю окна, только потом добавляет .visible (класс
  // запускает CSS-transition). Здесь то же самое, но через $effect —
  // eqTooltip.top/left из showEqTooltip() лишь приблизительны (элемента ещё
  // нет в DOM в момент вызова), уточняем их сразу после реального рендера.
  $effect(() => {
    if (!eqTooltip.visible || !el) return;
    const margin = 6;
    const anchor = eqTooltip.anchorRect;
    if (anchor) {
      let top = anchor.top - el.offsetHeight - margin;
      if (top < margin) top = anchor.bottom + margin;
      let left = anchor.left;
      const maxLeft = window.innerWidth - el.offsetWidth - margin;
      if (left > maxLeft) left = Math.max(margin, maxLeft);
      eqTooltip.top = top;
      eqTooltip.left = left;
    }
  });
</script>

{#if eqTooltip.visible}
  <div class="eq-tooltip-float visible" bind:this={el} style="top:{eqTooltip.top}px; left:{eqTooltip.left}px;">
    {eqTooltip.text}
  </div>
{/if}
