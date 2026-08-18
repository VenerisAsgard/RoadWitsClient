<script>
  import Modal from "./Modal.svelte";

  let { productKey, onclose } = $props();

  let copyLabel = $state("Скопировать");
  let boxEl = $state(null);

  async function copy() {
    try {
      await navigator.clipboard.writeText(productKey);
      copyLabel = "Скопировано";
    } catch {
      // Буфер обмена недоступен — выделяем ключ, чтобы его можно было взять руками.
      if (boxEl) {
        const range = document.createRange();
        range.selectNodeContents(boxEl);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
      }
      copyLabel = "Скопируй вручную";
    }
  }
</script>

<Modal title="Лицензия создана" onclose={() => onclose?.()}>
  <p class="modal-text">Product Key этой лицензии — сохраните его, он понадобится для входа.</p>
  <p class="product-key-box" bind:this={boxEl}>{productKey}</p>
  <div class="modal-actions">
    <button type="button" class="ghost" onclick={() => onclose?.()}>Закрыть</button>
    <button type="button" onclick={copy}>{copyLabel}</button>
  </div>
</Modal>
