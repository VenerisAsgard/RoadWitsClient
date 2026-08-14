<script>
  import { state } from "$lib/state.svelte.js";
</script>

<!-- Полоска статуса связи с сервером — закреплена внизу окна. -->
<div class="status-bar" id="status-bar">
  <span
    id="connection-status"
    class="connection-status"
    data-status={state.connectionStatus}
    title={state.connectionStatus === "checking" ? "" : state.connectionDetail}
  >
    {#if state.connectionStatus === "checking"}
      Сервер: проверка…
    {:else if state.connectionStatus === "ok"}
      Сервер: онлайн
    {:else if state.connectionStatus === "degraded"}
      Сервер: проблемы
    {:else}
      Сервер: нет связи — попробуйте отключить VPN
    {/if}
  </span>
  <span id="app-version" class="app-version">{state.appVersion}</span>
</div>
