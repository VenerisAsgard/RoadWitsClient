/**
 * Всё, что относится к редактированию контента и управлению лицензиями —
 * доступно только editor/admin (главы/вопросы) и только admin (лицензии).
 * Сам этот модуль прав не проверяет — их проверяет бэкенд (403), а видимость
 * кнопок в интерфейсе решает render.js через canEditContent()/isAdmin().
 *
 * Формы живут в модалке (render.openModal) — этот модуль строит их HTML
 * и сам же вешает на них обработчики сразу после открытия: модалка
 * самодостаточна, control.js не обязан знать её внутреннее устройство,
 * только общие вещи вроде "закрыть по Esc/фону/крестику".
 */
import { state, canEditContent } from "./state.js";
import * as api from "./api.js";
import * as render from "./render.js";

function escapeAttr(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;");
}
function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/* ============================================================
   ГЛАВЫ
   ============================================================ */

async function reloadChapters() {
  state.chapters = await api.listChapters(state.token);
  state.questionPoolCache = null; // состав вопросов мог поменяться
  render.renderMenuMeta();
  render.renderChapters(); // это же перерисует и деталь + пустой список вопросов
  await refreshEditorQuestions();
}

function chapterFormHtml(chapter) {
  return `
    <form id="chapter-form">
      <label>Название
        <input name="title" required value="${escapeAttr(chapter?.title ?? "")}" />
      </label>
      ${
        chapter
          ? "" // editor может менять только title — бэкенд остальное отклонит (см. PATCH /chapters/{id})
          : `<label>Описание<textarea name="description" rows="3"></textarea></label>`
      }
      <div class="modal-actions">
        <button type="button" class="ghost" data-action="modal-cancel">Отмена</button>
        <button type="submit">${chapter ? "Сохранить" : "Создать"}</button>
      </div>
    </form>
  `;
}

function wireChapterForm(chapter) {
  const form = document.getElementById("chapter-form");
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const title = form.title.value.trim();
    if (!title) return;
    try {
      if (chapter) {
        await api.updateChapterTitle(state.token, chapter.id, title);
      } else {
        const description = form.description.value.trim();
        await api.createChapter(state.token, { title, description });
      }
      render.closeModal();
      await reloadChapters();
    } catch (err) {
      render.toast(err instanceof api.ApiError ? err.message : "Не удалось сохранить главу", "error");
    }
  });
}

export function promptCreateChapter() {
  render.openModal("Новая глава", chapterFormHtml(null));
  wireChapterForm(null);
}

export function promptRenameChapter() {
  const chapter = state.chapters[state.chapterIndex];
  if (!chapter) return;
  render.openModal("Переименовать главу", chapterFormHtml(chapter));
  wireChapterForm(chapter);
}

export async function confirmDeleteChapter() {
  const chapter = state.chapters[state.chapterIndex];
  if (!chapter) return;
  const ok = await render.confirmDialog({
    title: "Удалить главу?",
    text: `Глава «${chapter.title}» будет удалена вместе со всеми вопросами внутри неё.`,
    confirmLabel: "Удалить",
    cancelLabel: "Отмена",
    danger: true,
  });
  if (!ok) return;
  try {
    await api.deleteChapter(state.token, chapter.id);
    state.chapterIndex = Math.max(0, state.chapterIndex - 1);
    await reloadChapters();
  } catch (err) {
    render.toast(err instanceof api.ApiError ? err.message : "Не удалось удалить главу", "error");
  }
}

export function toggleEditMode() {
  state.editMode = !state.editMode;
  render.renderChapters();
}

/* ============================================================
   ВОПРОСЫ (в рамках выбранной главы)
   ============================================================ */

export async function refreshEditorQuestions() {
  if (!canEditContent()) return;
  const chapter = state.chapters[state.chapterIndex];
  if (!chapter) return;
  try {
    state.editorQuestions = await api.listQuestions(state.token, chapter.id);
    render.renderEditorQuestionList(state.editorQuestions);
  } catch {
    state.editorQuestions = [];
  }
}

