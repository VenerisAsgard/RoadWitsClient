<script>
  import { onMount } from "svelte";
  import { state, MENU_ITEMS } from "$lib/state.svelte.js";
  import { setHint } from "$lib/stores/ui.svelte.js";
  import { menuMove, menuDigit, menuConfirm, HINT_MENU } from "$lib/quiz.js";

  const totalQ = $derived(state.chapters.reduce((s, c) => s + (c.count || 0), 0));
  const totalQLabel = $derived(totalQ ? `${totalQ} вопросов` : "— вопросов");
  const totalChLabel = $derived(`${state.chapters.length} глав`);

  function onKeydown(e) {
    if (/^[1-9]$/.test(e.key)) {
      e.preventDefault();
      menuDigit(Number(e.key));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      menuMove(-1);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      menuMove(1);
    } else if (e.key === "Enter") {
      e.preventDefault();
      menuConfirm();
    }
  }

  onMount(() => {
    setHint(HINT_MENU);
    document.addEventListener("keydown", onKeydown);
    return () => document.removeEventListener("keydown", onKeydown);
  });
</script>

<section class="screen" id="screen-menu" data-screen="menu">
  <div class="belarus-mark"><span>🇧🇾</span><span>Учебная программа · Республика Беларусь</span></div>
  <h1 class="brand-title">ПДД РБ</h1>
  <p class="brand-sub">Выбери режим</p>

  <ul class="menu-list" id="menu-list">
    {#each MENU_ITEMS as item, i (item.id)}
      <li>
        <!-- Навигация в приложении полностью своя (стрелки/цифры/Enter, см.
             onKeydown ниже и document.addEventListener в onMount) — обычный
             Tab по этим пунктам не нужен и только путал (показывал
             браузерный focus-ring, никак не связанный с "active"-подсветкой,
             и позволял Tab'ом "провалиться" мимо активного пункта). Такой же
             tabindex="-1" проставлен на аналогичных кастомных списках в
             ChaptersScreen/QuestionScreen/RandomCountScreen/ResultScreen. -->
        <div
          class="menu-item"
          class:active={i === state.menuIndex}
          role="button"
          tabindex="-1"
          onclick={() => {
            state.menuIndex = i;
            menuConfirm();
          }}
          onkeydown={(e) => (e.key === "Enter") && (e.preventDefault(), (state.menuIndex = i), menuConfirm())}
        >
          <span class="m-index">{String(i + 1).padStart(2, "0")}</span>
          <span class="m-body">
            <span class="m-title">{item.title}</span>
            <span class="m-sub">{item.sub}</span>
          </span>
        </div>
      </li>
    {/each}
  </ul>

  <div class="meta-row">
    <span id="menu-total-q">{totalQLabel}</span>
    <span id="menu-total-ch">{totalChLabel}</span>
  </div>
</section>
