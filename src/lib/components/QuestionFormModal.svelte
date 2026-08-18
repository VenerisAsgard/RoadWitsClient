<script>
  import { untrack } from "svelte";
  import Modal from "./Modal.svelte";
  import { createQuestion, updateQuestionById, buildQuestionIndex, findSimilarQuestions, fileToBase64, confirmDeleteQuestion } from "$lib/admin.js";
  import { toast } from "$lib/stores/ui.svelte.js";
  import { state as appState } from "$lib/state.svelte.js";

  let { question = null, onclose } = $props();

  // Форма — это снимок question на момент открытия модалки (компонент
  // всегда монтируется заново под конкретный вопрос, см. {#key} в
  // ChaptersScreen.svelte), дальше поля редактируются локально и не
  // должны переезжать при мутациях исходного question. untrack()
  // явно фиксирует это как намеренное разовое чтение (иначе Svelte 5
  // предупреждает: "This reference only captures the initial value").
  let text = $state(untrack(() => question?.text ?? ""));
  let hint = $state(untrack(() => question?.explanation ?? ""));
  let answers = $state(
    untrack(() =>
      question
        ? question.options.map((t, i) => ({ text: t, correct: i === question.correctIndex }))
        : [
            { text: "", correct: true },
            { text: "", correct: false },
          ],
    ),
  );
  let fileInput = $state(null);
  let filePreviewUrl = $state(null); // data URL нового выбранного файла — для превью
  let imageRemoved = $state(false);
  let saving = $state(false);
  let dupWarning = $state(null); // { exact, chapterTitle, text, id, question, moreCount } | null
  let dupTimer = null;
  let dupPreview = $state(false);

  const showCurrentImage = $derived(!!question?.image && !imageRemoved && !filePreviewUrl);

  function addAnswerRow() {
    answers.push({ text: "", correct: false });
  }
  function removeAnswerRow(i) {
    // Бэкенд требует минимум 2 варианта — не даём удалить ниже порога.
    if (answers.length > 2) answers.splice(i, 1);
  }
  function setCorrect(i) {
    answers.forEach((a, idx) => (a.correct = idx === i));
  }

  function onFileChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    imageRemoved = false;
    const reader = new FileReader();
    reader.onload = () => (filePreviewUrl = String(reader.result));
    reader.readAsDataURL(file);
  }
  function removeCurrentImage() {
    imageRemoved = true;
    filePreviewUrl = null;
    if (fileInput) fileInput.value = "";
  }

  async function checkDuplicates() {
    const t = text.trim();
    if (t.length < 4) {
      dupWarning = null;
      return;
    }
    const index = await buildQuestionIndex();
    const found = findSimilarQuestions(index, t, { threshold: 0.6, excludeId: question?.id, limit: 3 });
    if (!found.length) {
      dupWarning = null;
      return;
    }
    const top = found[0];
    dupWarning = {
      exact: top.exact,
      chapterTitle: top.chapter.title,
      text: top.question.text,
      id: top.question.id,
      question: top.question,
      moreCount: found.length - 1,
    };
  }
  function onTextInput() {
    clearTimeout(dupTimer);
    dupTimer = setTimeout(checkDuplicates, 350);
  }
  checkDuplicates(); // и сразу при открытии формы, не только по вводу

  let deleting = $state(false);
  async function onDelete() {
    // question.chapterId — та же логика, что и в submit() ниже: см.
    // questions.js withChapterId; запасной вариант — глава, выбранная в
    // редакторе (на случай очень старого закэшированного вопроса без
    // этого поля).
    const chapterId = question?.chapterId ?? appState.chapters[appState.chapterIndex]?.id;
    deleting = true;
    const ok = await confirmDeleteQuestion(chapterId, question.id);
    deleting = false;
    if (ok) onclose?.();
  }

  async function submit(e) {
    e.preventDefault();
    const t = text.trim();
    const h = hint.trim();
    if (!t || answers.some((a) => !a.text.trim())) {
      toast("Заполни текст вопроса и все варианты ответа", "error");
      return;
    }
    if (answers.filter((a) => a.correct).length !== 1) {
      toast("Отметь ровно один правильный вариант", "error");
      return;
    }

    const file = fileInput?.files?.[0];
    // undefined — не трогать сохранённое фото, null — убрать его явно,
    // строка — заменить новым файлом.
    const imageBase64 = file ? await fileToBase64(file) : imageRemoved ? null : undefined;

    const payload = {
      text: t,
      hint: h,
      imageBase64,
      answers: answers.map((a) => ({ text: a.text.trim(), is_correct: a.correct })),
    };

    saving = true;
    // question.chapterId — проставляется в questions.js (withChapterId) при
    // загрузке вопросов; запасной вариант — глава, выбранная в редакторе
    // (на случай очень старого закэшированного вопроса без этого поля).
    const chapterId = question?.chapterId ?? appState.chapters[appState.chapterIndex]?.id;
    const ok = question ? await updateQuestionById(chapterId, question.id, payload) : await createQuestion(payload);
    saving = false;
    if (ok) onclose?.();
  }
