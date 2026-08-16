<script>
  import { onMount } from "svelte";
  import { state } from "$lib/state.svelte.js";
  import * as device from "$lib/device.js";
  import { tryAutoLogin } from "$lib/auth.js";
  import { checkConnection } from "$lib/connection.js";
  import { HEALTHCHECK_POLL_MS } from "$lib/config.js";

  import Splash from "$lib/components/Splash.svelte";
  import Titlebar from "$lib/components/Titlebar.svelte";
  import LoginView from "$lib/components/LoginView.svelte";
  import MenuScreen from "$lib/components/MenuScreen.svelte";
  import ChaptersScreen from "$lib/components/ChaptersScreen.svelte";
  import RandomCountScreen from "$lib/components/RandomCountScreen.svelte";
  import QuestionScreen from "$lib/components/QuestionScreen.svelte";
  import ResultScreen from "$lib/components/ResultScreen.svelte";
  import ProfileScreen from "$lib/components/ProfileScreen.svelte";
  import SettingsScreen from "$lib/components/SettingsScreen.svelte";
  import AdminScreen from "$lib/components/AdminScreen.svelte";
  import CreditsScreen from "$lib/components/CreditsScreen.svelte";
  import Placeholder from "$lib/components/Placeholder.svelte";
  import StatusBar from "$lib/components/StatusBar.svelte";
  import ToastStack from "$lib/components/ToastStack.svelte";
  import ConfirmDialog from "$lib/components/ConfirmDialog.svelte";
  import ImageViewer from "$lib/components/ImageViewer.svelte";
  import LeaderboardModal from "$lib/components/LeaderboardModal.svelte";
  import HintBar from "$lib/components/HintBar.svelte";
  import EditorTooltip from "$lib/components/EditorTooltip.svelte";

  onMount(() => {
    (async () => {
      // Окно создаётся скрытым (tauri.conf.json visible:false) — показываем,
      // как только сплэш уже нарисован.
      try {
        const { getCurrentWindow } = await import("@tauri-apps/api/window");
        await getCurrentWindow().show();
      } catch {
        // не в Tauri (например, просмотр в обычном браузере при разработке)
      }

      device.disableWebDefaults();

      // УЛУЧШЕНИЕ (надёжность): в оригинале сбой в любом из этих шагов
      // (например, initWindowControls() вне настоящего Tauri-рантайма) не
      // давал коду дойти до строки, которая прячет сплэш — приложение
      // оставалось на сплэше навсегда без единой подсказки, что пошло не
      // так. Оборачиваем самостоятельные, не критичные для входа шаги —
      // каждый со своим try/catch, чтобы падение одного не блокировало
      // остальные и тем более не блокировало логин/автологин.
      try {
        if (!device.isTouchDevice) {
          device.initWindowControls();
          device.enforceLandscapeWindow();
        }
      } catch (err) {
        console.error("Не удалось настроить управление окном:", err);
      }

      device.getAppVersion().then((v) => {
        state.appVersion = v;
      });

      try {
        await tryAutoLogin();
      } catch (err) {
        console.error("Автологин упал неожиданно:", err);
        state.loggedIn = false;
      } finally {
        device.setDevtoolsAllowed(state.user?.user_type === "admin");
        state.booting = false;
      }

      checkConnection();
      const intervalId = window.setInterval(checkConnection, HEALTHCHECK_POLL_MS);
      return () => window.clearInterval(intervalId);
    })();
  });
</script>

<Titlebar />

{#if !state.loggedIn}
  <LoginView />
{:else}
  <div id="app-shell">
    <main class="stage" id="stage">
      {#if state.screen === "menu"}
        <MenuScreen />
      {:else if state.screen === "chapters"}
        <ChaptersScreen />
      {:else if state.screen === "random-count"}
        <RandomCountScreen />
      {:else if state.screen === "question"}
        <QuestionScreen />
      {:else if state.screen === "result"}
        <ResultScreen />
      {:else if state.screen === "profile"}
        <ProfileScreen />
      {:else if state.screen === "settings"}
        <SettingsScreen />
      {:else if state.screen === "admin"}
        <AdminScreen />
      {:else if state.screen === "credits"}
        <CreditsScreen />
      {:else}
        <Placeholder title="Экран в разработке" back="menu" />
      {/if}
    </main>

    <HintBar />
  </div>
{/if}

<StatusBar />
<ConfirmDialog />
<ImageViewer />
<LeaderboardModal />
<EditorTooltip />
<ToastStack />
<Splash />

<!-- Предупреждение о повороте — чисто CSS, @media orientation:portrait and
     pointer:coarse в components.css, на десктопе никогда не показывается. -->
<div class="rotate-overlay" aria-hidden="true">
  <p>Поверни устройство горизонтально</p>
</div>
