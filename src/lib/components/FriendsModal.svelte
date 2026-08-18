<script>
  import { onMount } from "svelte";
  import { contentModal, closeContentModal } from "$lib/stores/ui.svelte.js";
  import { leaderboard, loadLeaderboard } from "$lib/friends.svelte.js";
  import { lockBackgroundScroll } from "$lib/actions/lockBackgroundScroll.js";
  import FriendsPanel from "$lib/components/FriendsPanel.svelte";
  import { avatarColorStyle } from "$lib/avatar.js";

  const MEDALS = ["🥇", "🥈", "🥉"];

  /** Раньше "Друзья" (FriendsPanel, в профиле) и "Лидерборд" (эта модалка)
   * были двумя разными местами в приложении. Теперь это одна модалка с
   * двумя вкладками — открывается по той же кнопке-трофею в титлбаре,
   * что и раньше открывала только лидерборд. */
  let tab = $state("leaderboard"); // "leaderboard" | "friends"

  function pointsWord(n) {
    const mod10 = n % 10;
    const mod100 = n % 100;
    if (mod10 === 1 && mod100 !== 11) return "балл";
    if ([2, 3, 4].includes(mod10) && ![12, 13, 14].includes(mod100)) return "балла";
    return "баллов";
  }

  function initials(entry) {
    if (entry.profile_photo) return "";
    return (
      ((entry.first_name?.[0] || "") + (entry.last_name?.[0] || "")).toUpperCase() ||
      (entry.email?.[0] || "U").toUpperCase()
    );
  }

  function avatarStyle(entry) {
    if (entry.profile_photo) return `background: url(${entry.profile_photo}) center/cover`;
    return avatarColorStyle(entry.user_id);
  }

  function displayName(entry) {
    return [entry.first_name, entry.last_name].filter(Boolean).join(" ") || entry.email || `Пользователь #${entry.user_id}`;
  }

  // Сброс на вкладку "Лидерборд" и загрузка данных при каждом открытии —
  // тот же принцип, что раньше был в openLeaderboard() (Titlebar.svelte):
  // данные не должны залипать устаревшими между открытиями. FriendsPanel
  // грузит свои данные сам в onMount, так что достаточно смонтировать её
  // (переключение на вкладку "friends" ниже уже монтирует/размонтирует
  // компонент через {#if}).
  $effect(() => {
    if (contentModal.open) {
      tab = "leaderboard";
      loadLeaderboard();
    }
  });

  onMount(() => {
    function onKeydown(e) {
      if (!contentModal.open) return;
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopImmediatePropagation();
        closeContentModal();
      }
    }
    document.addEventListener("keydown", onKeydown, true);
    return () => document.removeEventListener("keydown", onKeydown, true);
  });
</script>

{#if contentModal.open}
  <div class="modal-overlay" id="modal-overlay" use:lockBackgroundScroll>
    <div class="modal-box" role="dialog" aria-modal="true">
      <div class="modal-header">
        <h2>{contentModal.title}</h2>
        <button class="ghost small" type="button" onclick={closeContentModal}>×</button>
      </div>
      <div class="modal-tabs" role="tablist">
        <button
          type="button"
          role="tab"
          class="modal-tab"
          class:active={tab === "leaderboard"}
          aria-selected={tab === "leaderboard"}
          onclick={() => (tab = "leaderboard")}
        >
          🏆 Лидерборд
        </button>
        <button
          type="button"
          role="tab"
          class="modal-tab"
          class:active={tab === "friends"}
          aria-selected={tab === "friends"}
          onclick={() => (tab = "friends")}
        >
          👥 Друзья
        </button>
      </div>
      <div class="modal-body" id="modal-body">
        {#if tab === "leaderboard"}
          {#if leaderboard.status === "loading"}
            <p class="loading">Загрузка…</p>
          {:else if leaderboard.status === "error"}
            <p class="modal-hint">{leaderboard.error}</p>
          {:else if leaderboard.entries.length === 0}
            <p class="modal-hint">Пока пусто — добавьте друзей на вкладке «Друзья», чтобы сравнивать баллы.</p>
          {:else}
            <ul class="leaderboard-list">
              {#each leaderboard.entries as entry, i (entry.user_id)}
                <li class="leaderboard-row" class:leaderboard-row-me={entry.is_me}>
                  <span class="leaderboard-rank">{MEDALS[i] || i + 1}</span>
                  <span class="avatar" style={avatarStyle(entry)}>{initials(entry)}</span>
                  <span class="leaderboard-name">{displayName(entry)}{#if entry.is_me}<em> (вы)</em>{/if}</span>
                  <span class="leaderboard-points">{entry.points} {pointsWord(entry.points)}</span>
                </li>
              {/each}
            </ul>
          {/if}
        {:else}
          <FriendsPanel />
        {/if}
      </div>
    </div>
  </div>
{/if}