function answerRowHtml(text, isCorrect) {
  return `
    <div class="answer-row">
      <input type="radio" name="correct" ${isCorrect ? "checked" : ""} />
      <input type="text" class="answer-text" value="${escapeAttr(text)}" placeholder="Вариант ответа" required />
      <button type="button" class="icon-btn tiny danger" data-action="remove-answer-row">❌</button>
    </div>
  `;
}

function questionFormHtml(question) {
  const rows = question
    ? question.options.map((t, i) => answerRowHtml(t, i === question.correctIndex)).join("")
    : answerRowHtml("", true) + answerRowHtml("", false);
  return `
    <form id="question-form">
      <label>Текст вопроса<textarea name="text" required rows="2">${escapeHtml(question?.text ?? "")}</textarea></label>
      <label>Подсказка (необязательно)<textarea name="hint" rows="2">${escapeHtml(question?.explanation ?? "")}</textarea></label>
      <label>Фото (необязательно)<input type="file" name="image" accept="image/*" /></label>
      ${question?.image ? `<p class="modal-hint">Текущее фото сохранится, если не выбрать новое.</p>` : ""}
      <p class="modal-hint">Отметь один правильный вариант слева от него.</p>
      <div class="answers-editor" id="answers-editor">${rows}</div>
      <button type="button" class="ghost small" data-action="add-answer-row">+ вариант ответа</button>
      <div class="modal-actions">
        <button type="button" class="ghost" data-action="modal-cancel">Отмена</button>
        <button type="submit">${question ? "Сохранить" : "Создать"}</button>
      </div>
    </form>
  `;
}

function wireQuestionForm(question) {
  const form = document.getElementById("question-form");
  const editor = document.getElementById("answers-editor");

  // Делегируем на самой форме, а не на #modal-body: modal-body живёт в
  // разметке постоянно, поэтому обработчик на нём накапливался с каждым
  // открытием формы. На третий раз одна кнопка добавляла три варианта
  // ответа сразу. Форма создаётся заново при каждом открытии модалки,
  // и её обработчики умирают вместе с ней.
  form.addEventListener("click", (e) => {
    if (e.target.closest('[data-action="add-answer-row"]')) {
      editor.insertAdjacentHTML("beforeend", answerRowHtml("", false));
    } else if (e.target.closest('[data-action="remove-answer-row"]')) {
      // Бэкенд требует минимум 2 варианта — не даём удалить ниже этого порога.
      if (editor.children.length > 2) e.target.closest(".answer-row").remove();
    }
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const text = form.text.value.trim();
    const hint = form.hint.value.trim();
    const rows = [...editor.querySelectorAll(".answer-row")];
    const answers = rows.map((row) => ({
      text: row.querySelector(".answer-text").value.trim(),
      is_correct: row.querySelector('input[type="radio"]').checked,
    }));

    if (!text || answers.some((a) => !a.text)) {
      render.toast("Заполни текст вопроса и все варианты ответа", "error");
      return;
    }
    if (answers.filter((a) => a.is_correct).length !== 1) {
      render.toast("Отметь ровно один правильный вариант", "error");
      return;
    }

    const file = form.image.files[0];
    const imageBase64 = file ? await fileToBase64(file) : undefined;

    try {
      const chapter = state.chapters[state.chapterIndex];
      if (question) {
        await api.updateQuestion(state.token, chapter.id, question.id, {
          text,
          hint,
          imageBase64,
          answers,
        });
      } else {
        await api.createQuestion(state.token, chapter.id, { text, hint, imageBase64, answers });
      }
      render.closeModal();
      await reloadChapters(); // у главы изменился question_count — перечитываем целиком
    } catch (err) {
      render.toast(err instanceof api.ApiError ? err.message : "Не удалось сохранить вопрос", "error");
    }
  });
}

export function promptCreateQuestion() {
  render.openModal("Новый вопрос", questionFormHtml(null));
  wireQuestionForm(null);
}

export function promptEditQuestion(questionId) {
  const q = state.editorQuestions.find((x) => x.id === questionId);
  if (!q) return;
  render.openModal("Редактировать вопрос", questionFormHtml(q));
  wireQuestionForm(q);
}

