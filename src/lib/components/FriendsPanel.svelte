<script>
  import { onMount } from "svelte";
  import {
    friends,
    loadFriends,
    friendPartner,
    friendLabel,
    sendFriendRequestByEmail,
    acceptFriendRequestById,
    removeFriendshipById,
  } from "$lib/friends.svelte.js";

  let email = $state("");
  let sending = $state(false);

  onMount(() => {
    // Раньше грузили только если !friends.loaded — но флаг loaded, once true,
    // никогда не сбрасывается, поэтому при повторном открытии панели (после
    // первого визита в профиль) свежие данные (например, принятая другой
    // стороной заявка) не подтягивались до перезапуска приложения. Грузим
    // при каждом монтировании панели.
    loadFriends();
  });

  async function send(e) {
    e.preventDefault();
    if (!email.trim()) return;
    sending = true;
    const ok = await sendFriendRequestByEmail(email.trim());
    sending = false;
    if (ok) email = "";
  }
</script>

<div class="profile-settings">
  <p class="panel-label">Друзья</p>

  <form class="friend-add-row" onsubmit={send}>
    <input type="email" placeholder="email друга" bind:value={email} />
    <button type="submit" class="icon-btn friend-add-btn" title="Добавить друга" disabled={sending}>+</button>
  </form>

  {#if friends.incoming.length}
    <p class="friends-label">Входящие заявки</p>
    <ul class="friends-list" id="friends-incoming">
      {#each friends.incoming as f (f.id)}
        <li class="friend-row">
          <span class="friend-email">{friendLabel(friendPartner(f))}</span>
          <span class="friend-row-actions">
            <button type="button" class="icon-btn tiny" title="Принять" onclick={() => acceptFriendRequestById(f.id)}>✓</button>
            <button type="button" class="icon-btn tiny danger" title="Отклонить" onclick={() => removeFriendshipById(f.id)}>✕</button>
          </span>
        </li>
      {/each}
    </ul>
  {/if}

  {#if friends.outgoing.length}
    <p class="friends-label">Отправленные заявки</p>
    <ul class="friends-list" id="friends-outgoing">
      {#each friends.outgoing as f (f.id)}
        <li class="friend-row">
          <span class="friend-email">{friendLabel(friendPartner(f))}</span>
          <span class="friend-row-actions">
            <span class="friend-pending-hint">ожидает</span>
            <button type="button" class="icon-btn tiny danger" title="Отозвать" onclick={() => removeFriendshipById(f.id)}>✕</button>
          </span>
        </li>
      {/each}
    </ul>
  {/if}

  <p class="friends-label">Друзья</p>
  <ul class="friends-list" id="friends-accepted">
    {#each friends.accepted as f (f.id)}
      <li class="friend-row">
        <span class="friend-email">{friendLabel(friendPartner(f))}</span>
        <button type="button" class="icon-btn tiny danger" title="Удалить" onclick={() => removeFriendshipById(f.id, { confirm: true })}>✕</button>
      </li>
    {:else}
      <li class="friends-empty">Пока никого не добавлено</li>
    {/each}
  </ul>
</div>
