<script>
  import { onMount } from "svelte";
  import { state, RANDOM_COUNT_OPTIONS } from "$lib/state.svelte.js";
  import { randomCountMove, randomCountConfirm, returnToMenu } from "$lib/quiz.js";

  function onKeydown(e) {
    if (e.key === "ArrowUp") {
      e.preventDefault();
      randomCountMove(-1);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      randomCountMove(1);
    } else if (e.key === "Enter") {
      e.preventDefault();
      randomCountConfirm();
    } else if (e.key === "Escape") {
      e.preventDefault();
      returnToMenu();
    }
  }

  onMount(() => {
    document.addEventListener("keydown", onKeydown);
    return () => document.removeEventListener("keydown", onKeydown);
  });
</script>

<section class="screen" id="screen-random-count" data-screen="random-count">
  <button class="ghost small screen-back" type="button" onclick={returnToMenu}>← Меню</button>
  <p class="eyebrow">Тренировка по случайному билету</p>
  <h1 class="brand-title" style="font-size: clamp(28px, 4vw, 40px)">Сколько вопросов?</h1>
  <p class="brand-sub">Выбери количество стрелками и Enter, или мышью/тапом</p>

  <ul class="menu-list" id="random-count-list">
    {#each RANDOM_COUNT_OPTIONS as count, i (count)}
      <li>
        <div class="menu-item" class:active={i === state.randomCountIndex} role="button" tabindex="-1"
          onclick={() => {
            state.randomCountIndex = i;
            randomCountConfirm();
          }}
          onkeydown={(e) => (e.key === "Enter") && (e.preventDefault(), (state.randomCountIndex = i), randomCountConfirm())}
        >
          <span class="m-index">{String(i + 1).padStart(2, "0")}</span>
          <span class="m-body">
            <span class="m-title">{count} вопросов</span>
            <span class="m-sub">Случайная подборка из базы вопросов</span>
          </span>
        </div>
      </li>
    {/each}
  </ul>
</section>
