<script>
  import { state, ROLE_LABELS, isAdmin } from "$lib/state.svelte.js";
  import { isTouchDevice } from "$lib/device.js";
  import { openContentModal, setHint, openAboutModal, openProfileModal, openSettingsModal } from "$lib/stores/ui.svelte.js";
  import { checkConnection } from "$lib/connection.js";
  import { avatarColorStyle } from "$lib/avatar.js";

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
    return avatarColorStyle(state.user?.id);
  });
  const displayName = $derived(
    [state.user?.first_name, state.user?.last_name].filter(Boolean).join(" ") ||
      (state.user ? `Пользователь #${state.user.id}` : "—"),
  );
  const roleLabel = $derived(state.user ? ROLE_LABELS[state.user.user_type] || state.user.user_type : "—");

  function openLeaderboard() {
    openContentModal("Друзья и лидерборд");
  }

  // Профиль и настройки — по просьбе теперь модалки поверх текущего экрана
  // (см. profileModal/settingsModal в stores/ui.svelte.js), а не отдельные
  // state.screen — открываются/закрываются независимо от того, что сейчас
  // на экране, и не требуют запоминать экран-источник (он просто остаётся
  // как есть под модалкой).

  // Админка — единственный оставшийся полноэкранный член этой группы
  // (see AdminScreen.svelte), поэтому только для неё по-прежнему нужен
  // state.screen + запоминание экрана-источника для кнопки "← Меню".
  // Вход теперь по клику на "Roadwits" вместо настроек (по просьбе).
  function openAdmin() {
    if (state.screen !== "admin") {
      state.profileReturnScreen = state.screen;
    }
    state.screen = "admin";
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
  <!-- Панель администрирования — раньше вход был из настроек, теперь по
       клику на сам заголовок "Roadwits" (по просьбе), и только у админов —
       у остальных это просто заголовок, как и раньше. -->
  {#if isAdmin()}
    <button class="title" type="button" title="Панель администрирования" onclick={openAdmin}>Roadwits</button>
  {:else}
    <h1 class="title">Roadwits</h1>
  {/if}

  {#if state.loggedIn}
    <button class="account-chip" id="account-chip" type="button" onclick={openProfileModal}>
      <span class="avatar" id="account-avatar" style={avatarStyle}>{state.user?.profile_photo ? "" : initial}</span>
      <span class="account-text">
        <span class="account-name" id="account-name">{displayName}</span>
        <span class="account-role" id="account-role">{roleLabel}</span>
      </span>
    </button>
    <button class="icon-btn trophy-btn" id="leaderboard-btn" type="button" title="Друзья и лидерборд" onclick={openLeaderboard}>
      <span class="trophy-icon">🏆</span>
      <span class="trophy-label">Друзья</span>
    </button>
    <button class="icon-btn settings-btn" id="settings-btn" type="button" title="Настройки" onclick={openSettingsModal}>
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
      <button class="traffic maximize" id="maximize" aria-label="Развернуть"><span></span></button>
      <button class="traffic close" id="close"><span>×</span></button>
    </div>
  {/if}
</div>
