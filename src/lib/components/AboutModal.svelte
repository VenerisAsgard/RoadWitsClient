<script>
  import { onMount } from "svelte";
  import { state as appState } from "$lib/state.svelte.js";
  import { aboutModal, closeAboutModal } from "$lib/stores/ui.svelte.js";
  import { checkForUpdates } from "$lib/update.js";
  import { isTauriEnv } from "$lib/device.js";
  import { lockBackgroundScroll } from "$lib/actions/lockBackgroundScroll.js";

  let checking = $state(false);

  async function manualCheck() {
    checking = true;
    try {
      await checkForUpdates(false);
    } finally {
      checking = false;
    }
  }

  onMount(() => {
    function onKeydown(e) {
      if (!aboutModal.open) return;
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopImmediatePropagation();
        closeAboutModal();
      }
    }
    document.addEventListener("keydown", onKeydown, true);
    return () => document.removeEventListener("keydown", onKeydown, true);
  });
</script>

{#if aboutModal.open}
  <div class="modal-overlay" id="about-modal-overlay" use:lockBackgroundScroll>
    <div class="modal-box wide" role="dialog" aria-modal="true">
      <div class="modal-header">
        <h2>О программе</h2>
        <button class="ghost small" type="button" onclick={closeAboutModal}>×</button>
      </div>
      <div class="modal-body" id="about-modal-body">
        <div class="about-body">
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
      </div>
    </div>
  </div>
{/if}
