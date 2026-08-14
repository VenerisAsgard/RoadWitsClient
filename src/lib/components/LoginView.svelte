<script>
  import { state as appState } from "$lib/state.svelte.js";
  import { submitLogin } from "$lib/auth.js";

  let productKey = $state("");

  /** Автоформат ключа группами по 6 символов через "_" — перенесено из
      src-legacy/js/controls.js initProductKeyFormatting(). */
  function formatKey(e) {
    const raw = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "");
    const groups = [];
    for (let i = 0; i < raw.length; i += 6) groups.push(raw.substring(i, i + 6));
    productKey = groups.join("_");
  }

  function handleSubmit(e) {
    e.preventDefault();
    submitLogin(productKey.trim());
  }
</script>

<section id="login-view" class="view">
  <form id="login-form" onsubmit={handleSubmit}>
    <h1>Roadwits</h1>
    <p class="hint">Введи Product Key лицензии.</p>

    <input
      id="product-key"
      type="text"
      placeholder="A7P91D_QK28JW_P2T9LA_X91KFE"
      autocomplete="off"
      spellcheck="false"
      required
      maxlength="27"
      bind:value={productKey}
      oninput={formatKey}
    />

    <p id="login-error" class="error" class:hidden={!appState.loginError}>{appState.loginError}</p>

    <button id="login-submit" type="submit" disabled={appState.loginSubmitting}>
      {appState.loginSubmitting ? "Входим..." : "Войти"}
    </button>

    <!-- Пока без действия по клику — как и в оригинале, заглушка. -->
    <button id="no-product-key-btn" type="button" class="text-link">Нет ключа продукта?</button>
  </form>
</section>
