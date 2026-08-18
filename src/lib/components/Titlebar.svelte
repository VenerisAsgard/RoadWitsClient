<script>
  import { state, ROLE_LABELS } from "$lib/state.svelte.js";
  import { isTouchDevice } from "$lib/device.js";
  import { openContentModal, setHint, openAboutModal } from "$lib/stores/ui.svelte.js";
  import { loadLeaderboard } from "$lib/friends.svelte.js";
  import { checkConnection } from "$lib/connection.js";

  const initial = $derived(
    (state.user?.first_name || state.user?.email || "?").trim().charAt(0).toUpperCase() || "?",
  );
  // Тот же принцип, что и в ProfileScreen.svelte (avatarStyle): если есть
  // profile_photo — показываем фото, иначе цветной кружок с инициалом.
  // Раньше титлбар всегда рендерил только букву, даже когда фото было
  // загружено (несовпадение с ProfileScreen, где фото уже показывалось).
  const avatarStyle = $derived.by(() => {
    const photo = state.user?.profile_photo;
    if (photo) return `background: url(${photo}) center/cover`;
    // По просьбе — вернули на var(--amber) (не var(--accent), не hsl по id).
    // Текст фиксированно тёмный: amber светлый, белый текст на нём был бы
    // плохо читаем.
    return `background: var(--amber); color: #0b0d10`;
  });
  const displayName = $derived(
    [state.user?.first_name, state.user?.last_name].filter(Boolean).join(" ") ||
      (state.user ? `Пользователь #${state.user.id}` : "—"),
  );
  const roleLabel = $derived(state.user ? ROLE_LABELS[state.user.user_type] || state.user.user_type : "—");

  function openProfile() {
    // Профиль, админка и "О программе" — одна группа экранов (см.
    // src-legacy/js/quiz.js openProfile). Аватар в титлбаре виден и на
    // admin/credits тоже — если считать текущим "исходным" экраном сам
    // admin/credits, profileReturnScreen перезапишется на них, и тогда
    // Esc/"Назад" начнут вечно перекидывать между профилем и админкой
    // туда-обратно. Запоминаем экран-источник только когда заходим НЕ
    // из этой группы.
    if (!["profile", "settings", "admin", "credits"].includes(state.screen)) {
      state.profileReturnScreen = state.screen;
    }
    state.screen = "profile";
    setHint([]); // отдельная кнопка "← Назад" уже видна на экране — Esc не рекламируем
  }

  function openLeaderboard() {
    openContentModal("🏆 Лидерборд друзей");
    loadLeaderboard();
  }

  function openSettings() {
    // Та же логика группы экранов, что и в openProfile() выше — настройки
    // раньше открывались только изнутри профиля (единственная кнопка входа
    // была там), теперь есть прямой вход из титлбара рядом с лидербордом,
    // поэтому запоминаем экран-источник по тем же правилам, иначе "← Назад"
    // в профиле/настройках/админке/кредитах может увести не туда.
    if (!["profile", "settings", "admin", "credits"].includes(state.screen)) {
      state.profileReturnScreen = state.screen;
    }
    state.screen = "settings";
    setHint([]);
  }

  // По клику на статус — принудительная проверка связи с сервером (по
  // просьбе, см. раньше StatusBar.svelte — теперь перенесено сюда, ближе
  // к кнопке "Свернуть").
  function onStatusClick() {
    checkConnection({ manual: true });
  }
</script>

<!-- Кастомный титлбар (decorations:false в tauri.conf.json). -->
<div class="titlebar" data-tauri-drag-region>
  <h1 class="title">Roadwits</h1>

  {#if state.loggedIn}
    <button class="account-chip" id="account-chip" type="button" onclick={openProfile}>
      <span class="avatar" id="account-avatar" style={avatarStyle}>{state.user?.profile_photo ? "" : initial}</span>
      <span class="account-text">
        <span class="account-name" id="account-name">{displayName}</span>
        <span class="account-role" id="account-role">{roleLabel}</span>
      </span>
    </button>
    <button class="icon-btn trophy-btn" id="leaderboard-btn" type="button" title="Лидерборд друзей" onclick={openLeaderboard}>
      <span class="trophy-icon">🏆</span>
      <span class="trophy-label">Лидерборд</span>
    </button>
    <button class="icon-btn settings-btn" id="settings-btn" type="button" title="Настройки" onclick={openSettings}>
      <span class="settings-icon">⚙️</span>
      <span class="settings-label">Настройки</span>
    </button>
  {/if}

  <!-- Статус сервера + версия — раньше отдельная строка status-bar внизу
       окна (см. --status-h в variables.css), перенесено сюда по просьбе:
       ближе к "Свернуть" (на touch — просто ближе к правому краю, окно
       и так на весь экран, своих кнопок свернуть/закрыть тут нет), и
       внизу окна освобождается место. Вне {#if !isTouchDevice} ниже —
       раньше StatusBar был виден всегда, независимо от типа устройства. -->
  <div class="status-chip-group">
    <button
      type="button"
      class="status-chip"
      data-status={state.connectionStatus}
      disabled={state.connectionStatus === "checking"}
      title={state.connectionStatus === "checking" ? "Проверка…" : `${state.connectionDetail} · нажмите, чтобы проверить снова`}
      onclick={onStatusClick}
    >
      <span class="status-chip-dot"></span>
      {#if state.connectionStatus === "checking"}
        Проверка…
      {:else if state.connectionStatus === "ok"}
        Онлайн
      {:else if state.connectionStatus === "degraded"}
        Проблемы
      {:else}
        Нет связи
      {/if}
    </button>
    <button type="button" class="status-chip status-chip-version" title="О программе" onclick={openAboutModal}>{state.appVersion}</button>
  </div>

  {#if !isTouchDevice}
    <div class="window-buttons">
      <button class="traffic minimize" id="minimize"><span>−</span></button>
      <button class="traffic maximize" id="maximize"><span>□</span></button>
      <button class="traffic close" id="close"><span>×</span></button>
    </div>
  {/if}
</div>
