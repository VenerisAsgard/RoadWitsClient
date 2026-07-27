/**
 * Точка входа. Ничего не решает сама — только импортирует остальные модули
 * и вызывает их в правильном порядке при старте.
 */
import * as device from "./device.js";
import * as render from "./render.js";
import * as auth from "./auth.js";
import * as controls from "./controls.js";

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
  render.hideSplash();
}

init();
