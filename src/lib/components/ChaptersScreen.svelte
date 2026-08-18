<script>
  import { onMount } from "svelte";
  import { state as appState, canEditContent, isAdmin } from "$lib/state.svelte.js";
  import { chaptersMove, toggleChapterCheck, toggleAllChapters, chaptersConfirm, returnToMenu } from "$lib/quiz.js";
  import { refreshEditorQuestions, confirmDeleteChapter } from "$lib/admin.js";
  import { showEqTooltip, hideEqTooltip } from "$lib/stores/ui.svelte.js";
  import ChapterFormModal from "./ChapterFormModal.svelte";
  import QuestionFormModal from "./QuestionFormModal.svelte";
  import QuestionSearchModal from "./QuestionSearchModal.svelte";

  const current = $derived(appState.chapters[appState.chapterIndex]);
  const checkedCount = $derived(appState.checkedChapters.size);
  // По просьбе: старт только если отмечена хотя бы одна глава (галочкой) —
  // раньше можно было начать тренировку и без единой отметки, по одной лишь
  // текущей выделенной строке в списке (просто клик по строке, не по
  // чекбоксу).
  const startLabel = $derived(
    checkedCount
      ? `Начать по ${checkedCount} ${checkedCount === 1 ? "главе" : "главам"}`
      : "Отметьте хотя бы одну главу",
  );
  const startDisabled = $derived(!checkedCount);
  const selectableChapters = $derived(appState.chapters.filter((c) => (c.count || 0) > 0));
  const allChaptersChecked = $derived(selectableChapters.length > 0 && selectableChapters.every((c) => appState.checkedChapters.has(c.id)));
  const someChaptersChecked = $derived(!allChaptersChecked && selectableChapters.some((c) => appState.checkedChapters.has(c.id)));

  let editingChapter = $state(null); // null=закрыто, false=создание, объект=правка
  let editingQuestion = $state(null); // null=закрыто, false=создание, объект=правка
  let showSearch = $state(false);
  let editorQuestionsLoading = $state(false);

  async function selectRow(i) {
    appState.chapterIndex = i;
    if (canEditContent()) {
      editorQuestionsLoading = true;
      await refreshEditorQuestions();
      editorQuestionsLoading = false;
    }
  }

  function toggleEditMode() {
    appState.editMode = !appState.editMode;
  }

  function questionMeta(q) {
    const who = q.createdByEmail || "автор неизвестен";
    if (!q.createdAt) return who;
    const d = new Date(q.createdAt);
    if (Number.isNaN(d.getTime())) return who;
    const when = d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" });
    return `${who} · ${when}`;
  }

  function onQuestionRowEnter(e, q) {
    const row = e.currentTarget;
    showEqTooltip(questionMeta(q), row.getBoundingClientRect());
  }

  function onKeydown(e) {
    // Модалки (правка главы/вопроса, поиск) перехватывают Esc сами
    // (см. Modal.svelte) — здесь их дополнительно не закрываем.
    if (editingChapter !== null || editingQuestion !== null || showSearch) return;

    if (e.key === "ArrowUp") {
      e.preventDefault();
      chaptersMove(-1);
      if (canEditContent()) refreshEditorQuestions();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      chaptersMove(1);
      if (canEditContent()) refreshEditorQuestions();
    } else if (e.key === " ") {
      e.preventDefault();
      toggleChapterCheck(appState.chapters[appState.chapterIndex]);
    } else if (e.key === "Enter") {
      e.preventDefault();
      chaptersConfirm();
    } else if (e.key === "Escape") {
      e.preventDefault();
      // Если включён режим редактирования — первый Esc просто выключает
      // его, а не сразу выкидывает в меню (не терять место в списке).
      if (appState.editMode) {
        toggleEditMode();
      } else {
        returnToMenu();
      }
    }
  }

  onMount(() => {
    if (canEditContent()) {
      editorQuestionsLoading = true;
      refreshEditorQuestions().finally(() => (editorQuestionsLoading = false));
    }
    document.addEventListener("keydown", onKeydown);
    return () => document.removeEventListener("keydown", onKeydown);
  });
</script>

