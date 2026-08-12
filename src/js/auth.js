/**
 * Логин/автологин/логаут. Связывает три чужих модуля (api, device, render),
 * сама бизнес-логика здесь тонкая — просто нужный порядок вызовов.
 */
import { state } from "./state.js";
import * as api from "./api.js";
import * as device from "./device.js";
import * as render from "./render.js";
import * as quiz from "./quiz.js";
import * as cache from "./cache.js";

async function enterApp(user) {
  state.user = { ...user, settings: user.settings && typeof user.settings === "object" ? user.settings : {} };
  cache.migrateOldCache(); // теперь state.user уже известен — чистим старый (v1) кэш именно под этим аккаунтом
  render.applyTheme();
  render.renderAccountChip(state.user);
  render.showApp();

  state.menuIndex = 0;
  render.renderMenu();
  render.setHint([
    { keys: ["↑", "↓"], label: "выбрать" },
    { keys: ["Enter"], label: "принять" },
  ]);
  render.showScreen("menu");

  await quiz.loadChapters();
}

/** Вызывается один раз при старте: есть ли валидный сохранённый токен? */
export async function tryAutoLogin() {
  const token = await device.loadToken();
  if (!token) {
    render.showLogin();
    return;
  }

  // Нужен и для нормальной работы, и как часть ключа дискового кэша
  // (см. js/cache.js) — получаем его до api.me(), а не после, потому что
  // офлайн-ветка ниже опирается именно на него.
  state.fingerprint = await device.getFingerprint();

  try {
    const user = await api.me(token);
    state.token = token;
    cache.setCachedUser(state.fingerprint, user);
    await enterApp(user);
  } catch (err) {
    // status === 0 — именно сетевая ошибка (см. api.js request(): нет
    // соединения/таймаут), а не "сервер ответил и отверг токен". В этом
    // случае, если раньше уже был успешный вход на этом устройстве,
    // приложение должно уметь работать оффлайн на сохранённых данных, а
    // не разлогинивать пользователя только из-за того, что сервер сейчас
    // недоступен.
    const offline = err instanceof api.ApiError && err.status === 0;
    const cachedUser = offline ? cache.getCachedUser(state.fingerprint) : null;

    if (offline && cachedUser) {
      state.token = token;
      render.toast("Нет связи с сервером — офлайн-режим на сохранённых данных", "info");
      await enterApp(cachedUser);
      return;
    }

    // Токен невалиден/истёк/лицензия заблокирована (сервер ответил и
    // отверг) — сбрасываем и просим войти заново.
    await device.clearToken();
    render.showLogin();
  }
}

export async function submitLogin(productKey) {
  render.setLoginSubmitting(true);
  try {
    const fingerprint = await device.getFingerprint();
    const { access_token } = await api.login(productKey, fingerprint);
    await device.saveToken(access_token);

    const user = await api.me(access_token);
    state.token = access_token;
    state.fingerprint = fingerprint;
    cache.setCachedUser(fingerprint, user);
    cache.migrateOldCache();
    await enterApp(user);
  } catch (err) {
    render.showLoginError(
      err instanceof api.ApiError ? err.message : "Не удалось подключиться к серверу",
    );
    render.setLoginSubmitting(false);
  }
}

export async function logout() {
  // Таймер экзамена мог остаться запущенным, если выйти прямо из теста.
  clearInterval(state.timerHandle);
  state.timerHandle = null;
  await device.clearToken();
  state.token = null;
  state.user = null;
  state.fingerprint = null;
  state.chapters = [];
  state.questionPoolCache = null;
  render.showLogin();
}
