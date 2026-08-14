<script>
  import { untrack } from "svelte";
  import Modal from "./Modal.svelte";
  import { createChapter, renameChapter } from "$lib/admin.js";

  let { chapter = null, onclose } = $props();

  // См. комментарий в QuestionFormModal.svelte — то же самое: снимок
  // на момент открытия, дальше редактируется локально.
  let title = $state(untrack(() => chapter?.title ?? ""));
  let description = $state(untrack(() => chapter?.description ?? ""));
  let saving = $state(false);

  async function submit(e) {
    e.preventDefault();
    const t = title.trim();
    if (!t) return;
    saving = true;
    const ok = chapter ? await renameChapter(chapter, t, description.trim()) : await createChapter(t, description.trim());
    saving = false;
    if (ok) onclose?.();
  }
</script>

<Modal title={chapter ? "Переименовать главу" : "Новая глава"} onclose={() => onclose?.()}>
  <form onsubmit={submit}>
    <label>
      Название
      <input name="title" required bind:value={title} />
    </label>
    <label>
      Описание
      <textarea name="description" rows="3" bind:value={description}></textarea>
    </label>
    <div class="modal-actions">
      <button type="button" class="ghost" onclick={() => onclose?.()}>Отмена</button>
      <button type="submit" disabled={saving}>{chapter ? "Сохранить" : "Создать"}</button>
    </div>
  </form>
</Modal>
