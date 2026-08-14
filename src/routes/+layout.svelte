<script>
  import "$lib/styles/main.css";
  import { isLightTheme, accentColor } from "$lib/state.svelte.js";

  let { children } = $props();

  // Тема пользователя (state.user.settings.theme, меняется в
  // SettingsScreen.svelte toggleTheme()) нигде не применялась к документу —
  // CSS уже содержит правила :root[data-theme="light"] (components.css), но
  // сам атрибут data-theme никто не проставлял, поэтому переключатель темы
  // сохранял значение на сервере, но визуально ничего не менялось.
  // Реактивный эффект здесь — единственное место, которое трогает атрибут.
  $effect(() => {
    document.documentElement.setAttribute("data-theme", isLightTheme() ? "light" : "dark");
  });

  // Акцентный цвет (state.user.settings.accent, выбор в SettingsScreen.svelte,
  // пресеты — variables.css :root[data-accent="..."]). "amber" — цвет по
  // умолчанию, для него отдельного блока в CSS нет, поэтому просто не
  // проставляем атрибут (браузер использует базовый :root).
  $effect(() => {
    const accent = accentColor();
    if (accent === "amber") {
      document.documentElement.removeAttribute("data-accent");
    } else {
      document.documentElement.setAttribute("data-accent", accent);
    }
  });
</script>

{@render children?.()}
