<script>
  import { onMount } from "svelte";
  import { state as appState, ROLE_LABELS } from "$lib/state.svelte.js";
  import * as api from "$lib/api/api.js";
  import { toast, confirmDialog } from "$lib/stores/ui.svelte.js";
  import { logout } from "$lib/auth.js";
  import FriendsPanel from "$lib/components/FriendsPanel.svelte";

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
    const hue = ((user?.id || 0) * 47) % 360;
    return `background: hsl(${hue}, 55%, 40%)`;
  }

  let firstName = $state(appState.user?.first_name || "");
  let lastName = $state(appState.user?.last_name || "");
  let email = $state(appState.user?.email || "");
  let saving = $state(false);

  let photoInput = $state(null);
  let uploadingPhoto = $state(false);

  /* ---------- фото профиля: центр-кроп в квадрат + сжатие в JPEG перед
     отправкой (см. src-legacy/js/controls.js readPhotoAsDataUrl) — так
     обычное фото с телефона (3000-4000px) не отклоняется сервером по
     размеру и не весит непомерно много в base64. GIF отправляется как
     есть (без кропа/сжатия — они потушили бы анимацию), просто с
     проверкой итогового размера. ---------- */
  const AVATAR_SIZE = 480;
  const AVATAR_JPEG_QUALITY = 0.85;
  const MAX_PHOTO_DATA_URL_LENGTH = 2_000_000;

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
    try {
      const updated = await api.updateProfile(appState.token, {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: email.trim(),
        profilePhoto: dataUrl,
      });
      appState.user = { ...appState.user, ...updated };
      toast("Фото обновлено", "success");
    } catch (err) {
      toast(err instanceof api.ApiError ? err.message : "Не удалось сохранить фото", "error");
    } finally {
      uploadingPhoto = false;
      if (photoInput) photoInput.value = "";
    }
  }

  /** Автосохранение имени/фамилии/email. Раньше в профиле была отдельная
   * кнопка "Сохранить" — по просьбе убрана: поля сохраняются сами по
   * уходу фокуса с поля (onblur) и дополнительно при уходе с экрана
   * кнопкой "Назад"/Esc (см. back() ниже), без лишнего клика. saving
   * используется только для короткой надписи "Сохраняем…" у полей —
   * отдельного тоста об успехе больше нет: он срабатывал бы на каждый
   * blur и был бы навязчивым. */
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
    savePersonalDataIfChanged(); // как и в оригинале — не блокирует переключение экрана
    appState.screen = appState.profileReturnScreen || "menu";
  }

  function onKeydown(e) {
    if (e.key === "Escape") {
      e.preventDefault();
      back();
    }
  }

  onMount(() => {
    document.addEventListener("keydown", onKeydown);
    return () => document.removeEventListener("keydown", onKeydown);
  });

  async function handleLogout() {
    const ok = await confirmDialog({
      title: "Выйти из аккаунта?",
      text: "Понадобится снова ввести Product Key, чтобы войти.",
      confirmLabel: "Да, выйти",
      cancelLabel: "Остаться",
      danger: true,
    });
    if (ok) await logout();
  }
</script>

<section class="screen" id="screen-profile" data-screen="profile">
  <div class="profile-card" id="profile-card">
    <button class="ghost small profile-back" id="profile-back-btn" type="button" onclick={back}>← Назад</button>

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
        <span class="avatar-upload-hint">{uploadingPhoto ? "Загрузка…" : "Сменить фото"}</span>
      </button>
      <input
        type="file"
        accept="image/*"
        class="hidden"
        bind:this={photoInput}
        onchange={onPhotoChange}
      />
      <div>
        <h2>{[appState.user?.first_name, appState.user?.last_name].filter(Boolean).join(" ") || "Без имени"}</h2>
        <p class="profile-role">{ROLE_LABELS[appState.user?.user_type] || appState.user?.user_type}</p>
      </div>
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

    <FriendsPanel />
  </div>

  <button id="logout-button" class="ghost logout-btn" type="button" onclick={handleLogout}>Выйти</button>
</section>
