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
import * as friends from "./friends.js";
import * as api from "./api.js";

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
          // Если включён режим редактирования (виден ✏️/❌ у глав) — первый
          // Esc просто выключает его, а не сразу выкидывает в меню; так
          // человек не теряет место в списке, случайно нажав Esc посреди
          // редактирования. Второй Esc (когда editMode уже выключен) —
          // как и раньше, уходит в меню.
          if (state.editMode) {
            admin.toggleEditMode();
          } else {
            quiz.returnToMenu();
          }
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
          exitProfile();
        }
        break;
      }
    }
  });
}

/* ============================================================
   ПРОФИЛЬ — автосохранение вместо кнопок:
   - имя/фамилия/email сохраняются при выходе из профиля (если менялись);
   - фото сохраняется сразу при выборе файла (клик по аватарке-кружку);
   - тема сохраняется сразу при переключении свича.
   Все три — через PATCH /auth/me/profile или /auth/me/settings, без
   отдельного "Сохранить" — см. запрос убрать кнопки сохранения.
   ============================================================ */

/** Файл -> сжатый data URL, готовый под аватарку: центр-кроп в квадрат,
 * уменьшение до AVATAR_SIZE и JPEG-компрессия. Раньше здесь просто
 * ОТКЛОНЯЛИ фото крупнее 1024×1024 без какого-либо сжатия — из-за этого
 * а) обычное фото с телефона (обычно 3000–4000px) отклонялось с ошибкой
 * "должно быть максимум 1024×1024", хотя пользователь никак не мог
 * заранее знать точный размер в пикселях; б) даже те фото, что проходили
 * проверку по габаритам, в PNG/с большим количеством деталей легко
 * весили больше 1.5–2 МБ в base64 и всё равно падали на сервере с
 * ошибкой "слишком большое". Теперь любое фото приводится к одному
 * небольшому квадратному JPEG — ограничение по размеру на сервере
 * (см. schemas/auth.py) с огромным запасом никогда не будет достигнуто. */
const AVATAR_SIZE = 480;
const AVATAR_JPEG_QUALITY = 0.85;
// Тот же лимит, что и на бэкенде для profile_photo (см. MAX_PROFILE_PHOTO_LENGTH
// в schemas/auth.py) — длина итоговой data URL строки, с запасом на "data:...;base64,".
const MAX_PHOTO_DATA_URL_LENGTH = 2_000_000;

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Не удалось прочитать файл"));
    reader.readAsDataURL(file);
  });
}

/** Файл -> data URL, готовый под аватарку.
 * GIF — особый случай: раньше ЛЮБОЕ фото (в т.ч. GIF) прогонялось через
 * canvas.toDataURL("image/jpeg", ...), а canvas умеет нарисовать только
 * один кадр — анимация схлопывалась в статичную картинку. Для GIF отдаем
 * файл как есть (без кропа/сжатия, которые все равно её потушат), просто
 * проверив, что он укладывается в лимит размера, который иначе проверял
 * бы только сервер уже после загрузки. Остальные форматы, как и раньше,
 * приводятся к квадратному JPEG нужного размера. */
async function readPhotoAsDataUrl(file) {
  if (file.type === "image/gif") {
    const dataUrl = await readFileAsDataUrl(file);
    if (dataUrl.length > MAX_PHOTO_DATA_URL_LENGTH) {
      throw new Error("GIF слишком большой — попробуйте картинку поменьше (или другой формат)");
    }
    return dataUrl;
  }

  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      try {
        const side = Math.min(img.width, img.height);
        const sx = (img.width - side) / 2;
        const sy = (img.height - side) / 2;

        const canvas = document.createElement("canvas");
        canvas.width = AVATAR_SIZE;
        canvas.height = AVATAR_SIZE;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, sx, sy, side, side, 0, 0, AVATAR_SIZE, AVATAR_SIZE);
        resolve(canvas.toDataURL("image/jpeg", AVATAR_JPEG_QUALITY));
      } catch {
        reject(new Error("Не удалось обработать фото"));
      }
    };
    img.onerror = () => { URL.revokeObjectURL(objectUrl); reject(new Error("Файл не похож на изображение")); };
    img.src = objectUrl;
  });
}

/** Сохраняет имя/фамилию/email, если они реально изменились с момента
 * открытия профиля — вызывается при выходе из профиля (кнопка "Назад"/Esc).
 * Тихо, без тоста об успехе — тост только если сохранение не удалось,
 * чтобы не терять правку молча. */
async function savePersonalDataIfChanged() {
  const firstNameEl = render.$("profile-first-name");
  if (!firstNameEl || !state.user) return; // профиль ни разу не открывался в этой сессии

  const firstName = firstNameEl.value.trim();
  const lastName = render.$("profile-last-name").value.trim();
  const email = render.$("profile-email").value.trim();
  const unchanged =
    firstName === (state.user.first_name || "") &&
    lastName === (state.user.last_name || "") &&
    email === (state.user.email || "");
  if (unchanged) return;

  try {
    const updated = await api.updateProfile(state.token, { firstName, lastName, email });
    state.user = { ...state.user, ...updated };
    render.renderAccountChip(state.user);
  } catch (err) {
    render.toast(err instanceof api.ApiError ? err.message : "Не удалось сохранить данные профиля", "error");
  }
}

