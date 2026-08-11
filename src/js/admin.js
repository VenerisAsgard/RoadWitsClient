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
import * as cache from "./cache.js";
import { loadChapterQuestions } from "./questions.js";

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
  // Дисковый кэш вопросов по главам (js/cache.js) тоже мог устареть —
  // сбрасываем целиком, а не только для текущей главы: правка идёт через
  // эту же функцию для создания/правки/удаления и вопросов, и глав.
  cache.clearAll();
  questionIndex = null; // индекс для поиска/проверки на дубликат построен на старых данных
  render.renderMenuMeta();
  render.renderChapters(); // это же перерисует и деталь + пустой список вопросов
  await refreshEditorQuestions();
}

function chapterFormHtml(chapter) {
  // Описание теперь редактируется точно так же, как при создании —
  // и для новой главы, и для существующей это одно и то же поле формы.
  return `
    <form id="chapter-form">
      <label>Название
        <input name="title" required value="${escapeAttr(chapter?.title ?? "")}" />
      </label>
      <label>Описание<textarea name="description" rows="3">${escapeHtml(chapter?.description ?? "")}</textarea></label>
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
    const description = form.description.value.trim();
    try {
      if (chapter) {
        try {
          await api.updateChapter(state.token, chapter.id, { title, description });
        } catch (err) {
          // Роль editor: бэкенд разрешает менять только title (см. api.js) —
          // если запрос с description отклонён именно поэтому, тихо
          // повторяем без него, чтобы хотя бы название сохранилось.
          if (err instanceof api.ApiError && err.status === 403) {
            await api.updateChapterTitle(state.token, chapter.id, title);
            render.toast("Название сохранено, описание может менять только администратор", "info");
          } else {
            throw err;
          }
        }
      } else {
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
    // Через общий кэш-загрузчик (см. questions.js), не напрямую api — так
    // список глав в редакторе тоже читается из дискового кэша (быстрее при
    // повторных заходах) и доступен офлайн, а не только пул для теста.
    state.editorQuestions = await loadChapterQuestions(chapter.id);
    render.renderEditorQuestionList(state.editorQuestions);
  } catch {
    state.editorQuestions = [];
  }
}

/* ============================================================
   ПОИСК ВОПРОСА ПО ВСЕМ ГЛАВАМ / ПРОВЕРКА НА ДУБЛИКАТ

   Общая идея: у editor/admin со временем база вопросов растёт, и перед
   тем как добавить новый, полезно быстро проверить — а нет ли уже такого
   же (или почти такого же) в какой-то из глав. questionIndex — вопросы
   всех глав разом (через кэш-загрузчик из questions.js, поэтому после
   первого построения почти всегда мгновенно), используется и поиском
   (openQuestionSearch), и предупреждением о дубликате в форме создания
   вопроса (wireQuestionForm → checkDuplicates).
   ============================================================ */

let questionIndex = null; // { [chapterId]: Question[] } | null

async function buildQuestionIndex() {
  if (questionIndex) return questionIndex;
  const entries = await Promise.all(
    state.chapters.map(async (c) => [c.id, await loadChapterQuestions(c.id).catch(() => [])]),
  );
  questionIndex = Object.fromEntries(entries);
  return questionIndex;
}

/** Нормализация текста для сравнения: регистр, "ё"→"е", знаки препинания
 * и лишние пробелы не должны мешать считать два вопроса одинаковыми. */
function normalizeQuestionText(text) {
  return String(text ?? "")
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function wordSet(text) {
  return new Set(normalizeQuestionText(text).split(" ").filter(Boolean));
}

/** Похожесть двух множеств слов (0..1) — доля общих слов от объединения. */
function jaccard(a, b) {
  if (!a.size && !b.size) return 0;
  let intersection = 0;
  for (const w of a) if (b.has(w)) intersection++;
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/**
 * Ищет вопросы, похожие на text, по уже построенному индексу.
 * threshold — минимальная похожесть слов, чтобы попасть в выдачу (не
 * считая точных/строковых совпадений — те попадают всегда).
 */
function findSimilarQuestions(index, text, { threshold = 0.5, excludeId = null, limit = 10 } = {}) {
  const norm = normalizeQuestionText(text);
  if (norm.length < 2) return [];
  const words = wordSet(text);

  const results = [];
  for (const chapter of state.chapters) {
    const list = index[chapter.id] || [];
    for (const q of list) {
      if (excludeId && q.id === excludeId) continue;
      const qNorm = normalizeQuestionText(q.text);
      const exact = qNorm === norm;
      const substring = !exact && qNorm.length > 0 && (qNorm.includes(norm) || norm.includes(qNorm));
      const score = exact ? 1 : jaccard(words, wordSet(q.text));
      if (exact || substring || score >= threshold) {
        results.push({
          question: q,
          chapter,
          exact,
          score: exact ? 1 : substring ? Math.max(score, 0.5) : score,
        });
      }
    }
  }
  results.sort((a, b) => b.score - a.score);
  return results.slice(0, limit);
}

function questionSearchHtml() {
  return `
    <div class="question-search">
      <input
        type="text"
        id="question-search-input"
        placeholder="Начни вводить текст вопроса…"
        autocomplete="off"
      />
      <ul class="question-search-results" id="question-search-results">
        <li class="modal-hint">Введите хотя бы пару слов из вопроса.</li>
      </ul>
    </div>
  `;
}

/** Поиск вопроса по всем главам сразу — доступно только editor/admin
 * (кнопка 🔍 над списком глав, см. render.renderChaptersToolbar). */
export async function openQuestionSearch() {
  if (!canEditContent()) return;
  render.openModal("Поиск вопроса", questionSearchHtml());

  const input = document.getElementById("question-search-input");
  const results = document.getElementById("question-search-results");
  input.focus();

  // Строим индекс заранее (не дожидаясь первого ввода) — на нормальной базе
  // вопросов это доли секунды за счёт кэша, но лучше не тратить их именно
  // на первый набранный символ.
  const indexPromise = buildQuestionIndex();

  let timer = null;
  input.addEventListener("input", () => {
    clearTimeout(timer);
    const query = input.value.trim();
    if (query.length < 2) {
      results.innerHTML = `<li class="modal-hint">Введите хотя бы пару слов из вопроса.</li>`;
      return;
    }
    timer = setTimeout(async () => {
      const index = await indexPromise;
      const found = findSimilarQuestions(index, query, { threshold: 0.3, limit: 20 });
      if (!found.length) {
        results.innerHTML = `<li class="modal-hint">Совпадений не найдено.</li>`;
        return;
      }
      results.innerHTML = found
        .map(
          (r) => `
            <li class="question-search-item">
              <span class="qs-chapter">${escapeHtml(r.chapter.title)}</span>
              <span class="qs-text">${escapeHtml(r.question.text)}</span>
              <span class="qs-badge${r.exact ? " exact" : ""}">${r.exact ? "точное совпадение" : `~${Math.round(r.score * 100)}%`}</span>
            </li>
          `,
        )
        .join("");
    }, 200);
  });
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
      <div class="question-dup-warning hidden" id="question-dup-warning"></div>
      <label>Подсказка (необязательно)<textarea name="hint" rows="2">${escapeHtml(question?.explanation ?? "")}</textarea></label>
      <label>Фото (необязательно)<input type="file" name="image" accept="image/*" /></label>
      ${question?.image ? `<p class="modal-hint">Текущее фото сохранится, если не выбрать новое.</p>` : ""}
      <p class="modal-hint">Отметь один правильный вариант слева от него.</p>
      <div class="answers-editor" id="answers-editor">${rows}</div>
      <button type="button" class="ghost small" data-action="add-answer-row">+ вариант ответа</button>
      <div class="modal-actions">
        <button type="button" class="ghost" data-action="toggle-preview">👁 Предпросмотр</button>
        <span class="modal-actions-spacer"></span>
        <button type="button" class="ghost" data-action="modal-cancel">Отмена</button>
        <button type="submit">${question ? "Сохранить" : "Создать"}</button>
      </div>
      <div class="question-preview hidden" id="question-preview">
        <p class="modal-hint">Так вопрос увидит проходящий тест:</p>
        <div class="q-image-wrap qp-image-wrap hidden" id="qp-image-wrap">
          <img id="qp-image" alt="Иллюстрация к вопросу" />
        </div>
        <p class="q-text" id="qp-text"></p>
        <ul class="q-options" id="qp-options"></ul>
        <p class="q-explain hidden" id="qp-explain"></p>
      </div>
    </form>
  `;
}

