/**
 * Единственное место, которое пишет в DOM. quiz.js/admin.js/auth.js меняют
 * state и вызывают нужную render-функцию — сами DOM не трогают, и уж тем
 * более не делают fetch (это api.js через quiz.js/admin.js). Если понадобится
 * сменить способ рендера, менять нужно будет только этот файл.
 */
import {
  state,
  MENU_ITEMS,
  RANDOM_COUNT_OPTIONS,
  ROLE_LABELS,
  canEditContent,
  isAdmin,
} from "./state.js";

export const $ = (id) => document.getElementById(id);

/* ============================================================
   Сплэш — оверлей внутри главного окна, не отдельное Tauri-окно.
   ============================================================ */

export function hideSplash() {
  const el = $("splash-overlay");
  el.classList.add("splash-hidden");
  window.setTimeout(() => el.classList.add("hidden"), 250);
}

/* ============================================================
   Переключение login-view <-> app-shell
   ============================================================ */

export function showLogin() {
  $("app-shell").classList.add("hidden");
  $("account-chip").classList.add("hidden");
  $("logout-button").classList.add("hidden");
  $("login-view").classList.remove("hidden");

  $("login-error").classList.add("hidden");
  $("login-error").textContent = "";
  $("product-key").value = "";
  setLoginSubmitting(false);
}

export function showApp() {
  $("login-view").classList.add("hidden");
  $("app-shell").classList.remove("hidden");
  $("account-chip").classList.remove("hidden");
  $("logout-button").classList.remove("hidden");
}

export function setLoginSubmitting(submitting) {
  const btn = $("login-submit");
  btn.disabled = submitting;
  btn.textContent = submitting ? "Входим..." : "Войти";
}