<section class="screen" id="screen-chapters" data-screen="chapters">
  <div class="split">
    <div class="split-list">
      <div class="panel-header">
        <div class="panel-header-left">
          <!-- Раньше кнопка "← Меню" была отдельным элементом НАД .split
               (см. Profile/Settings/Credits/RandomCount — там тоже перенесли
               кнопку выхода внутрь рамки-карточки) — теперь внутри рамки
               .split, первым элементом в шапке левой колонки. -->
          <button class="ghost small screen-back" type="button" onclick={returnToMenu}>← Меню</button>
          <p class="panel-label">Выберите главу</p>
        </div>
        {#if canEditContent()}
          <div class="panel-actions">
            <button class="icon-btn" type="button" title="Поиск вопроса по всем главам" onclick={() => (showSearch = true)}>🔍</button>
            <button class="icon-btn" type="button" title="Добавить главу" onclick={() => (editingChapter = false)}>➕</button>
            <button class="icon-btn" class:active={appState.editMode} type="button" title="Режим редактирования" onclick={toggleEditMode}>✏️</button>
          </div>
        {/if}
      </div>

      {#if selectableChapters.length > 0}
        <div
          class="chapter-select-all"
          role="checkbox"
          tabindex="0"
          aria-checked={allChaptersChecked ? "true" : someChaptersChecked ? "mixed" : "false"}
          onclick={toggleAllChapters}
          onkeydown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), toggleAllChapters())}
        >
          <span class="c-checkbox" class:partial={someChaptersChecked}>{allChaptersChecked ? "🗹" : "☐"}</span>
          <span>Отметить все</span>
        </div>
      {/if}

      <ul class="chapter-list" id="chapter-list">
        {#each appState.chapters as c, i (c.id)}
          {@const hasQuestions = (c.count || 0) > 0}
          {@const checked = appState.checkedChapters.has(c.id)}
          <li>
            <div
              class="chapter-item"
              class:active={i === appState.chapterIndex}
              class:empty={!hasQuestions}
              class:checked
              role="button"
              tabindex="-1"
              onclick={() => selectRow(i)}
              ondblclick={(e) => { e.preventDefault(); toggleChapterCheck(c); }}
              onkeydown={(e) => (e.key === "Enter") && (e.preventDefault(), selectRow(i))}
            >
              <span
                class="c-checkbox"
                data-role="checkbox"
                role="checkbox"
                tabindex="-1"
                aria-checked={checked}
                onclick={(e) => {
                  e.stopPropagation();
                  toggleChapterCheck(c);
                }}
                onkeydown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    e.stopPropagation();
                    toggleChapterCheck(c);
                  }
                }}
              >
                {checked ? "🗹" : "☐"}
              </span>
              <span class="c-num">{String(c.num ?? i + 1).padStart(2, "0")}</span>
              <span class="c-title">{c.title}</span>
              {#if canEditContent() && appState.editMode}
                <span class="c-controls">
                  <button
                    class="icon-btn tiny"
                    type="button"
                    title="Переименовать"
                    onclick={(e) => { e.stopPropagation(); appState.chapterIndex = i; editingChapter = c; }}
                  >✏️</button>
                  {#if isAdmin()}
                    <button
                      class="icon-btn tiny danger"
                      type="button"
                      title="Удалить"
                      onclick={(e) => { e.stopPropagation(); appState.chapterIndex = i; confirmDeleteChapter(c); }}
                    >❌</button>
                  {/if}
                </span>
              {/if}
            </div>
          </li>
        {/each}
      </ul>
    </div>

    <div class="split-detail" id="chapter-detail">
      {#if !current}
        <p class="loading">
          {appState.chapters.length ? "Выбери главу слева" : "Нет глав."}
        </p>
      {:else}
        <p class="d-eyebrow">Глава {current.num ?? appState.chapterIndex + 1}</p>
        <h2>{current.title}</h2>
        <p class="d-desc">{current.description}</p>
        <p class="d-count">{current.count ?? 0} вопросов в главе</p>
        {#if checkedCount}
          <p class="d-selected">Отмечено глав: {checkedCount}</p>
        {/if}
        <button class="chapter-start" disabled={startDisabled} onclick={chaptersConfirm}>{startLabel}</button>

        {#if canEditContent()}
          <div class="questions-manage">
            <div class="questions-manage-header">
              <p class="panel-label">Вопросы главы</p>
              <button class="icon-btn" type="button" title="Добавить вопрос" onclick={() => (editingQuestion = false)}>➕</button>
            </div>
            <ul class="editor-question-list">
              {#if !appState.editorQuestions.length}
                <li class="loading">{editorQuestionsLoading ? "Загрузка…" : "Вопросов пока нет."}</li>
              {:else}
                {#each appState.editorQuestions as q, i (q.id)}
                  <li
                    class="editor-question-item"
                    onmouseenter={(e) => onQuestionRowEnter(e, q)}
                    onmouseleave={hideEqTooltip}
                  >
                    <span class="eq-num">{i + 1}</span>
                    <span class="eq-text">{q.text}</span>
                    <span class="eq-controls">
                      <button class="icon-btn tiny" type="button" title="Редактировать" onclick={() => (editingQuestion = q)}>✏️</button>
                    </span>
                  </li>
                {/each}
              {/if}
            </ul>
          </div>
        {/if}
      {/if}
    </div>
  </div>
</section>

{#if editingChapter !== null}
  {#key editingChapter}
    <ChapterFormModal chapter={editingChapter || null} onclose={() => (editingChapter = null)} />
  {/key}
{/if}
{#if editingQuestion !== null}
  {#key editingQuestion}
    <QuestionFormModal question={editingQuestion || null} onclose={() => (editingQuestion = null)} />
  {/key}
{/if}
{#if showSearch}
  <QuestionSearchModal onclose={() => (showSearch = false)} />
{/if}
