<script>
  import { state as appState, ROLE_LABELS } from "$lib/state.svelte.js";
  import * as api from "$lib/api/api.js";
  import { toast, confirmDialog, profileModal, closeProfileModal } from "$lib/stores/ui.svelte.js";
  import { logout } from "$lib/auth.js";
  import { avatarColorStyle } from "$lib/avatar.js";
  import Modal from "./Modal.svelte";

  function formatDate(iso) {
    if (!iso) return "—";
    try {
      return new Date(iso).toLocaleDateString("ru-RU", { year: "numeric", month: "long", day: "numeric" });
    } catch {
      return iso;
    }
  }

  function initialsOf(user) {
    const first = (user?.first_name || "").trim();
    const last = (user?.last_name || "").trim();
    if (first || last) return ((first[0] || "") + (last[0] || "")).toUpperCase();
    if (user?.email) return user.email[0].toUpperCase();
    return "U";
  }
  function avatarStyle(user) {
    const photo = user?.profile_photo;
    if (photo) return `background: url(${photo}) center/cover`;
    return avatarColorStyle(user?.id);
  }

  let firstName = $state(appState.user?.first_name || "");
  let lastName = $state(appState.user?.last_name || "");
  let email = $state(appState.user?.email || "");
  let saving = $state(false);

  let photoInput = $state(null);
  let uploadingPhoto = $state(false);
  let uploadPercent = $state(0);

  // Профиль теперь модалка, всегда смонтированная (см. +page.svelte) — а
  // не отдельный экран, который каждый раз пересоздавался бы заново при
  // входе. Поля выше инициализированы один раз при первом монтировании,
  // поэтому при каждом ОТКРЫТИИ модалки подтягиваем их заново из appState —
  // иначе после правки в прошлый раз или смены пользователя показывались бы
  // устаревшие значения.
  $effect(() => {
    if (profileModal.open) {
      firstName = appState.user?.first_name || "";
      lastName = appState.user?.last_name || "";
      email = appState.user?.email || "";
    }
  });

  /* ---------- фото профиля: центр-кроп в квадрат + сжатие в JPEG перед
     отправкой (см. src-legacy/js/controls.js readPhotoAsDataUrl) — так
     обычное фото с телефона (3000-4000px) не отклоняется сервером по
     размеру и не весит непомерно много в base64. GIF отправляется как
     есть (без кропа/сжатия — они потушили бы анимацию), просто с
     проверкой итогового размера. ---------- */
  const AVATAR_SIZE = 640; // было 480 — по просьбе увеличено для более чёткой аватарки
  const AVATAR_JPEG_QUALITY = 0.85;
  const MAX_PHOTO_DATA_URL_LENGTH = 4_000_000; // было 2_000_000 — тот же запрос, лимит касается только GIF (см. выше)

  function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error("Не удалось прочитать файл"));
      reader.readAsDataURL(file);
    });
  }

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
      img.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        reject(new Error("Файл не похож на изображение"));
      };
      img.src = objectUrl;
    });
  }

  async function onPhotoChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    let dataUrl;
    try {
      dataUrl = await readPhotoAsDataUrl(file);
    } catch (err) {
      toast(err.message || "Не удалось обработать фото", "error");
      return;
    }
    uploadingPhoto = true;
    uploadPercent = 0;
    try {
      const updated = await api.updateProfile(
        appState.token,
        {
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          email: email.trim(),
          profilePhoto: dataUrl,
        },
        { onUploadProgress: (fraction) => (uploadPercent = Math.round(fraction * 100)) },
      );
      appState.user = { ...appState.user, ...updated };
      toast("Фото обновлено", "success");
    } catch (err) {
      toast(err instanceof api.ApiError ? err.message : "Не удалось сохранить фото", "error");
    } finally {
      uploadingPhoto = false;
      uploadPercent = 0;
      if (photoInput) photoInput.value = "";
    }
  }

  /** Автосохранение имени/фамилии/email. Раньше в профиле была отдельная
   * кнопка "Сохранить" — по просьбе убрана: поля сохраняются сами по
   * уходу фокуса с поля (onblur) и дополнительно при закрытии модалки
   * (см. back() ниже), без лишнего клика. saving используется только для
   * короткой надписи "Сохраняем…" у полей — отдельного тоста об успехе
   * больше нет: он срабатывал бы на каждый blur и был бы навязчивым. */
  async function savePersonalDataIfChanged() {
    const unchanged =
      firstName.trim() === (appState.user?.first_name || "") &&
      lastName.trim() === (appState.user?.last_name || "") &&
      email.trim() === (appState.user?.email || "");
    if (unchanged) return;
    saving = true;
    try {
      const updated = await api.updateProfile(appState.token, {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: email.trim(),
      });
      appState.user = { ...appState.user, ...updated };
    } catch (err) {
      toast(err instanceof api.ApiError ? err.message : "Не удалось сохранить данные профиля", "error");
    } finally {
      saving = false;
    }
  }

  function back() {
    savePersonalDataIfChanged(); // не блокирует закрытие модалки
    closeProfileModal();
  }

  async function handleLogout() {
    const ok = await confirmDialog({
      title: "Выйти из аккаунта?",
      text: "Понадобится снова ввести Product Key, чтобы войти. Скопируйте его сейчас, если не уверены, что он сохранён где-то ещё:",
      confirmLabel: "Да, выйти",
      cancelLabel: "Остаться",
      danger: true,
      copyText: appState.user?.product_key ?? "",
    });
    if (ok) await logout();
  }
