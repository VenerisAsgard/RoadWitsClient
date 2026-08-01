/**
 * Всё, чем пользователь управляет интерфейсом руками: клавиатура, мышь/тач,
 * форматирование поля Product Key. Сама бизнес-логика — в quiz.js/admin.js,
 * здесь только "какая клавиша/клик что вызывает".
 */
import { state } from "./state.js";
import * as render from "./render.js";
import * as quiz from "./quiz.js";
import * as admin from "./admin.js";
import * as device from "./device.js";

/* ============================================================
   КЛАВИАТУРА — единый обработчик для всей навигации по приложению.
   ============================================================ */

export function initKeyboardControls() {
  document.addEventListener("keydown", (e) => {
    // Пока не вошли — ничего не перехватываем, чтобы форма логина сама
    // обработала Enter как обычный submit.
    if (!render.$("login-view").classList.contains("hidden")) return;

    // Увеличенная картинка перекрывает всё: любая клавиша выхода
    // закрывает её и ничего больше не делает.
    if (render.isImageViewerOpen()) {
      if (e.key === "Escape" || e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        render.closeImageViewer();
      }
      return;
    }

    // Модалка (формы редактирования / confirmDialog) — Esc закрывает её и
    // ничего больше, независимо от того, какой экран под ней. Enter, если
    // в модалке есть кнопка подтверждения (confirmDialog, не форма с своим
    // submit-ом), нажимает её — формы редактирования сабмитятся сами по Enter
    // штатным поведением браузера, туда не лезем.
    if (render.isModalOpen()) {
      if (e.key === "Escape") {
        e.preventDefault();
        render.closeModal();
      } else if (e.key === "Enter") {
        const confirmBtn = document.querySelector('#modal-body [data-resolve="confirm"]');
        if (confirmBtn) {
          e.preventDefault();
          confirmBtn.click();
        }
      }
      return;
    }

    const key = e.key;

    switch (state.screen) {
      case "menu": {
        if (/^[1-9]$/.test(key)) {
          e.preventDefault();
          quiz.menuDigit(Number(key));
        } else if (key === "ArrowUp") {
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
        } else if (key === " ") {
          // Space — отметить/снять отметку текущей главы (мультивыбор),
          // не подтверждение — иначе нечем было бы отдельно "начать".
          e.preventDefault();
          quiz.toggleChapterCheck(state.chapters[state.chapterIndex]);
        } else if (key === "Enter") {
          e.preventDefault();
          quiz.chaptersConfirm();
        } else if (key === "Escape") {
          e.preventDefault();
          quiz.returnToMenu();
        }
        break;
      }

      case "random-count": {
        if (key === "ArrowUp") {
          e.preventDefault();
          quiz.randomCountMove(-1);
        } else if (key === "ArrowDown") {
          e.preventDefault();
          quiz.randomCountMove(1);
        } else if (key === "Enter") {
          e.preventDefault();
          quiz.randomCountConfirm();
        } else if (key === "Escape") {
          e.preventDefault();
          quiz.returnToMenu();
        }
        break;
      }

      case "question": {
        if (key === "ArrowUp") {
          e.preventDefault();
          quiz.answerMove(-1);
        } else if (key === "ArrowDown") {
          e.preventDefault();
          quiz.answerMove(1);
        } else if (/^[1-9]$/.test(key)) {
          e.preventDefault();
          quiz.pressDigit(Number(key));
        } else if (key === "Enter") {
          e.preventDefault();
          quiz.confirmPendingOrAdvance();
        } else if (key === " ") {
          e.preventDefault();
          quiz.skipQuestion();
        } else if (key === "ArrowRight") {
          e.preventDefault();
          quiz.questionNext();
        } else if (key === "ArrowLeft" || key === "Backspace") {
          e.preventDefault();
          quiz.questionPrev();
        } else if (key === "Escape") {
          e.preventDefault();
          quiz.requestExit(); // тематическая модалка подтверждения, не браузерный confirm()
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
          quiz.retryQuiz();
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

  /* ---------- кнопки "назад" — то же самое, что Esc, но не все хотят
     помнить про Esc, особенно на тач-устройствах ---------- */
  render.$("chapters-back-btn").addEventListener("click", () => {
    quiz.returnToMenu();
  });
  render.$("random-count-back-btn").addEventListener("click", () => {
    quiz.returnToMenu();
  });

  /* ---------- главы: чекбокс (мультивыбор) / выбор строки / ✏️ / ❌ ---------- */
  render.$("chapter-list").addEventListener("click", (e) => {
    const li = e.target.closest(".chapter-item");
    if (!li) return;
    const index = Number(li.dataset.index);

    if (e.target.closest('[data-role="checkbox"]')) {
      quiz.toggleChapterCheck(state.chapters[index]);
      return;
    }

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

  /* ---------- выбор количества вопросов для случайного билета ---------- */
  render.$("random-count-list").addEventListener("click", (e) => {
    const li = e.target.closest(".menu-item");
    if (!li) return;
    state.randomCountIndex = Number(li.dataset.index);
    quiz.randomCountConfirm();
  });

  /* ---------- вопрос (прохождение теста) ---------- */
  render.$("q-options").addEventListener("click", (e) => {
    const li = e.target.closest(".q-option");
    if (!li) return;
    // Клик мышью — уже однозначное, осознанное действие: фиксирует ответ
    // сразу, без промежуточного "выделить, потом подтвердить" как с клавиатуры.
    quiz.selectOptionByClick(Number(li.dataset.index));
  });
  // Клик по иллюстрации — показать её во весь экран.
  render.$("q-image-wrap").addEventListener("click", () => {
    render.openImageViewer(render.$("q-image").getAttribute("src"));
  });
  render.$("image-viewer").addEventListener("click", () => render.closeImageViewer());
  render.$("q-btn-finish").addEventListener("click", () => quiz.finishQuiz());
  render.$("q-dots").addEventListener("click", (e) => {
    const dot = e.target.closest(".q-dot");
    if (!dot) return;
    quiz.jumpToQuestion(Number(dot.dataset.index));
  });

  render.$("review-grid").addEventListener("click", (e) => {
    const sq = e.target.closest(".review-square");
    if (!sq) return;
    quiz.reviewJumpTo(Number(sq.dataset.index));
  });

  /* ---------- результат ---------- */
  render.$("result-retry-btn").addEventListener("click", () => quiz.retryQuiz());
  render.$("result-menu-btn").addEventListener("click", () => quiz.returnToMenu());

  /* ---------- профиль: панель администрирования (только admin) ---------- */
  render.$("profile-card").addEventListener("click", async (e) => {
    if (e.target.closest("#devtools-open-btn") && state.user?.user_type === "admin") {
      device.openDevtools();
      return;
    }
    if (e.target.closest(".friend-remove-btn")) {
      const email = e.target.closest(".friend-remove-btn").dataset.email;
      const settings = { ...(state.user.settings || {}) };
      settings.friend_emails = (settings.friend_emails || []).filter((x) => x !== email);
      try { const api = await import("./api.js"); state.user.settings = settings; await api.updateSettings(state.token, settings); render.renderProfile(state.user); render.toast("Друг удалён", "success"); }
      catch { render.toast("Не удалось сохранить настройки", "error"); }
      return;
    }
    if (e.target.closest("#profile-friend-add-btn")) {
      const input = render.$("profile-friend-email");
      const email = (input.value || "").trim().toLowerCase();
      const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
      if (!emailOk) { render.toast("Введите корректный email", "error"); return; }
      const settings = { ...(state.user.settings || {}) };
      const list = new Set(settings.friend_emails || []);
      if (list.has(email)) { render.toast("Этот друг уже добавлен", "error"); return; }
      list.add(email);
      settings.friend_emails = Array.from(list);
      try { const api = await import("./api.js"); state.user.settings = settings; await api.updateSettings(state.token, settings); input.value = ""; render.renderProfile(state.user); render.toast("Друг добавлен", "success"); }
      catch { render.toast("Не удалось сохранить настройки", "error"); }
      return;
    }
    if (e.target.closest("#profile-settings-save")) {
      const file = render.$("profile-photo").files[0];
      let photo = state.user?.settings?.profile_photo || null;
      if (file) {
        const img = new Image();
        const url = URL.createObjectURL(file);
        await new Promise((resolve) => { img.onload = resolve; img.src = url; });
        URL.revokeObjectURL(url);
        if (img.width > 1024 || img.height > 1024) { render.toast("Фото должно быть максимум 1024×1024", "error"); return; }
        const reader = new FileReader();
        photo = await new Promise((resolve, reject) => { reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(file); });
      }
      const settings = { ...(state.user.settings || {}), theme: render.$("profile-theme").value, profile_photo: photo };
      try { const api = await import("./api.js"); state.user.settings = settings; await api.updateSettings(state.token, settings); render.applyTheme(); render.renderAccountChip(state.user); render.toast("Настройки сохранены", "success"); }
      catch { render.toast("Не удалось сохранить настройки", "error"); }
      return;
    }
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
    } else if (action === "license-reset-device") {
      admin.resetDeviceById(userId);
    }
  });

  /* ---------- модалка: крестик, кнопки "Отмена" внутри форм ---------- */
  render.$("modal-close-btn").addEventListener("click", () => render.closeModal());
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