export async function confirmDeleteQuestion(questionId) {
  const ok = await render.confirmDialog({
    title: "Удалить вопрос?",
    text: "Это действие нельзя отменить.",
    confirmLabel: "Удалить",
    cancelLabel: "Отмена",
    danger: true,
  });
  if (!ok) return;
  try {
    const chapter = state.chapters[state.chapterIndex];
    await api.deleteQuestion(state.token, chapter.id, questionId);
    await reloadChapters();
  } catch (err) {
    render.toast(err instanceof api.ApiError ? err.message : "Не удалось удалить вопрос", "error");
  }
}

/* ============================================================
   ЛИЦЕНЗИИ (панель администрирования в профиле, только admin)
   ============================================================ */

export async function loadLicenses() {
  try {
    const licenses = await api.listLicenses(state.token);
    render.renderLicenseList(licenses);
  } catch {
    // панель администрирования не критична для остального приложения — тихо пропускаем
  }
}

function licenseFormHtml() {
  return `
    <form id="license-form">
      <label>Роль
        <select name="user_type" class="select-styled">
          <option value="student">Ученик</option>
          <option value="editor">Редактор</option>
          <option value="admin">Администратор</option>
        </select>
      </label>
      <label>Email (необязательно)<input type="email" name="email" /></label>
      <label>Срок действия, дней<input type="number" name="license_days" value="365" min="1" required /></label>
      <div class="modal-actions">
        <button type="button" class="ghost" data-action="modal-cancel">Отмена</button>
        <button type="submit">Создать</button>
      </div>
    </form>
  `;
}

export function promptCreateLicense() {
  render.openModal("Выдать лицензию", licenseFormHtml());
  const form = document.getElementById("license-form");
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      const created = await api.createLicense(state.token, {
        user_type: form.user_type.value,
        email: form.email.value.trim() || null,
        license_days: Number(form.license_days.value),
      });
      render.closeModal();
      // product_key больше нигде не показывается — единственный момент его увидеть,
      // поэтому отдельная модалка с кнопкой копирования, а не alert().
      render.showProductKey(created.product_key);
      await loadLicenses();
    } catch (err) {
      render.toast(err instanceof api.ApiError ? err.message : "Не удалось создать лицензию", "error");
    }
  });
}

export async function extendLicenseById(userId) {
  try {
    await api.extendLicense(state.token, userId, 30);
    await loadLicenses();
  } catch (err) {
    render.toast(err instanceof api.ApiError ? err.message : "Не удалось продлить лицензию", "error");
  }
}

export async function toggleBlockLicense(userId, currentlyBlocked) {
  try {
    if (currentlyBlocked) await api.unblockLicense(state.token, userId);
    else await api.blockLicense(state.token, userId);
    await loadLicenses();
  } catch (err) {
    render.toast(err instanceof api.ApiError ? err.message : "Не удалось изменить статус лицензии", "error");
  }
}


export async function resetDeviceById(userId) {
  const ok = await render.confirmDialog({ title: "Сбросить устройство?", text: "Пользователь сможет войти с нового устройства.", confirmLabel: "Сбросить", cancelLabel: "Отмена", danger: true });
  if (!ok) return;
  try { await api.resetDevice(state.token, userId); render.toast("Устройство сброшено", "success"); }
  catch (err) { render.toast(err instanceof api.ApiError ? err.message : "Не удалось сбросить устройство", "error"); }
}

export async function deleteLicenseById(userId) {
  const ok = await render.confirmDialog({ title: "Удалить пользователя?", text: "Необратимо: product key перестанет работать, доступ будет отозван немедленно.", confirmLabel: "Удалить", cancelLabel: "Отмена", danger: true });
  if (!ok) return;
  try { await api.deleteLicense(state.token, userId); render.toast("Пользователь удалён", "success"); await loadLicenses(); }
  catch (err) { render.toast(err instanceof api.ApiError ? err.message : "Не удалось удалить пользователя", "error"); }
}
