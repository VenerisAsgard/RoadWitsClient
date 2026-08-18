<script>
  import Modal from "./Modal.svelte";
  import { createLicense } from "$lib/admin.js";

  let { onclose, oncreated } = $props();

  let userType = $state("student");
  let email = $state("");
  let licenseDays = $state(365);
  let maxDevices = $state(1);
  let saving = $state(false);

  async function submit(e) {
    e.preventDefault();
    saving = true;
    const created = await createLicense({
      userType,
      email: email.trim(),
      licenseDays: Number(licenseDays),
      maxDevices: Number(maxDevices),
    });
    saving = false;
    if (created) {
      onclose?.();
      oncreated?.(created.product_key);
    }
  }
</script>

<Modal title="Выдать лицензию" onclose={() => onclose?.()}>
  <form onsubmit={submit}>
    <label>
      Роль
      <select class="select-styled" bind:value={userType}>
        <option value="student">Ученик</option>
        <option value="editor">Редактор</option>
        <option value="admin">Администратор</option>
      </select>
    </label>
    <label>
      Email (необязательно)
      <input type="email" bind:value={email} />
    </label>
    <label>
      Срок действия, дней
      <input type="number" min="1" required bind:value={licenseDays} />
    </label>
    <label>
      Устройств (до 3х)
      <select class="select-styled" bind:value={maxDevices}>
        <option value={1}>1</option>
        <option value={2}>2</option>
        <option value={3}>3</option>
      </select>
    </label>
    <div class="modal-actions">
      <button type="button" class="ghost" onclick={() => onclose?.()}>Отмена</button>
      <button type="submit" disabled={saving}>Создать</button>
    </div>
  </form>
</Modal>