</script>

{#if profileModal.open}
  <Modal title="Профиль" wide onclose={back}>
    <div class="profile-head">
      <!-- onmousedown preventDefault: клик мышью не даёт кнопке получить
           фокус вообще (а Tab+Enter с клавиатуры — по-прежнему даёт), чтобы
           WebKitGTK не показывал фокус-оверлей "Сменить фото" поверх фото
           после обычного клика (баг: фото выглядело "выделенным" после
           нажатия, не только при наведении). См. также правило
           .avatar-upload-btn:focus-visible в components.css. -->
      <button
        class="avatar-upload-btn"
        type="button"
        title="Изменить фото"
        disabled={uploadingPhoto}
        onmousedown={(e) => e.preventDefault()}
        onclick={() => photoInput?.click()}
      >
        <span class="avatar large" style={avatarStyle(appState.user)}>
          {appState.user?.profile_photo ? "" : initialsOf(appState.user)}
        </span>
        <span class="avatar-upload-hint">
          {#if uploadingPhoto}
            {uploadPercent > 0 ? `Загрузка… ${uploadPercent}%` : "Загрузка…"}
          {:else}
            Сменить фото
          {/if}
        </span>
      </button>
      <input
        type="file"
        accept="image/*"
        class="hidden"
        bind:this={photoInput}
        onchange={onPhotoChange}
      />
      <div class="profile-head-name">
        <h2>{[appState.user?.first_name, appState.user?.last_name].filter(Boolean).join(" ") || "Без имени"}</h2>
        <p class="profile-role">{ROLE_LABELS[appState.user?.user_type] || appState.user?.user_type}</p>
      </div>
      <button id="logout-button" class="ghost small danger profile-head-logout" type="button" onclick={handleLogout}>Выйти</button>
    </div>

    <dl class="profile-fields">
      <dt>Лицензия действует до</dt><dd>{formatDate(appState.user?.license_until)}</dd>
      <dt>Статус</dt><dd>{appState.user?.is_blocked ? "Заблокирован" : "Активна"}</dd>
    </dl>

    <div class="profile-settings">
      <!-- Кнопка "Сохранить" убрана — поля сохраняются сами по уходу
           фокуса (onblur вызывает savePersonalDataIfChanged, которая сама
           проверяет, что реально изменилось). Индикатор — просто текст
           рядом с заголовком, а не отдельный контрол. -->
      <p class="panel-label">Личные данные{#if saving} · <span class="autosave-hint">сохраняем…</span>{/if}</p>
      <label>Имя<input type="text" maxlength="100" bind:value={firstName} onblur={savePersonalDataIfChanged} /></label>
      <label>Фамилия<input type="text" maxlength="100" bind:value={lastName} onblur={savePersonalDataIfChanged} /></label>
      <label>Email<input type="email" bind:value={email} onblur={savePersonalDataIfChanged} /></label>
    </div>
  </Modal>
{/if}
