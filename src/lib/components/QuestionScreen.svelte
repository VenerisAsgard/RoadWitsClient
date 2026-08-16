<script>
  import { onMount } from "svelte";
  import { state as appState, canEditContent } from "$lib/state.svelte.js";
  import QuestionFormModal from "./QuestionFormModal.svelte";
  import {
    answerMove,
    pressDigit,
    confirmPendingOrAdvance,
    skipQuestion,
    questionNext,
    questionPrev,
    phaseMove,
    jumpToQuestion,
    selectOptionByClick,
    goToNextUnanswered,
    requestExit,
    requestFinish,
    computeScore,
  } from "$lib/quiz.js";
  import { openImageViewer } from "$lib/stores/ui.svelte.js";

  const q = $derived(appState.questions[appState.currentQ]);
  const isChapter = $derived(appState.mode === "chapter");
  const isExam = $derived(appState.mode === "exam");
  const showPhaseNav = $derived(appState.mode === "random" && appState.questions.length > 10);
  const totalPhases = $derived(Math.ceil(appState.questions.length / 10));
  const currentPhase = $derived(Math.floor(appState.currentQ / 10));

  const topbarLabel = $derived.by(() => {
    if (isChapter) {
      if (appState.multiChapterIds) {
        const nums = appState.chapters
          .filter((c) => appState.multiChapterIds.includes(c.id))
          .map((c) => c.num ?? "?");
        return `Главы: ${nums.join(", ")}`;
      }
      const c = appState.chapters.find((x) => x.id === appState.chapterId);
      return c?.title ?? "";
    }
    if (appState.mode === "random") return `Случайный билет · ${appState.questions.length} вопр.`;
    if (isExam) return "Контрольный экзамен";
    return "";
  });

  const confirmed = $derived(q ? appState.answers[q.id] : undefined);
  const pending = $derived(q ? appState.selected[q.id] : undefined);
  const revealed = $derived(!isExam && confirmed !== undefined);
  const highlighted = $derived(confirmed !== undefined ? confirmed : pending);

  // УЛУЧШЕНИЕ: живой счётчик баллов (+1/-1) виден по ходу теста для
  // тренировочных режимов — в exam-режиме не показывается специально,
  // чтобы не выдавать текущее число ошибок раньше времени (там и так есть
  // предел в одну ошибку, суть в неизвестности до конца попытки).
  const liveScore = $derived(isExam ? null : computeScore().score);

  // Редактирование текущего вопроса "на лету" (карандаш в углу, только
  // editor/admin) — открывает ту же форму, что и в ChaptersScreen, не
  // прерывая прохождение билета (см. admin.js updateQuestionById — правка
  // применяется сразу к appState.questions, без выхода из теста).
  let editingQuestion = $state(false);

  const timerLabel = $derived.by(() => {
    const m = Math.floor(appState.timerSeconds / 60).toString().padStart(2, "0");
    const s = (appState.timerSeconds % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  });

  function dotsRange() {
    const start = Math.floor(appState.currentQ / 10) * 10;
    const end = Math.min(start + 10, appState.questions.length);
    return appState.questions.slice(start, end).map((qq, localIdx) => ({ q: qq, index: start + localIdx }));
  }
  const dots = $derived(dotsRange());

  function dotState(qq) {
    const answerIdx = appState.answers[qq.id];
    if (answerIdx === undefined) return "empty";
    if (isExam) return "answered";
    return answerIdx === qq.correctIndex ? "correct" : "wrong";
  }

  function optionClass(i) {
    let cls = "q-option";
    if (highlighted === i) cls += " selected";
    if (revealed) {
      if (i === q.correctIndex) cls += " correct";
      else if (i === confirmed) cls += " wrong";
    }
    return cls;
  }

  function onKeydown(e) {
    // Модалка редактирования вопроса перехватывает Esc сама (см. Modal.svelte);
    // остальные клавиши (стрелки/цифры) тоже не должны листать вопросы билета,
    // пока открыта форма правки.
    if (editingQuestion) return;

    if (e.key === "ArrowUp") {
      e.preventDefault();
      answerMove(-1);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      answerMove(1);
    } else if (/^[1-9]$/.test(e.key)) {
      e.preventDefault();
      pressDigit(Number(e.key));
    } else if (e.key === "Enter") {
      e.preventDefault();
      confirmPendingOrAdvance();
    } else if (e.key === " ") {
      e.preventDefault();
      skipQuestion();
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      questionNext();
    } else if (e.key === "ArrowLeft" || e.key === "Backspace") {
      e.preventDefault();
      questionPrev();
    } else if (e.key === "Escape") {
      e.preventDefault();
      requestExit();
    }
  }

  onMount(() => {
    document.addEventListener("keydown", onKeydown);
    return () => document.removeEventListener("keydown", onKeydown);
  });
</script>

<section class="screen" id="screen-question" data-screen="question">
  <div class="q-topbar">
    <span class="q-chapter" id="q-chapter-label">{topbarLabel}</span>
    {#if showPhaseNav}
      <div class="q-phase-nav" id="q-phase-nav">
        <button class="q-phase-arrow" type="button" title="Предыдущая фаза" disabled={currentPhase === 0} onclick={() => phaseMove(-1)}>‹</button>
        <span class="q-phase" id="q-phase">Фаза {currentPhase + 1} из {totalPhases}</span>
        <button class="q-phase-arrow" type="button" title="Следующая фаза" disabled={currentPhase === totalPhases - 1} onclick={() => phaseMove(1)}>›</button>
      </div>
    {/if}
    {#if liveScore !== null}
      <span class="q-chapter" title="Баллы за тест: +1 верный, −1 неверный">
        Баллы: {liveScore >= 0 ? "+" : ""}{liveScore}
      </span>
    {/if}
    {#if isExam}
      <span class="q-timer" id="q-timer">{timerLabel}</span>
    {/if}
    {#if canEditContent() && q}
      <button
        class="icon-btn q-edit-btn"
        type="button"
        title="Редактировать этот вопрос"
        onclick={() => (editingQuestion = true)}
      >✏️</button>
    {/if}
  </div>

  <div class="q-nav-row">
    <button class="q-btn-finish" id="q-btn-finish" type="button" disabled={appState.questionsLoading} onclick={requestFinish}>Завершить</button>

    {#if isChapter}
      <div class="q-arrow-nav" id="q-arrow-nav">
        <button class="q-arrow-btn" type="button" title="Предыдущий вопрос" disabled={appState.currentQ === 0} onclick={questionPrev}>‹</button>
        <span class="q-arrow-counter" id="q-arrow-counter" style="width: {String(appState.questions.length).length * 2 + 3}ch">
          {appState.currentQ + 1} / {appState.questions.length}
        </span>
        <button class="q-arrow-btn" type="button" title="Следующий вопрос" onclick={questionNext}>›</button>
      </div>
    {:else}
      <div class="q-dots" id="q-dots">
        {#each dots as d (d.q.id)}
          <button
            type="button"
            class="q-dot"
            class:current={d.index === appState.currentQ}
            data-state={dotState(d.q)}
            title={`Вопрос ${d.index + 1}`}
            onclick={() => jumpToQuestion(d.index)}
          >
            {d.index + 1}
          </button>
        {/each}
      </div>
    {/if}
  </div>

  <div class="q-body">
    {#if appState.questionsLoading}
      <div class="q-loading" id="q-loading">
        <div class="q-loading-spinner"></div>
        <p class="q-loading-text">Загружаем билет…</p>
      </div>
    {:else if q}
      {#if q.image}
        <div
          class="q-image-wrap"
          id="q-image-wrap"
          role="button"
          tabindex="-1"
          onclick={() => openImageViewer(q.image)}
          onkeydown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), openImageViewer(q.image))}
          onmousedown={(e) => e.preventDefault()}
        >
          <img id="q-image" src={q.image} alt="Иллюстрация к вопросу" title="Нажми, чтобы увеличить" />
        </div>
      {/if}
      <div class="q-content" id="q-content">
        <p class="q-text" id="q-text">{q.text}</p>
        <ul class="q-options" id="q-options">
          {#each q.options as opt, i}
            <li>
              <div
                class={optionClass(i)}
                role="button"
                tabindex="-1"
                onclick={() => selectOptionByClick(i)}
                onkeydown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), selectOptionByClick(i))}
              >
                <span class="o-key">{i + 1}</span><span>{opt}</span>
              </div>
            </li>
          {/each}
        </ul>
        <p class="q-answer-line">ВАШ ОТВЕТ: <span id="q-answer-value">{confirmed === undefined ? "_" : confirmed + 1}</span></p>
        {#if revealed && q.explanation}
          <p class="q-explain" id="q-explain">{q.explanation}</p>
        {/if}
        <div class="q-actions">
          {#if confirmed !== undefined}
            <button class="q-btn-continue" id="q-btn-continue" type="button" onclick={goToNextUnanswered}>Продолжить</button>
          {/if}
        </div>
      </div>
    {/if}
  </div>
</section>

{#if editingQuestion && q}
  {#key q.id}
    <QuestionFormModal question={q} onclose={() => (editingQuestion = false)} />
  {/key}
{/if}
