<script>
  import "$lib/styles/main.css";
  import { isLightTheme } from "$lib/state.svelte.js";

  let { children } = $props();

  // Тема пользователя (state.user.settings.theme, меняется в
  // ProfileScreen.svelte toggleTheme()) нигде не применялась к документу —
  // CSS уже содержит правила :root[data-theme="light"] (components.css), но
  // сам атрибут data-theme никто не проставлял, поэтому переключатель темы
  // в профиле сохранял значение на сервере, но визуально ничего не менялось.
  // Реактивный эффект здесь — единственное место, которое трогает атрибут.
  $effect(() => {
    document.documentElement.setAttribute("data-theme", isLightTheme() ? "light" : "dark");
  });
</script>

{@render children?.()}
