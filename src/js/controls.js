/**
 * Всё, чем пользователь управляет интерфейсом руками: клавиатура, мышь/тач,
 * форматирование поля Product Key. Сама бизнес-логика — в quiz.js/admin.js,
 * здесь только "какая клавиша/клик что вызывает".
 */
import { state } from "./state.js";
import * as render from "./render.js";
import * as quiz from "./quiz.js";
import * as admin from "./admin.js";

/* ============================================================
   КЛАВИАТУРА — единый обработчик для всей навигации по приложению.
   ============================================================ */

function armEscape(message) {
  state.escArmed = true;
  render.setHint(message);
  clearTimeout(state.escTimeout);
  state.escTimeout = setTimeout(() => {
    state.escArmed = false;
    if (state.screen === "question") {
      render.setHint("1-4 ответить · Space/Enter далее · ←назад · Esc выйти");
    }
  }, 2200);
}

export function initKeyboardControls() {
  document.addEventListener("keydown", (e) => {
    // Пока не вошли — ничего не перехватываем, чтобы форма логина сама
    // обработала Enter как обычный submit.
    if (!render.$("login-view").classList.contains("hidden")) return;

    // Модалка (формы редактирования) — Esc закрывает её и ничего больше,
    // независимо от того, какой экран под ней. Проверяем это раньше
    // основного switch, чтобы не закрыть заодно ещё что-то за компанию.
    if (render.isModalOpen()) {
      if (e.key === "Escape") {
        e.preventDefault();
        render.closeModal();
      }
      return;
    }

    const key = e.key;
    if (key !== "Escape") state.escArmed = false;

    switch (state.screen) {
      case "menu": {
        if (key === "ArrowUp") {
          e.preventDefault();
          quiz.menuMove(-1);
        } else if (key === "ArrowDown") {
          e.preventDefault();
          quiz.menuMove(1);
        } else if (key === "Enter") {
          e.preventDefault();
          quiz.menuConfirm();
        }
        break;
      }

      case "chapters": {
        if (key === "ArrowUp") {
          e.preventDefault();
          quiz.chaptersMove(-1);
        } else if (key === "ArrowDown") {
          e.preventDefault();
          quiz.chaptersMove(1);
        } else if (key === "Enter") {
          e.preventDefault();
          quiz.chaptersConfirm();
        } else if (key === "Escape") {
          e.preventDefault();
          quiz.returnToMenu();
        }
        break;
      }

      case "question": {
        if (/^[1-9]$/.test(key)) {
          e.preventDefault();
          quiz.pressDigit(Number(key));
        } else if (key === " " || key === "Enter" || key === "ArrowRight") {
          e.preventDefault();
          quiz.confirmPendingOrAdvance();
        } else if (key === "ArrowLeft" || key === "Backspace") {
          e.preventDefault();
          quiz.questionPrev();
        } else if (key === "Escape") {
          e.preventDefault();
          if (state.escArmed) {
            quiz.returnToMenu();
          } else {
            armEscape("Esc ещё раз — выйти без сохранения результата");
          }
        }
        break;
      }

      case "result": {
        if (key === "ArrowUp") {
          e.preventDefault();
          quiz.reviewMove(-1);
        } else if (key === "ArrowDown") {
          e.preventDefault();
          quiz.reviewMove(1);
        } else if (key === "Enter") {
          e.preventDefault();
          if (state.mode === "chapter") {
            const c = state.chapters.find((x) => x.id === state.chapterId);
            quiz.beginQuiz("chapter", c);
          } else {
            quiz.beginQuiz(state.mode);
          }
        } else if (key === "Escape") {
          e.preventDefault();
          quiz.returnToMenu();
        }
        break;
      }

      case "profile": {
        if (key === "Escape") {
          e.preventDefault();
          quiz.closeProfile();
        }
        break;
      }
    }
  });
}

/* ============================================================
   МЫШЬ / ТАЧ — делегирование на стабильных родителях, т.к. сами
   списки перерисовываются целиком (innerHTML) при каждом изменении.
   ============================================================ */

