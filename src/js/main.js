/**
 * Точка входа. Ничего не решает сама — только импортирует остальные модули
 * и вызывает их в правильном порядке при старте.
 */
import * as device from "./device.js";
import * as render from "./render.js";
import * as auth from "./auth.js";
import * as controls from "./controls.js";
import * as api from "./api.js";
import { state } from "./state.js";
import { HEALTHCHECK_POLL_MS } from "./config.js";

async function init() {
  device.disableWebDefaults();
  controls.initProductKeyFormatting();
  controls.initKeyboardControls();
  controls.initMouseControls();

  // Кнопки управления окном и живая коррекция пропорций — только на десктопе:
  // на телефоне/планшете (pointer: coarse) нет ни оконного режима, ни смысла
  // держать эти обработчики навешенными на скрытые (см. components.css) кнопки.
  if (!device.isTouchDevice) {
    device.initWindowControls();
    device.enforceLandscapeWindow();
  }

  render.$("login-form").addEventListener("submit", (e) => {
    e.preventDefault();
    auth.submitLogin(render.$("product-key").value.trim());
  });

  render.$("logout-button").addEventListener("click", () => {
    auth.logout();
  });

  await auth.tryAutoLogin();
  device.setDevtoolsAllowed(state.user?.user_type === "admin");
  render.hideSplash();
  const checkConnection = async () => {
    try { const data = await api.health(); render.renderConnection(data?.status === "ok" ? "ok" : "degraded", data?.status || "статус сервера не ok"); }
    catch (err) { render.renderConnection("offline", "Проблемы с подключением или сервером"); }
  };
  checkConnection();
  // Раз в 2 минуты достаточно, чтобы индикатор в титлбаре не врал больше
  // чем на пару минут — 30 секунд гоняли запрос настолько часто, что он
  // забивал собой логи сервера (см. HEALTHCHECK_POLL_MS в config.js).
  window.setInterval(checkConnection, HEALTHCHECK_POLL_MS);
}

init();
