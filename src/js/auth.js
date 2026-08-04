/**
 * Логин/автологин/логаут. Связывает три чужих модуля (api, device, render),
 * сама бизнес-логика здесь тонкая — просто нужный порядок вызовов.
 */
import { state } from "./state.js";
import * as api from "./api.js";
import * as device from "./device.js";
import * as render from "./render.js";
import * as quiz from "./quiz.js";

async function enterApp(user) {
  state.user = { ...user, settings: user.settings && typeof user.settings === "object" ? user.settings : {} };
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

  try {
    const user = await api.me(token);
    state.token = token;
    await enterApp(user);
  } catch {
    // токен невалиден/истёк/лицензия заблокирована — сбрасываем и просим войти заново
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
  state.chapters = [];
  state.questionPoolCache = null;
  render.showLogin();
}
