// Чистый JS, без сборщика. window.__TAURI__ доступен благодаря
// "app.withGlobalTauri": true в src-tauri/tauri.conf.json.
const invoke = window.__TAURI__.core.invoke;

// В деве бэкенд поднят через docker-compose на 8000 (см. roadwits-server/.env APP_PORT).
// Для прод-сборки поменяй под реальный адрес API.
const API_BASE_URL = "http://localhost:8000";

const ROLE_LABELS = {
  admin: "Администратор",
  editor: "Редактор",
  student: "Ученик",
};

const loginView = document.getElementById("login-view");
const appView = document.getElementById("app-view");
const loginForm = document.getElementById("login-form");
const productKeyInput = document.getElementById("product-key");
const loginError = document.getElementById("login-error");
const loginSubmit = document.getElementById("login-submit");
const logoutButton = document.getElementById("logout-button");

const userNameEl = document.getElementById("user-name");
const userEmailEl = document.getElementById("user-email");
const userRoleEl = document.getElementById("user-role");
const userLicenseUntilEl = document.getElementById("user-license-until");
const userStatusEl = document.getElementById("user-status");

class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

async function apiFetch(path, { method = "GET", body, token } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    let detail = res.statusText;
    try {
      const data = await res.json();
      detail = data.detail ?? detail;
    } catch {
      // ответ не JSON — оставляем statusText
    }
    throw new ApiError(res.status, detail);
  }

  if (res.status === 204) return undefined;
  return res.json();
}

function formatDate(iso) {
  try {
    return new Date(iso).toLocaleDateString("ru-RU", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}

function showLogin() {
  appView.classList.add("hidden");
  loginView.classList.remove("hidden");
  loginError.classList.add("hidden");
  loginError.textContent = "";
  productKeyInput.value = "";
  loginSubmit.disabled = false;
  loginSubmit.textContent = "Войти";
}

function showApp(user) {
  loginView.classList.add("hidden");
  appView.classList.remove("hidden");

  const fullName = [user.first_name, user.last_name].filter(Boolean).join(" ");
  userNameEl.textContent = fullName || `Пользователь #${user.id}`;
  userEmailEl.textContent = user.email || "—";
  userRoleEl.textContent = ROLE_LABELS[user.user_type] || user.user_type;
  userLicenseUntilEl.textContent = formatDate(user.license_until);
  userStatusEl.textContent = user.is_blocked ? "Заблокирован" : "Активна";
}

async function fetchCurrentUser(token) {
  return apiFetch("/auth/me", { token });
}

async function tryAutoLogin() {
  let token;
  try {
    token = await invoke("load_token");
  } catch (err) {
    console.error("Не удалось прочитать сохранённый токен:", err);
    token = null;
  }

  if (!token) {
    showLogin();
    return;
  }

  try {
    const user = await fetchCurrentUser(token);
    showApp(user);
  } catch {
    // токен невалиден/истёк/лицензия заблокирована — сбрасываем и просим войти заново
    await invoke("clear_token").catch(() => {});
    showLogin();
  }
}

async function handleLoginSubmit(event) {
  event.preventDefault();
  loginError.classList.add("hidden");
  loginSubmit.disabled = true;
  loginSubmit.textContent = "Входим...";

  try {
    const fingerprint = await invoke("get_fingerprint");
    const { access_token } = await apiFetch("/auth/login", {
      method: "POST",
      body: { product_key: productKeyInput.value.trim(), fingerprint },
    });

    await invoke("save_token", { token: access_token });

    const user = await fetchCurrentUser(access_token);
    showApp(user);
  } catch (err) {
    loginError.textContent =
      err instanceof ApiError ? err.message : "Не удалось подключиться к серверу";
    loginError.classList.remove("hidden");
    loginSubmit.disabled = false;
    loginSubmit.textContent = "Войти";
  }
}

async function handleLogout() {
  await invoke("clear_token").catch(() => {});
  showLogin();
}

loginForm.addEventListener("submit", handleLoginSubmit);
logoutButton.addEventListener("click", handleLogout);

tryAutoLogin();
//--------------------------------------------------------------

productKeyInput.maxLength = 27;
productKeyInput.addEventListener("input", () => {
    let value = productKeyInput.value
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, "");

    let groups = [];

    for (let i = 0; i < value.length; i += 6) {
        groups.push(value.substring(i, i + 6));
    }

    productKeyInput.value = groups.join("_");
});

//-------------------------------

const { getCurrentWindow } = window.__TAURI__.window;


const appWindow = getCurrentWindow();


document
    .getElementById("minimize")
    .addEventListener("click", () => {
        appWindow.minimize();
    });


document
    .getElementById("maximize")
    .addEventListener("click", async () => {

        if (await appWindow.isMaximized()) {
            await appWindow.unmaximize();
        } else {
            await appWindow.maximize();
        }

    });


document
    .getElementById("close")
    .addEventListener("click", () => {
        appWindow.close();
    });

document.addEventListener(
    "contextmenu",
    event => {
        event.preventDefault();
    }
);

document.addEventListener(
    "keydown",
    e => {

        if (
            e.key === "F12" ||
            (e.ctrlKey && e.shiftKey && e.key === "I") ||
            (e.ctrlKey && e.shiftKey && e.key === "C")
        ) {
            e.preventDefault();
        }

    }
);