function wireQuestionForm(question) {
  const form = document.getElementById("question-form");
  const editor = document.getElementById("answers-editor");
  const dupWarning = document.getElementById("question-dup-warning");
  const previewBtn = form.querySelector('[data-action="toggle-preview"]');
  const previewBox = document.getElementById("question-preview");
  let previewOn = false;

  // Предупреждение о дубликате — не блокирует создание/сохранение (иногда
  // похожий вопрос — не ошибка, а нормальная переформулировка), просто
  // подсказывает, что стоит проверить, прежде чем плодить копии.
  let dupTimer = null;
  async function checkDuplicates() {
    const text = form.text.value.trim();
    if (text.length < 4) {
      dupWarning.classList.add("hidden");
      return;
    }
    const index = await buildQuestionIndex();
    const found = findSimilarQuestions(index, text, { threshold: 0.6, excludeId: question?.id, limit: 3 });
    if (!found.length) {
      dupWarning.classList.add("hidden");
      return;
    }
    const top = found[0];
    const label = top.exact ? "Точно такой же вопрос уже есть" : "Похожий вопрос уже есть";
    const more = found.length > 1 ? ` (и ещё ${found.length - 1})` : "";
    dupWarning.innerHTML = `⚠️ ${label} в главе «${escapeHtml(top.chapter.title)}»${more}:<br />«${escapeHtml(top.question.text)}»`;
    dupWarning.classList.remove("hidden");
  }
  form.text.addEventListener("input", () => {
    clearTimeout(dupTimer);
    dupTimer = setTimeout(checkDuplicates, 350);
  });
  checkDuplicates(); // и сразу при открытии формы, не только по вводу

  function updatePreview() {
    if (!previewOn) return;

    const text = form.text.value.trim();
    document.getElementById("qp-text").textContent = text || "Текст вопроса появится здесь…";

    const hint = form.hint.value.trim();
    const explainEl = document.getElementById("qp-explain");
    explainEl.textContent = hint;
    explainEl.classList.toggle("hidden", !hint);

    const rows = [...editor.querySelectorAll(".answer-row")];
    const optsWrap = document.getElementById("qp-options");
    optsWrap.innerHTML = "";
    rows.forEach((row, i) => {
      const optText = row.querySelector(".answer-text").value.trim() || `Вариант ${i + 1}`;
      const correct = row.querySelector('input[type="radio"]').checked;
      const li = document.createElement("li");
      // Те же классы, что renderQuestion() ставит на реальном экране
      // вопроса (см. render.js) — правильный вариант подсвечивается
      // ровно так же, без дублирования стилей под превью.
      li.className = "q-option" + (correct ? " correct" : "");
      li.innerHTML = `<span class="o-key">${i + 1}</span><span>${escapeHtml(optText)}</span>`;
      optsWrap.appendChild(li);
    });

    const imgWrap = document.getElementById("qp-image-wrap");
    const imgEl = document.getElementById("qp-image");
    const file = form.image.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = () => {
        imgEl.src = String(reader.result);
        imgWrap.classList.remove("hidden");
      };
      reader.readAsDataURL(file);
    } else if (question?.image) {
      imgEl.src = question.image;
      imgWrap.classList.remove("hidden");
    } else {
      imgWrap.classList.add("hidden");
      imgEl.removeAttribute("src");
    }
  }

  // Делегируем на самой форме, а не на #modal-body: modal-body живёт в
  // разметке постоянно, поэтому обработчик на нём накапливался с каждым
  // открытием формы. На третий раз одна кнопка добавляла три варианта
  // ответа сразу. Форма создаётся заново при каждом открытии модалки,
  // и её обработчики умирают вместе с ней.
  form.addEventListener("click", (e) => {
    if (e.target.closest('[data-action="add-answer-row"]')) {
      editor.insertAdjacentHTML("beforeend", answerRowHtml("", false));
      updatePreview();
    } else if (e.target.closest('[data-action="remove-answer-row"]')) {
      // Бэкенд требует минимум 2 варианта — не даём удалить ниже этого порога.
      if (editor.children.length > 2) e.target.closest(".answer-row").remove();
      updatePreview();
    } else if (e.target.closest('[data-action="toggle-preview"]')) {
      previewOn = !previewOn;
      previewBox.classList.toggle("hidden", !previewOn);
      previewBtn.textContent = previewOn ? "🙈 Скрыть предпросмотр" : "👁 Предпросмотр";
      updatePreview();
    }
  });

  // input — на текст/подсказку/варианты ответа, change — на радио и файл.
  form.addEventListener("input", updatePreview);
  form.addEventListener("change", updatePreview);

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

