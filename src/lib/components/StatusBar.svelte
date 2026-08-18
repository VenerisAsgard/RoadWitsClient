<script>
  import { state } from "$lib/state.svelte.js";
  import { checkConnection } from "$lib/connection.js";
  import { openAboutModal } from "$lib/stores/ui.svelte.js";

  // По клику на статус — принудительная проверка связи с сервером (по
  // просьбе), не дожидаясь следующего тика фонового опроса (см. connection.js).
  function onStatusClick() {
    checkConnection({ manual: true });
  }
</script>

<!-- Полоска статуса связи с сервером — закреплена внизу окна. -->
<div class="status-bar" id="status-bar">
  <button
    type="button"
    id="connection-status"
    class="connection-status"
    data-status={state.connectionStatus}
    disabled={state.connectionStatus === "checking"}
    title={state.connectionStatus === "checking" ? "Проверка…" : `${state.connectionDetail} · нажмите, чтобы проверить снова`}
    onclick={onStatusClick}
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
  </button>
  <button type="button" id="app-version" class="app-version" title="О программе" onclick={openAboutModal}>{state.appVersion}</button>
</div>