/** Общий выход из профиля: сначала пробуем сохранить правки полей, потом
 * переключаем экран — поля остаются в DOM (экраны просто скрываются, не
 * уничтожаются), так что читать их можно и после showScreen(). */
function exitProfile() {
  savePersonalDataIfChanged();
  quiz.closeProfile();
}

async function saveProfilePhoto(file) {
  let dataUrl;
  try {
    dataUrl = await readPhotoAsDataUrl(file);
  } catch (err) {
    render.toast(err.message || "Не удалось обработать фото", "error");
    return;
  }
  try {
    // Заодно уходят текущие значения имени/фамилии/email из полей —
    // если пользователь успел их поправить перед сменой фото, правки
    // не потеряются и не потребуют отдельного сохранения.
    const firstName = render.$("profile-first-name")?.value.trim() ?? state.user.first_name ?? "";
    const lastName = render.$("profile-last-name")?.value.trim() ?? state.user.last_name ?? "";
    const email = render.$("profile-email")?.value.trim() ?? state.user.email ?? "";
    const updated = await api.updateProfile(state.token, { firstName, lastName, email, profilePhoto: dataUrl });
    state.user = { ...state.user, ...updated };
    render.renderProfile(state.user);
    render.renderAccountChip(state.user);
    render.toast("Фото обновлено", "success");
  } catch (err) {
    render.toast(err instanceof api.ApiError ? err.message : "Не удалось сохранить фото", "error");
  }
}

async function saveThemeChoice(isLight) {
  const settings = { ...(state.user.settings || {}), theme: isLight ? "light" : "dark" };
  state.user.settings = settings;
  render.applyTheme(); // применяем сразу, не дожидаясь ответа сервера
  try {
    await api.updateSettings(state.token, settings);
  } catch (err) {
    render.toast(err instanceof api.ApiError ? err.message : "Не удалось сохранить тему", "error");
  }
}

/* ============================================================
   МЫШЬ / ТАЧ — делегирование на стабильных родителях, т.к. сами
   списки перерисовываются целиком (innerHTML) при каждом изменении.
   ============================================================ */

export function initMouseControls() {
  // Кнопки в приложении — не как на обычном сайте: почти вся навигация
  // здесь идёт глобальными клавишами (стрелки/Enter/Space/цифры) через
  // document-level обработчик выше, а не через фокус конкретного элемента.
  // Если мелкая кнопка (✏️/❌/"режим редактирования"/"← Назад" и т.п.)
  // остаётся сфокусированной после клика мышью, следующее нажатие
  // Space/Enter достаётся браузерной активации ЭТОЙ кнопки вместо
  // ожидаемого действия (отметить главу, подтвердить и т.д.) — именно
  // это и стояло за жалобой "местами не работает". Снимаем фокус сразу
  // после клика везде, кроме форм в модалках — там автофокус на первом
  // поле нужен и его трогать не стоит.
  document.addEventListener("click", (e) => {
    const btn = e.target.closest("button");
    if (btn && !render.$("modal-overlay").contains(btn)) {
      btn.blur();
    }
  });

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

  /* ---------- корона в титлбаре -> лидерборд друзей по баллам ---------- */
  render.$("leaderboard-btn").addEventListener("click", () => {
    friends.loadLeaderboard();
  });
  render.$("profile-back-btn").addEventListener("click", () => {
    exitProfile();
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
    if (e.target.closest("[data-friend-action]")) {
      const btn = e.target.closest("[data-friend-action]");
      const friendshipId = Number(btn.closest(".friend-row")?.dataset.id);
      if (!friendshipId) return;
      const action = btn.dataset.friendAction;
      if (action === "accept") friends.acceptFriendRequestById(friendshipId);
      else if (action === "decline" || action === "cancel") friends.removeFriendshipById(friendshipId);
      else if (action === "remove") friends.removeFriendshipById(friendshipId, { confirm: true });
      return;
    }
    if (e.target.closest("#profile-friend-add-btn")) {
      const input = render.$("profile-friend-email");
      const email = (input.value || "").trim().toLowerCase();
      const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
      if (!emailOk) { render.toast("Введите корректный email", "error"); return; }
      const ok = await friends.sendFriendRequestByEmail(email);
      if (ok) input.value = "";
      return;
    }
    if (e.target.closest("#avatar-upload-btn")) {
      render.$("profile-photo-input").click();
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
    } else if (action === "license-delete") {
      admin.deleteLicenseById(userId);
    }
  });

  /* ---------- профиль: фото (выбор файла) и тема (свич) — оба сохраняются
     сразу, без отдельной кнопки; делегирование работает, т.к. сам
     #profile-card не пересоздаётся, меняется только его innerHTML ---------- */
  render.$("profile-card").addEventListener("change", (e) => {
    if (e.target.id === "profile-photo-input") {
      const file = e.target.files[0];
      if (file) saveProfilePhoto(file);
      return;
    }
    if (e.target.id === "profile-theme-toggle") {
      saveThemeChoice(e.target.checked);
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
