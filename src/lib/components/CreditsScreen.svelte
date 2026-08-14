<script>
  import { onMount } from "svelte";
  import { state as appState } from "$lib/state.svelte.js";
  import { checkForUpdates } from "$lib/update.js";
  import { isTauriEnv } from "$lib/device.js";

  let checking = $state(false);

  function back() {
    appState.screen = "settings";
  }

  function onKeydown(e) {
    if (e.key === "Escape") {
      e.preventDefault();
      back();
    }
  }

  onMount(() => {
    document.addEventListener("keydown", onKeydown);
    return () => document.removeEventListener("keydown", onKeydown);
  });

  async function manualCheck() {
    checking = true;
    try {
      await checkForUpdates(false);
    } finally {
      checking = false;
    }
  }
</script>

<section class="screen" id="screen-credits" data-screen="credits">
  <button class="ghost small screen-back" type="button" onclick={back}>← Настройки</button>
  <div class="credits-card">
    <div class="credits-head">
      <img class="credits-logo" src="/assets/logo.png" alt="Roadwits" />
      <div>
        <h2>Roadwits</h2>
        <p class="credits-version">Версия {appState.appVersion || "—"}</p>
      </div>
    </div>
    <p class="credits-tagline">Тренажёр для подготовки к экзамену по ПДД РБ.</p>

    <div class="credits-section">
      <p class="panel-label">Технологии</p>
      <ul class="credits-list">
        <li><span class="credits-name">Tauri 2</span><span class="credits-note">Rust-ядро + системный WebView</span></li>
        <li><span class="credits-name">SvelteKit 2 / Svelte 5</span><span class="credits-note">фронтенд, статический адаптер</span></li>
        <li><span class="credits-name">Rust</span><span class="credits-note">нативный слой приложения</span></li>
        <li><span class="credits-name">reqwest (rustls)</span><span class="credits-note">HTTP-клиент без OpenSSL</span></li>
        <li><span class="credits-name">tauri-plugin-store</span><span class="credits-note">хранилище сессии</span></li>
      </ul>
    </div>

    <div class="credits-section">
      <p class="panel-label">Шрифты</p>
      <ul class="credits-list">
        <li><span class="credits-name">Rubik</span><span class="credits-note">SIL Open Font License — Rubik Project Authors</span></li>
        <li><span class="credits-name">Fira Code</span><span class="credits-note">SIL Open Font License — Fira Code Authors</span></li>
        <li><span class="credits-name">Noto Color Emoji</span><span class="credits-note">SIL Open Font License — Google Inc.</span></li>
      </ul>
    </div>

    <div class="credits-section">
      <p class="panel-label">Автор</p>
      <p class="credits-author">VenerisAsgard</p>
    </div>

    {#if isTauriEnv}
      <div class="credits-section">
        <p class="panel-label">Обновления</p>
        <button type="button" class="ghost small" disabled={checking} onclick={manualCheck}>
          {checking ? "Проверяем…" : "Проверить обновления"}
        </button>
      </div>
    {/if}
  </div>
</section>
