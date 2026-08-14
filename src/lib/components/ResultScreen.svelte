<script>
  import { onMount } from "svelte";
  import { state as appState } from "$lib/state.svelte.js";
  import { reviewMove, reviewJumpTo, retryQuiz, returnToMenu } from "$lib/quiz.js";
  import { openImageViewer } from "$lib/stores/ui.svelte.js";

  const GAUGE_CIRCUMFERENCE = 540;
  const r = $derived(appState.lastResult ?? { correct: 0, total: 0, pct: 0, passed: null, isExam: false, score: 0, incorrect: 0 });

  const gaugeColor = $derived(r.isExam ? (r.passed ? "var(--green)" : "var(--red)") : "var(--amber)");
  const gaugeOffset = $derived(GAUGE_CIRCUMFERENCE - (GAUGE_CIRCUMFERENCE * r.pct) / 100);
  const verdict = $derived(r.isExam ? (r.passed ? "Сдал" : "Не сдал") : "Готово");

  // Анимация заполнения датчика (как в оригинале): сначала полностью пустой
  // круг, затем в следующем кадре — реальное значение, чтобы сработал CSS
  // transition на stroke-dashoffset (см. components.css .gauge-fill).
  let animatedOffset = $state(GAUGE_CIRCUMFERENCE);
  $effect(() => {
    const target = gaugeOffset;
    animatedOffset = GAUGE_CIRCUMFERENCE;
    const id = requestAnimationFrame(() => {
      animatedOffset = target;
    });
    return () => cancelAnimationFrame(id);
  });

  const reviewQ = $derived(appState.questions[appState.reviewIndex]);
  const reviewUserIdx = $derived(reviewQ ? appState.answers[reviewQ.id] : undefined);

  // Легаси: scrollActiveReviewIntoView() — при навигации (стрелки/клик)
  // активная точка не всегда видна в узкой прокручиваемой сетке.
  $effect(() => {
    appState.reviewIndex;
    document.getElementById("review-grid")?.querySelector(".q-dot.current")?.scrollIntoView({ block: "nearest" });
  });

  function onKeydown(e) {
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      reviewMove(-1);
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      reviewMove(1);
    } else if (e.key === "Enter") {
      e.preventDefault();
      retryQuiz();
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

<section class="screen" id="screen-result" data-screen="result">
  <div class="result-top">
    <div class="gauge-wrap">
      <svg class="gauge" viewBox="0 0 200 200" role="img" aria-label="Результат">
        <circle class="gauge-track" cx="100" cy="100" r="86"></circle>
        <circle
          class="gauge-fill"
          id="gauge-fill"
          cx="100"
          cy="100"
          r="86"
          style="stroke: {gaugeColor}; stroke-dashoffset: {animatedOffset}"
        ></circle>
      </svg>
      <div class="gauge-center">
        <span class="gauge-score" id="gauge-score">{r.pct}%</span>
        <span class="gauge-verdict" id="gauge-verdict">{verdict}</span>
      </div>
    </div>
    <div class="result-info">
      <p class="result-summary" id="result-summary">
        Правильно: {r.correct} из {r.total} · Баллы: {r.score >= 0 ? "+" : ""}{r.score}
      </p>
      {#if r.isExam}
        <p class="result-errors" id="result-errors">Ошибок: {appState.examErrors} из 1 допустимой</p>
      {/if}
      <div class="result-actions">
        <button id="result-retry-btn" type="button" onclick={retryQuiz}>Пройти ещё раз</button>
        <button class="ghost" id="result-menu-btn" type="button" onclick={returnToMenu}>В меню</button>
      </div>
    </div>
  </div>

  <div class="q-dots" id="review-grid">
    {#each appState.questions as qq, i (qq.id)}
      {@const userIdx = appState.answers[qq.id]}
      {@const st = userIdx === undefined ? "empty" : userIdx === qq.correctIndex ? "correct" : "wrong"}
      <button
        type="button"
        class="q-dot"
        class:current={i === appState.reviewIndex}
        data-state={st}
        title={`Вопрос ${i + 1}`}
        onclick={() => reviewJumpTo(i)}
      >
        {i + 1}
      </button>
    {/each}
  </div>

  {#if reviewQ}
    <div class="q-body">
      {#if reviewQ.image}
        <div
          class="q-image-wrap"
          id="review-image-wrap"
          role="button"
          tabindex="-1"
          onclick={() => openImageViewer(reviewQ.image)}
          onkeydown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), openImageViewer(reviewQ.image))}
        >
          <img id="review-image" src={reviewQ.image} alt="Иллюстрация к вопросу" title="Нажми, чтобы увеличить" />
        </div>
      {/if}
      <div class="q-content">
        <p class="q-text" id="review-text">{appState.reviewIndex + 1}. {reviewQ.text}</p>
        <ul class="q-options" id="review-options">
          {#each reviewQ.options as opt, i}
            <li class="q-option" class:correct={i === reviewQ.correctIndex} class:wrong={i === reviewUserIdx && i !== reviewQ.correctIndex}>
              <span class="o-key">{i + 1}</span><span>{opt}</span>
            </li>
          {/each}
        </ul>
        <p class="q-answer-line" id="review-answer-line">
          {reviewUserIdx === undefined ? "ОТВЕТ НЕ ВЫБРАН" : `ВАШ ОТВЕТ: ${reviewUserIdx + 1}`}
        </p>
        {#if reviewQ.explanation}
          <p class="q-explain" id="review-explain">{reviewQ.explanation}</p>
        {/if}
      </div>
    </div>
  {/if}
</section>