export function showLoginError(message) {
  const el = $("login-error");
  el.textContent = message;
  el.classList.remove("hidden");
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

/* ============================================================
   Аватар — инициалы + детерминированный цвет по id, т.к. бэкенд
   не хранит фото пользователя (см. User в roadwits-server — там
   только текстовые/JSON-поля, ни одного под изображение профиля).
   Если фото когда-нибудь появится на бэкенде — здесь единственное
   место, которое нужно будет поменять на <img>.
   ============================================================ */

function initialsOf(user) {
  const first = (user.first_name || "").trim();
  const last = (user.last_name || "").trim();
  if (first || last) return ((first[0] || "") + (last[0] || "")).toUpperCase();
  if (user.email) return user.email[0].toUpperCase();
  return "U";
}

function avatarHueOf(user) {
  return (user.id * 47) % 360;
}

export function renderAccountChip(user) {
  const avatar = $("account-avatar");
  avatar.textContent = initialsOf(user);
  avatar.style.background = `hsl(${avatarHueOf(user)}, 55%, 40%)`;

  const fullName = [user.first_name, user.last_name].filter(Boolean).join(" ");
  $("account-name").textContent = fullName || user.email || `Пользователь #${user.id}`;
  $("account-role").textContent = ROLE_LABELS[user.user_type] || user.user_type;
}

/* ============================================================
   Сигнал (индикатор состояния) и подсказка клавиш
   ============================================================ */

export function setSignal(mode) {
  $("signal").dataset.mode = mode;
}

export function setHint(text) {
  $("hint-keys").textContent = text;
}

/* ============================================================
   Переключение экранов внутри app-shell
   ============================================================ */

const SCREENS = ["menu", "chapters", "random-count", "question", "result", "profile"];

export function showScreen(name) {
  state.screen = name;
  SCREENS.forEach((s) => {
    $(`screen-${s}`).classList.toggle("hidden", s !== name);
  });
}

/* ============================================================
   MENU
   ============================================================ */

export function renderMenu() {
  const list = $("menu-list");
  list.innerHTML = "";
  MENU_ITEMS.forEach((item, i) => {
    const li = document.createElement("li");
    li.className = "menu-item" + (i === state.menuIndex ? " active" : "");
    li.dataset.index = String(i);
    li.innerHTML = `
      <span class="m-index">${String(i + 1).padStart(2, "0")}</span>
      <span class="m-body">
        <span class="m-title">${item.title}</span>
        <span class="m-sub">${item.sub}</span>
      </span>
    `;
    list.appendChild(li);
  });
}

export function renderMenuMeta() {
  const totalQ = state.chapters.reduce((s, c) => s + (c.count || 0), 0);
  $("menu-total-q").textContent = totalQ ? `${totalQ} вопросов в базе` : "— вопросов";
  $("menu-total-ch").textContent = `${state.chapters.length} глав ПДД`;
}

/* ============================================================
   CHAPTERS
   ============================================================ */

function renderChaptersToolbar() {
  const editable = canEditContent();
  $("chapters-toolbar").classList.toggle("hidden", !editable);
  $("chapter-add-btn").classList.toggle("hidden", !isAdmin()); // создавать главы — только admin
  const editToggle = $("chapters-edit-toggle");
  editToggle.classList.toggle("hidden", !editable);
  editToggle.classList.toggle("active", state.editMode);
}

export function renderChapters() {
  const list = $("chapter-list");
  list.innerHTML = "";
  const editable = canEditContent();

  state.chapters.forEach((c, i) => {
    const li = document.createElement("li");
    const hasQuestions = (c.count || 0) > 0;
    const checked = state.checkedChapters.has(c.id);
    li.className =
      "chapter-item" +
      (i === state.chapterIndex ? " active" : "") +
      (hasQuestions ? "" : " empty") +
      (checked ? " checked" : "");
    li.dataset.index = String(i);

    let controls = "";
    if (editable) {
      controls += `<button class="icon-btn tiny" data-action="rename-chapter" title="Переименовать">✏️</button>`;
      if (state.editMode && isAdmin()) {
        controls += `<button class="icon-btn tiny danger" data-action="delete-chapter" title="Удалить">❌</button>`;
      }
    }

    li.innerHTML = `
      <span class="c-checkbox" data-role="checkbox" role="checkbox" aria-checked="${checked}">${checked ? "☑" : "☐"}</span>
      <span class="c-num">${String(c.num ?? i + 1).padStart(2, "0")}</span>
      <span class="c-title">${c.title}</span>
      ${controls ? `<span class="c-controls">${controls}</span>` : ""}
    `;
    list.appendChild(li);
  });

  renderChaptersToolbar();
  renderChapterDetail();
  const active = list.querySelector(".chapter-item.active");
  if (active) active.scrollIntoView({ block: "nearest" });
}

export function renderChapterDetail() {
  const c = state.chapters[state.chapterIndex];
  const wrap = $("chapter-detail");
  if (!c) {
    wrap.innerHTML = `<p class="loading">Нет глав. ${canEditContent() ? "Добавь первую кнопкой + сверху." : ""}</p>`;
    return;
  }
  const hasQuestions = (c.count || 0) > 0;
  const editable = canEditContent();
  const checkedCount = state.checkedChapters.size;

  const startLabel = checkedCount
    ? `Начать по ${checkedCount} ${checkedCount === 1 ? "главе" : "главам"}`
    : hasQuestions
      ? "Начать тренировку"
      : "Нет вопросов";
  const startDisabled = !checkedCount && !hasQuestions;

  wrap.innerHTML = `
    <p class="d-eyebrow">Глава ${c.num ?? state.chapterIndex + 1}</p>
    <h2>${c.title}</h2>
    <p class="d-desc">${c.description ?? ""}</p>
    <p class="d-count">${c.count ?? 0} вопросов в главе</p>
    ${checkedCount ? `<p class="d-selected">Отмечено глав: ${checkedCount}</p>` : ""}
    <p class="d-hint">Space или клик по ☐ — отметить главу (можно несколько)</p>
    <button id="chapter-start-btn" class="chapter-start" ${startDisabled ? "disabled" : ""}>${startLabel}</button>
    ${
      editable
        ? `
      <div class="questions-manage">
        <div class="questions-manage-header">
          <p class="panel-label">Вопросы главы</p>
          <button class="icon-btn" id="question-add-btn" type="button" title="Добавить вопрос">➕</button>
        </div>
        <ul class="editor-question-list" id="editor-question-list">
          <li class="loading">Загрузка…</li>
        </ul>
      </div>
    `
        : ""
    }
  `;
}

export function renderEditorQuestionList(questions) {
  const list = $("editor-question-list");
  if (!list) return; // деталь главы уже перерисована на что-то другое — не наш случай
  if (!questions.length) {
    list.innerHTML = `<li class="loading">Вопросов пока нет.</li>`;
    return;
  }
  list.innerHTML = "";
  questions.forEach((q, i) => {
    const li = document.createElement("li");
    li.className = "editor-question-item";
    li.dataset.id = String(q.id);
    li.innerHTML = `
      <span class="eq-num">${i + 1}</span>
      <span class="eq-text">${q.text}</span>
      <span class="eq-controls">
        <button class="icon-btn tiny" data-action="edit-question" title="Редактировать">✏️</button>
        <button class="icon-btn tiny danger" data-action="delete-question" title="Удалить">❌</button>
      </span>
    `;
    list.appendChild(li);
  });
}

/* ============================================================
   RANDOM COUNT — сколько вопросов взять для случайного билета
   ============================================================ */

export function renderRandomCount() {
  const list = $("random-count-list");
  list.innerHTML = "";
  RANDOM_COUNT_OPTIONS.forEach((count, i) => {
    const li = document.createElement("li");
    li.className = "menu-item" + (i === state.randomCountIndex ? " active" : "");
    li.dataset.index = String(i);
    li.innerHTML = `
      <span class="m-index">${String(i + 1).padStart(2, "0")}</span>
      <span class="m-body">
        <span class="m-title">${count} вопросов</span>
        <span class="m-sub">Случайная подборка из базы вопросов</span>
      </span>
    `;
    list.appendChild(li);
  });
}

/* ============================================================
   QUESTION (прохождение теста)
   ============================================================ */

export function renderQuestion() {
  const q = state.questions[state.currentQ];
  if (!q) return;
  $("q-current").textContent = state.currentQ + 1;

  const imgWrap = $("q-image-wrap");
  if (q.image) {
    imgWrap.classList.remove("hidden");
    $("q-image").src = q.image;
  } else {
    imgWrap.classList.add("hidden");
  }

  $("q-text").textContent = q.text;

  const optsWrap = $("q-options");
  optsWrap.innerHTML = "";

  const confirmed = state.answers[q.id];
  const pending = state.selected[q.id];
  const revealed = state.mode !== "exam" && confirmed !== undefined;
  const highlighted = confirmed !== undefined ? confirmed : pending;

  q.options.forEach((opt, i) => {
    const li = document.createElement("li");
    li.className = "q-option";
    li.dataset.index = String(i);
    if (highlighted === i) li.classList.add("selected");
    if (revealed) {
      if (i === q.correctIndex) li.classList.add("correct");
      else if (i === confirmed) li.classList.add("wrong");
    }
    li.innerHTML = `<span class="o-key">${i + 1}</span><span>${opt}</span>`;
    optsWrap.appendChild(li);
  });

  $("q-answer-value").textContent = confirmed === undefined ? "_" : String(confirmed + 1);

  const explainEl = $("q-explain");
  if (revealed && q.explanation) {
    explainEl.textContent = q.explanation;
    explainEl.classList.remove("hidden");
  } else {
    explainEl.classList.add("hidden");
    explainEl.textContent = "";
  }

  const pct = (state.currentQ / state.questions.length) * 100;
  $("progress-fill").style.width = `${pct}%`;

  $("q-btn-prev").disabled = state.currentQ === 0;
  $("q-btn-next").textContent =
    state.currentQ === state.questions.length - 1 ? "Завершить →" : "Далее →";
}

export function updateTimerDisplay() {
  const m = Math.floor(state.timerSeconds / 60).toString().padStart(2, "0");
  const s = (state.timerSeconds % 60).toString().padStart(2, "0");
  $("q-timer").textContent = `${m}:${s}`;
}

/* ============================================================
   RESULT
   ============================================================ */

const GAUGE_CIRCUMFERENCE = 540;

export function renderResult({ correct, total, pct, passed }) {
  const gaugeFill = $("gauge-fill");
  gaugeFill.style.stroke = passed ? "var(--green)" : "var(--red)";
  gaugeFill.style.strokeDashoffset = String(GAUGE_CIRCUMFERENCE);
  const offset = GAUGE_CIRCUMFERENCE - (GAUGE_CIRCUMFERENCE * pct) / 100;
  requestAnimationFrame(() => {
    gaugeFill.style.strokeDashoffset = String(offset);
  });

  $("gauge-score").textContent = `${pct}%`;
  $("gauge-verdict").textContent = passed ? "Сдал" : "Не сдал";
  $("result-summary").textContent = `Правильно: ${correct} из ${total} · проходной балл 80%`;
}

export function buildReview() {
  const list = $("review-list");
  list.innerHTML = "";
  state.questions.forEach((q, i) => {
    const userIdx = state.answers[q.id];
    const correct = userIdx === q.correctIndex;
    const item = document.createElement("div");
    item.className = "review-item" + (i === state.reviewIndex ? " active" : "");
    item.dataset.index = String(i);
    const userLine =
      userIdx === undefined
        ? `<p class="rev-wrong">Ответ не выбран</p>`
        : correct
          ? `<p class="rev-correct">Ваш ответ: ${userIdx + 1}) ${q.options[userIdx]} — верно</p>`
          : `<p class="rev-wrong">Ваш ответ: ${userIdx + 1}) ${q.options[userIdx]}</p>`;
    const correctLine = !correct
      ? `<p class="rev-correct">Верно: ${q.correctIndex + 1}) ${q.options[q.correctIndex]}</p>`
      : "";
    item.innerHTML = `
      <p class="rev-q">${i + 1}. ${q.text}</p>
      ${userLine}
      ${correctLine}
      <p class="rev-explain">${q.explanation ?? ""}</p>
    `;
    list.appendChild(item);
  });
}

export function scrollActiveReviewIntoView() {
  const active = $("review-list").querySelector(".review-item.active");
  if (active) active.scrollIntoView({ block: "nearest" });
}

/* ============================================================
   PROFILE — информация о себе; у admin здесь же панель администрирования.
   ============================================================ */

export function renderProfile(user) {
  const initials = initialsOf(user);
  const hue = avatarHueOf(user);
  const fullName = [user.first_name, user.last_name].filter(Boolean).join(" ");

  $("profile-card").innerHTML = `
    <div class="profile-head">
      <span class="avatar large" style="background: hsl(${hue}, 55%, 40%)">${initials}</span>
      <div>
        <h2>${fullName || "Без имени"}</h2>
        <p class="profile-role">${ROLE_LABELS[user.user_type] || user.user_type}</p>
      </div>
    </div>
    <dl class="profile-fields">
      <dt>Email</dt><dd>${user.email || "—"}</dd>
      <dt>Лицензия действует до</dt><dd>${formatDate(user.license_until)}</dd>
      <dt>Статус</dt><dd>${user.is_blocked ? "Заблокирован" : "Активна"}</dd>
    </dl>
    ${isAdmin() ? `<div class="admin-panel" id="admin-panel"><p class="panel-label">Администрирование</p><div class="admin-licenses" id="admin-licenses"><p class="loading">Загрузка лицензий…</p></div><button class="chapter-start" id="license-add-btn" type="button">➕ Выдать лицензию</button></div>` : ""}
  `;
}

export function renderLicenseList(licenses) {
  const wrap = $("admin-licenses");
  if (!wrap) return;
  if (!licenses.length) {
    wrap.innerHTML = `<p class="loading">Лицензий пока нет.</p>`;
    return;
  }
  wrap.innerHTML = "";
  licenses.forEach((lic) => {
    const row = document.createElement("div");
    row.className = "license-row" + (lic.is_blocked ? " blocked" : "");
    row.dataset.id = String(lic.id);
    row.innerHTML = `
      <span class="license-key">${lic.product_key}</span>
      <span class="license-role">${ROLE_LABELS[lic.user_type] || lic.user_type}</span>
      <span class="license-until">до ${formatDate(lic.license_until)}</span>
      <span class="license-controls">
        <button class="icon-btn tiny" data-action="license-extend" title="Продлить на 30 дней">+30д</button>
        <button class="icon-btn tiny" data-action="license-toggle-block" title="${lic.is_blocked ? "Разблокировать" : "Заблокировать"}">${lic.is_blocked ? "🔓" : "🔒"}</button>
      </span>
    `;
    wrap.appendChild(row);
  });
}

/* ============================================================
   МОДАЛКА — единый переиспользуемый контейнер под формы
   (глава/вопрос/лицензия), см. admin.js.
   ============================================================ */

export function openModal(title, bodyHtml) {
  $("modal-title").textContent = title;
  $("modal-body").innerHTML = bodyHtml;
  $("modal-box").classList.remove("danger");
  $("modal-overlay").classList.remove("hidden");
  const firstInput = $("modal-body").querySelector("input, textarea, select");
  if (firstInput) firstInput.focus();
}

export function closeModal() {
  $("modal-overlay").classList.add("hidden");
  $("modal-body").innerHTML = "";
  // confirmDialog() слушает это, чтобы не зависнуть неразрешённым промисом,
  // если модалку закрыли крестиком/Esc, а не одной из её собственных кнопок.
  $("modal-overlay").dispatchEvent(new CustomEvent("modal:closed"));
}

export function isModalOpen() {
  return !$("modal-overlay").classList.contains("hidden");
}

/**
 * Тематический да/нет-диалог (взамен браузерного confirm()) — тот же
 * модальный контейнер, что и формы редактирования, просто с двумя кнопками
 * вместо формы. Возвращает Promise<boolean> — true, если подтвердили.
 */
export function confirmDialog({ title, text, confirmLabel = "Да", cancelLabel = "Отмена", danger = false }) {
  return new Promise((resolve) => {
    let settled = false;
    const settle = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };

    openModal(
      title,
      `
        <p class="modal-text">${text}</p>
        <div class="modal-actions">
          <button type="button" class="modal-btn modal-btn-ghost" data-resolve="cancel">${cancelLabel}</button>
          <button type="button" class="modal-btn ${danger ? "modal-btn-danger" : ""}" data-resolve="confirm">${confirmLabel}</button>
        </div>
      `,
    );
    if (danger) $("modal-box").classList.add("danger");

    const onBodyClick = (e) => {
      const btn = e.target.closest("[data-resolve]");
      if (!btn) return;
      settle(btn.dataset.resolve === "confirm");
      closeModal();
    };
    const onClosed = () => {
      settle(false);
      $("modal-body").removeEventListener("click", onBodyClick);
      $("modal-overlay").removeEventListener("modal:closed", onClosed);
    };

    $("modal-body").addEventListener("click", onBodyClick);
    $("modal-overlay").addEventListener("modal:closed", onClosed);
  });
}
