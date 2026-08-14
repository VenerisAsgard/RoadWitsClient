<script>
  import { state, ROLE_LABELS } from "$lib/state.svelte.js";
  import { isTouchDevice } from "$lib/device.js";
  import { openContentModal, setHint } from "$lib/stores/ui.svelte.js";
  import { loadLeaderboard } from "$lib/friends.svelte.js";

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
    const hue = ((state.user?.id || 0) * 47) % 360;
    return `background: hsl(${hue}, 55%, 40%)`;
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
    if (!["profile", "admin", "credits"].includes(state.screen)) {
      state.profileReturnScreen = state.screen;
    }
    state.screen = "profile";
    setHint([]); // отдельная кнопка "← Назад" уже видна на экране — Esc не рекламируем
  }

  function openLeaderboard() {
    openContentModal("🏆 Лидерборд друзей");
    loadLeaderboard();
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
    <button class="icon-btn trophy-btn" id="leaderboard-btn" type="button" title="Лидерборд друзей" onclick={openLeaderboard}>🏆</button>
  {/if}

  {#if !isTouchDevice}
    <div class="window-buttons">
      <button class="traffic minimize" id="minimize"><span>−</span></button>
      <button class="traffic maximize" id="maximize"><span>□</span></button>
      <button class="traffic close" id="close"><span>×</span></button>
    </div>
  {/if}
</div>