</script>

<Modal title={question ? "Редактировать вопрос" : "Новый вопрос"} wide onclose={() => onclose?.()}>
  <form onsubmit={submit}>
    <label>
      Текст вопроса
      <textarea required rows="2" bind:value={text} oninput={onTextInput}></textarea>
    </label>

    {#if dupWarning}
      <div class="question-dup-warning">
        ⚠️ {dupWarning.exact ? "Точно такой же вопрос уже есть" : "Похожий вопрос уже есть"} в главе «{dupWarning.chapterTitle}»{dupWarning.moreCount > 0 ? ` (и ещё ${dupWarning.moreCount})` : ""}:<br />
        {#if dupWarning.exact}
          <span role="button" tabindex="0" class="dup-link" onclick={() => (dupPreview = !dupPreview)} onkeydown={(e) => (e.key === "Enter" || e.key === " ") && (dupPreview = !dupPreview)}>«{dupWarning.text}»</span>
        {:else}
          «{dupWarning.text}»
        {/if}
      </div>
    {/if}

    {#if dupWarning?.exact && dupPreview}
      <div class="question-preview duplicate-preview">
        <p class="modal-hint">Найденный вопрос:</p>
        <p class="q-text">{dupWarning.text}</p>
        {#if dupWarning.question?.options}
          <ul class="q-options">
            {#each dupWarning.question.options as option, i}
              <li class="q-option">
                <span class="o-key">{i + 1}</span><span>{option}</span>
              </li>
            {/each}
          </ul>
        {/if}
        {#if dupWarning.question?.image}
          <img class="qp-image" alt="Изображение найденного вопроса" src={dupWarning.question.image} />
        {/if}
      </div>
    {/if}

    <label>
      Подсказка (необязательно)
      <textarea rows="2" bind:value={hint}></textarea>
    </label>

    <label>
      Фото (необязательно)
      <input type="file" accept="image/*" bind:this={fileInput} onchange={onFileChange} />
    </label>
    {#if filePreviewUrl}
      <div class="qf-image-wrap">
        <img alt="Новое фото вопроса" src={filePreviewUrl} />
        <button type="button" class="icon-btn tiny danger" title="Убрать выбранный файл" onclick={removeCurrentImage}>❌</button>
      </div>
    {:else if showCurrentImage}
      <div class="qf-image-wrap">
        <img alt="Текущее фото вопроса" src={question.image} />
        <button type="button" class="icon-btn tiny danger" title="Удалить фото" onclick={removeCurrentImage}>❌</button>
      </div>
      <p class="modal-hint">Текущее фото показано выше. Выбери новый файл, чтобы заменить, или удали крестиком.</p>
    {/if}

    <p class="modal-hint">Отметь один правильный вариант слева от него.</p>
    <div class="answers-editor">
      {#each answers as a, i}
        <div class="answer-row">
          <input type="radio" name="correct" checked={a.correct} onchange={() => setCorrect(i)} />
          <input type="text" class="answer-text" placeholder="Вариант ответа" required bind:value={a.text} />
          <button type="button" class="icon-btn tiny danger" title="Убрать вариант" onclick={() => removeAnswerRow(i)}>❌</button>
        </div>
      {/each}
    </div>
    <button type="button" class="ghost small" onclick={addAnswerRow}>+ вариант ответа</button>

    <div class="modal-actions">
      {#if question}
        <button type="button" class="ghost danger" disabled={deleting || saving} onclick={onDelete}>🗑 Удалить вопрос</button>
      {/if}
      <span class="modal-actions-spacer"></span>
      <button type="button" class="ghost" onclick={() => onclose?.()}>Отмена</button>
      <button type="submit" disabled={saving}>{question ? "Сохранить" : "Создать"}</button>
    </div>
  </form>
</Modal>