/** Применяет текущие поиск (state.licenseFilter) и сортировку
 * (state.licenseSort) к сырому списку с бэкенда — обе чисто клиентские,
 * повторный запрос к серверу не нужен ни при вводе в поиск, ни при
 * клике по заголовку столбца, см. setLicenseFilter/setLicenseSort. */
function visibleLicenses() {
  const q = state.licenseFilter.trim().toLowerCase();
  let list = state.licenses;
  if (q) {
    list = list.filter((lic) =>
      [lic.product_key, lic.email, lic.first_name, lic.last_name]
        .filter(Boolean)
        .some((field) => String(field).toLowerCase().includes(q)),
    );
  }

  const { field, dir } = state.licenseSort;
  const sign = dir === "asc" ? 1 : -1;
  return [...list].sort((a, b) => {
    let av = a[field];
    let bv = b[field];
    if (field === "is_blocked") { av = av ? 1 : 0; bv = bv ? 1 : 0; }
    if (av == null) av = "";
    if (bv == null) bv = "";
    if (typeof av === "string") av = av.toLowerCase();
    if (typeof bv === "string") bv = bv.toLowerCase();
    if (av < bv) return -1 * sign;
    if (av > bv) return 1 * sign;
    return 0;
  });
}

export async function loadLicenses() {
  // Плейсхолдер "Загрузка лицензий…" уже стоит статикой в разметке
  // (index.html #admin-table-wrap) — ничего туда не рендерим до ответа
  // сервера, иначе на секунду мелькнёт "Лицензий пока нет".
  try {
    state.licenses = await api.listLicenses(state.token);
    render.renderLicenseList(visibleLicenses());
  } catch (err) {
    state.licenses = [];
    render.toast(err instanceof api.ApiError ? err.message : "Не удалось загрузить список лицензий", "error");
    render.renderLicenseList([]);
  }
}

/** Поиск по ключу/email/имени — вызывается на каждый ввод в поле поиска
 * (см. controls.js), сравнивается со state.licenseFilter, чтобы её же
 * (пустую строку) отличать в render.js от "искали — ничего не нашли". */
export function setLicenseFilter(text) {
  state.licenseFilter = text;
  render.renderLicenseList(visibleLicenses());
}

/** Клик по заголовку столбца: тот же столбец — разворачиваем направление,
 * другой — сортируем по нему по возрастанию. */
export function setLicenseSort(field) {
  if (state.licenseSort.field === field) {
    state.licenseSort = { field, dir: state.licenseSort.dir === "asc" ? "desc" : "asc" };
  } else {
    state.licenseSort = { field, dir: "asc" };
  }
  render.renderLicenseList(visibleLicenses());
}

export async function copyLicenseKey(productKey) {
  try {
    await navigator.clipboard.writeText(productKey);
    render.toast("Ключ скопирован", "success");
  } catch {
    render.toast("Не удалось скопировать — скопируйте вручную", "error");
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