export function initMouseControls() {
  render.$("menu-list").addEventListener("click", (e) => {
    const li = e.target.closest(".menu-item");
    if (!li) return;
    state.menuIndex = Number(li.dataset.index);
    quiz.menuConfirm();
  });

  /* ---------- аватар в титлбаре -> профиль ---------- */
  render.$("account-chip").addEventListener("click", () => {
    quiz.openProfile();
  });
  render.$("profile-back-btn").addEventListener("click", () => {
    quiz.closeProfile();
  });

  /* ---------- главы: выбор строки + кнопки ✏️/❌ на ней ---------- */
  render.$("chapter-list").addEventListener("click", (e) => {
    const li = e.target.closest(".chapter-item");
    if (!li) return;
    const index = Number(li.dataset.index);
    const actionBtn = e.target.closest("[data-action]");

    if (actionBtn) {
      // Кнопка могла быть на НЕ активной строке — сперва выбираем её главу,
      // чтобы admin.js (который смотрит на state.chapterIndex) работал с той
      // главой, по которой реально кликнули, а не с прежде активной.
      state.chapterIndex = index;
      const action = actionBtn.dataset.action;
      if (action === "rename-chapter") admin.promptRenameChapter();
      else if (action === "delete-chapter") admin.confirmDeleteChapter();
      return;
    }

    // Обычный клик по строке — это выбор (аналог стрелок), не старт:
    // глава может быть пустой, плюс так можно просто посмотреть детали.
    // Старт — отдельная кнопка в detail-панели.
    state.chapterIndex = index;
    render.renderChapters();
    admin.refreshEditorQuestions();
  });

  /* ---------- тулбар над списком глав: добавить / режим редактирования ---------- */
  render.$("chapter-add-btn").addEventListener("click", () => {
    admin.promptCreateChapter();
  });
  render.$("chapters-edit-toggle").addEventListener("click", () => {
    admin.toggleEditMode();
  });

  /* ---------- деталь главы: старт тренировки + управление вопросами ---------- */
  render.$("chapter-detail").addEventListener("click", (e) => {
    if (e.target.closest("#chapter-start-btn")) {
      quiz.chaptersConfirm();
      return;
    }
    if (e.target.closest("#question-add-btn")) {
      admin.promptCreateQuestion();
      return;
    }
    const item = e.target.closest(".editor-question-item");
    if (!item) return;
    const questionId = Number(item.dataset.id);
    const action = e.target.closest("[data-action]")?.dataset.action;
    if (action === "edit-question") admin.promptEditQuestion(questionId);
    else if (action === "delete-question") admin.confirmDeleteQuestion(questionId);
  });

  /* ---------- вопрос (прохождение теста) ---------- */
  render.$("q-options").addEventListener("click", (e) => {
    const li = e.target.closest(".q-option");
    if (!li) return;
    // Клик мышью — уже однозначное, осознанное действие: фиксирует ответ
    // сразу, без промежуточного "выделить, потом подтвердить" как с клавиатуры.
    quiz.selectOptionByClick(Number(li.dataset.index));
  });

  render.$("review-list").addEventListener("click", (e) => {
    const item = e.target.closest(".review-item");
    if (!item) return;
    quiz.reviewJumpTo(Number(item.dataset.index));
  });

  /* ---------- профиль: панель администрирования (только admin) ---------- */
  render.$("profile-card").addEventListener("click", (e) => {
    if (e.target.closest("#license-add-btn")) {
      admin.promptCreateLicense();
      return;
    }
    const row = e.target.closest(".license-row");
    if (!row) return;
    const userId = Number(row.dataset.id);
    const action = e.target.closest("[data-action]")?.dataset.action;
    if (action === "license-extend") admin.extendLicenseById(userId);
    else if (action === "license-toggle-block") {
      admin.toggleBlockLicense(userId, row.classList.contains("blocked"));
    }
  });

  /* ---------- модалка: крестик, клик по фону, кнопки "Отмена" внутри форм ---------- */
  render.$("modal-close-btn").addEventListener("click", () => render.closeModal());
  render.$("modal-overlay").addEventListener("click", (e) => {
    if (e.target.id === "modal-overlay") render.closeModal();
  });
  render.$("modal-body").addEventListener("click", (e) => {
    if (e.target.closest('[data-action="modal-cancel"]')) render.closeModal();
  });
}

/* ============================================================
   Маска ввода Product Key: AAAAAA_BBBBBB_CCCCCC_DDDDDD
   ============================================================ */

export function initProductKeyFormatting() {
  const input = render.$("product-key");
  input.maxLength = 27; // 24 символа + 3 разделителя

  input.addEventListener("input", () => {
    const value = input.value.toUpperCase().replace(/[^A-Z0-9]/g, "");
    const groups = [];
    for (let i = 0; i < value.length; i += 6) {
      groups.push(value.substring(i, i + 6));
    }
    input.value = groups.join("_");
  });
}
