/**
 * Логин/автологин/логаут. Перенесено из src-legacy/js/auth.js.
 * Раньше связывал api/device/render.js — теперь вместо render.js
 * (ручной showApp/showLogin/renderMenu и т.п.) просто выставляет
 * реактивные поля state.*, а нужный экран сам рисуется в Svelte-шаблоне.
 */
import { state } from "./state.svelte.js";
import * as api from "./api/api.js";
import * as device from "./device.js";
import * as cache from "./api/cache.js";
import { toast, setHint, closeProfileModal, closeSettingsModal } from "./stores/ui.svelte.js";
import { loadChapters, HINT_MENU } from "./quiz.js";

async function enterApp(user) {
  state.user = { ...user, settings: user.settings && typeof user.settings === "object" ? user.settings : {} };
  cache.migrateOldCache(); // теперь state.user уже известен — чистим старый (v1) кэш именно под этим аккаунтом

  state.loggedIn = true;
  state.menuIndex = 0;
  state.screen = "menu";
  setHint(HINT_MENU);

  await loadChapters();
}

/** Вызывается один раз при старте: есть ли валидный сохранённый токен? */
export async function tryAutoLogin() {
  const token = await device.loadToken();
  if (!token) {
    state.loggedIn = false;
    return;
  }

  // Нужен и для нормальной работы, и как часть ключа дискового кэша.
  state.fingerprint = await device.getFingerprint();

  try {
    const user = await api.me(token);
    state.token = token;
    await cache.setCachedUser(state.fingerprint, user);
    await enterApp(user);
  } catch (err) {
    // status === 0 — сетевая ошибка (см. api.js request()), а не отказ сервера.
    // В этом случае, если раньше уже был успешный вход на этом устройстве,
    // приложение должно уметь работать оффлайн на сохранённых данных.
    const offline = err instanceof api.ApiError && err.status === 0;
    const cachedUser = offline ? await cache.getCachedUser(state.fingerprint) : null;

    if (offline && cachedUser) {
      state.token = token;
      toast("Нет связи с сервером — офлайн-режим на сохранённых данных", "info");
      await enterApp(cachedUser);
      return;
    }

    // Токен невалиден/истёк/лицензия заблокирована — сбрасываем и просим войти заново.
    await device.clearToken();
    state.loggedIn = false;
  }
}

export async function submitLogin(productKey) {
  state.loginSubmitting = true;
  state.loginError = "";
  try {
    const fingerprint = await device.getFingerprint();
    const { access_token } = await api.login(productKey, fingerprint);
    await device.saveToken(access_token);

    const user = await api.me(access_token);
    state.token = access_token;
    state.fingerprint = fingerprint;
    await cache.setCachedUser(fingerprint, user);
    cache.migrateOldCache();
    await enterApp(user);
    state.loginSubmitting = false;
  } catch (err) {
    state.loginError = err instanceof api.ApiError ? err.message : "Не удалось подключиться к серверу";
    state.loginSubmitting = false;
  }
}

export async function logout() {
  // Меню профиля/настроек — отдельные модалки (см. stores/ui.svelte.js),
  // не завязанные на state.loggedIn, поэтому просто сбросить состояние
  // недостаточно: без явного закрытия окно профиля оставалось открытым
  // поверх экрана логина после выхода из аккаунта.
  closeProfileModal();
  closeSettingsModal();
  // Таймер экзамена мог остаться запущенным, если выйти прямо из теста.
  clearInterval(state.timerHandle ?? undefined);
  state.timerHandle = null;
  // На случай выхода сразу после успешного логина (submitLogin уже
  // сбрасывает флаг сам, но эта строка — защита от регресса: без неё
  // при повторном показе LoginView кнопка "Войти" зависает в виде
  // задизейбленной "Входим...").
  state.loginSubmitting = false;
  await device.clearToken();
  state.token = null;
  state.user = null;
  state.fingerprint = null;
  state.chapters = [];
  state.questionPoolCache = null;
  state.loggedIn = false;
}
