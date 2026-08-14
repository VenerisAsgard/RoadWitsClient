<script>
  import Modal from "./Modal.svelte";
  import { buildQuestionIndex, findSimilarQuestions } from "$lib/admin.js";

  let { onclose } = $props();

  let query = $state("");
  let results = $state([]);
  let searched = $state(false);
  let timer = null;

  const indexPromise = buildQuestionIndex();

  function onInput() {
    clearTimeout(timer);
    const q = query.trim();
    if (q.length < 2) {
      results = [];
      searched = false;
      return;
    }
    timer = setTimeout(async () => {
      const index = await indexPromise;
      results = findSimilarQuestions(index, q, { threshold: 0.3, limit: 20 });
      searched = true;
    }, 200);
  }
</script>

<Modal title="Поиск вопроса" onclose={() => onclose?.()}>
  <div class="question-search">
    <input
      type="text"
      placeholder="Начни вводить текст вопроса…"
      autocomplete="off"
      bind:value={query}
      oninput={onInput}
    />
    <ul class="question-search-results">
      {#if !searched}
        <li class="modal-hint">Введите хотя бы пару слов из вопроса.</li>
      {:else if results.length === 0}
        <li class="modal-hint">Совпадений не найдено.</li>
      {:else}
        {#each results as r (r.chapter.id + ':' + r.question.id)}
          <li class="question-search-item">
            <span class="qs-chapter">{r.chapter.title}</span>
            <span class="qs-text">{r.question.text}</span>
            <span class="qs-badge" class:exact={r.exact}>
              {r.exact ? "точное совпадение" : `~${Math.round(r.score * 100)}%`}
            </span>
          </li>
        {/each}
      {/if}
    </ul>
  </div>
</Modal>
