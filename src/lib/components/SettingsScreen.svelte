<script>
  import { onMount } from "svelte";
  import { state as appState, isLightTheme, isAdmin, ACCENT_PRESETS, accentColor } from "$lib/state.svelte.js";
  import * as api from "$lib/api/api.js";
  import * as cache from "$lib/api/cache.js";
  import { toast, confirmDialog } from "$lib/stores/ui.svelte.js";
  import { refreshAllCache } from "$lib/api/questions.js";

  // Настройки — раньше жили внутри ProfileScreen.svelte вперемешку с личными
  // данными; вынесены в отдельный экран по просьбе (см. ai_work.md todo):
  // тема, акцентный цвет, офлайн-кэш и (для админов) вход в админку — сюда,
  // личные данные/фото/лицензия/друзья/выход — остались в профиле.

  function formatBytes(n) {
    if (n < 1024) return `${n} Б`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} КБ`;
    return `${(n / (1024 * 1024)).toFixed(1)} МБ`;
  }

  function formatRelativeTime(ts) {
    if (!ts) return "—";
    const diffMin = Math.round((Date.now() - ts) / 60000);
    if (diffMin < 1) return "только что";
    if (diffMin < 60) return `${diffMin} мин назад`;
    const diffH = Math.round(diffMin / 60);
    if (diffH < 24) return `${diffH} ч назад`;
    return new Date(ts).toLocaleDateString("ru-RU", { year: "numeric", month: "long", day: "numeric" });
  }

  let lightTheme = $state(isLightTheme());
  let accent = $state(accentColor());

  async function saveSettings(next) {
    const settings = { ...(appState.user?.settings || {}), ...next };
    try {
      const updated = await api.updateSettings(appState.token, settings);
      appState.user = { ...appState.user, settings: updated.settings ?? settings };
      return true;
    } catch {
      return false;
    }
  }

  async function toggleTheme() {
    const prev = lightTheme;
    lightTheme = !lightTheme;
    const ok = await saveSettings({ theme: lightTheme ? "light" : "dark" });
    if (!ok) {
      lightTheme = prev; // откат при ошибке сети
      toast("Не удалось сохранить тему", "error");
    }
  }

  async function pickAccent(id) {
    if (id === accent) return;
    const prev = accent;
    accent = id;
    const ok = await saveSettings({ accent: id });
    if (!ok) {
      accent = prev;
      toast("Не удалось сохранить акцентный цвет", "error");
    }
  }

  /* ---------- офлайн-кэш вопросов (перенесено из ProfileScreen как есть) ---------- */
  let cacheStatus = $state(/** @type {{hasChapterList: boolean, chaptersFresh: boolean, cachedChapterCount: number, totalChapters: number, approxBytes: number, newestSavedAt: number|null}|null} */ (null));
  let cacheBusy = $state(false);
  let cacheProgress = $state(null);

  async function loadCacheStatus() {
    cacheStatus = await cache.getStatus();
  }

  async function onRefreshCache() {
    cacheBusy = true;
    cacheProgress = { done: 0, total: 0 };
    try {
      const { chapters, cached, textOnly } = await refreshAllCache((done, total) => (cacheProgress = { done, total }));
      if (cached < chapters) {
        toast(`Закэшировано ${cached} из ${chapters} глав — остальным не хватило места (обычно из-за фото к вопросам)`, "error");
      } else if (textOnly) {
        toast(`Кэш обновлён: ${chapters} глав (у ${textOnly} офлайн-версия без фото — не хватило места)`, "info");
      } else {
        toast(`Кэш обновлён: ${chapters} глав`, "success");
      }
    } catch (err) {
      toast(err instanceof api.ApiError ? err.message : "Не удалось обновить кэш — нет соединения", "error");
    } finally {
      cacheBusy = false;
      cacheProgress = null;
      await loadCacheStatus();
    }
  }

  async function onClearCache() {
    const ok = await confirmDialog({
      title: "Очистить кэш?",
      text: "Офлайн-копия вопросов будет удалена. Без интернета приложение перестанет открывать главы, пока кэш не соберётся заново.",
      confirmLabel: "Да, очистить",
      cancelLabel: "Отмена",
      danger: true,
    });
    if (!ok) return;
    await cache.clearAll();
    toast("Кэш очищен", "info");
    await loadCacheStatus();
  }

  function back() {
    appState.screen = "profile";
  }

  function onKeydown(e) {
    if (e.key === "Escape") {
      e.preventDefault();
      back();
    }
  }

  onMount(() => {
    loadCacheStatus();
    document.addEventListener("keydown", onKeydown);
    return () => document.removeEventListener("keydown", onKeydown);
  });

  function openAdmin() {
    appState.screen = "admin";
  }
  function openCredits() {
    appState.screen = "credits";
  }
</script>

<section class="screen" id="screen-settings" data-screen="settings">
  <button class="ghost small screen-back" type="button" onclick={back}>← Профиль</button>

  <h2 class="settings-title">Настройки</h2>

  <div class="profile-card">
    <div class="profile-settings first">
      <div class="settings-row">
        <p class="panel-label">Тема оформления</p>
        <label class="theme-switch" title="Тема оформления">
          <span class="theme-switch-icon">🌙</span>
          <input type="checkbox" checked={lightTheme} onchange={toggleTheme} />
          <span class="theme-switch-track"><span class="theme-switch-thumb"></span></span>
          <span class="theme-switch-icon">☀️</span>
        </label>
      </div>
    </div>

    <div class="profile-settings">
      <p class="panel-label">Акцентный цвет</p>
      <div class="accent-picker" role="group" aria-label="Акцентный цвет">
        {#each ACCENT_PRESETS as preset (preset.id)}
          <button
            type="button"
            class="accent-swatch"
            class:active={accent === preset.id}
            style="--swatch: {preset.swatch}"
            title={preset.label}
            aria-label={preset.label}
            aria-pressed={accent === preset.id}
            onclick={() => pickAccent(preset.id)}
          ></button>
        {/each}
      </div>
    </div>

    <div class="profile-settings">
      <p class="panel-label">Офлайн-кэш вопросов</p>
      <div class="cache-status">
        {#if cacheBusy && cacheProgress}
          <p class="cache-status-line" data-status="degraded">Кэшируем главы… {cacheProgress.done} из {cacheProgress.total}</p>
        {:else if !cacheStatus}
          <p class="loading">Проверяем…</p>
        {:else if !cacheStatus.hasChapterList && cacheStatus.cachedChapterCount === 0}
          <p class="cache-status-line" data-status="offline">Кэша пока нет — офлайн-режим недоступен, пока не откроешь главы онлайн хотя бы раз.</p>
        {:else}
          {@const complete = cacheStatus.totalChapters > 0 && cacheStatus.cachedChapterCount >= cacheStatus.totalChapters}
          {@const status = !cacheStatus.chaptersFresh ? "degraded" : complete ? "ok" : "degraded"}
          <p class="cache-status-line" data-status={status}>
            {#if cacheStatus.totalChapters}
              Глав в кэше: {cacheStatus.cachedChapterCount} из {cacheStatus.totalChapters}{complete ? "" : " (остальные закэшируются, когда откроешь их онлайн, либо кнопкой ниже)"}
            {:else}
              Глав в кэше: {cacheStatus.cachedChapterCount}
            {/if}
          </p>
          <p class="cache-status-meta">Обновлялся: {formatRelativeTime(cacheStatus.newestSavedAt)} · Занимает: {formatBytes(cacheStatus.approxBytes)}</p>
        {/if}
      </div>
      <div class="cache-actions">
        <button type="button" class="ghost small" disabled={cacheBusy} onclick={onRefreshCache}>🔄 Обновить кэш сейчас</button>
        <button type="button" class="ghost small danger" disabled={cacheBusy} onclick={onClearCache}>🗑️ Очистить кэш</button>
      </div>
    </div>

    {#if isAdmin()}
      <div class="profile-settings">
        <p class="panel-label">Администрирование</p>
        <button class="chapter-start" type="button" onclick={openAdmin}>🛠️ Панель администрирования</button>
      </div>
    {/if}

    <div class="profile-settings">
      <button class="ghost small" type="button" onclick={openCredits}>ℹ️ О программе</button>
    </div>
  </div>
</section>
