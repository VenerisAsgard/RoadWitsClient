<script>
  import { onMount } from "svelte";
  import { state as appState, ROLE_LABELS } from "$lib/state.svelte.js";
  import {
    loadLicenses,
    visibleLicenses,
    setLicenseFilter,
    setLicenseSort,
    copyLicenseKey,
    extendLicenseById,
    toggleBlockLicense,
    resetDeviceById,
    deleteLicenseById,
  } from "$lib/admin.js";
  import LicenseFormModal from "./LicenseFormModal.svelte";
  import ProductKeyModal from "./ProductKeyModal.svelte";

  const LICENSE_COLUMNS = [
    { field: "id", label: "#" },
    { field: "product_key", label: "Product key" },
    { field: "user_type", label: "Роль" },
    { field: "email", label: "Email" },
    { field: "first_name", label: "Имя" },
    { field: "license_until", label: "Годен до" },
    { field: "is_blocked", label: "Статус" },
    { field: "created_at", label: "Создана" },
  ];

  const licenses = $derived(visibleLicenses());
  let loading = $state(true);
  let showCreateForm = $state(false);
  let newProductKey = $state(null);
  let searchInput = $state(appState.licenseFilter);
  let searchDebounce = null;

  function formatDate(iso) {
    if (!iso) return "—";
    try {
      return new Date(iso).toLocaleDateString("ru-RU", { year: "numeric", month: "long", day: "numeric" });
    } catch {
      return iso;
    }
  }

  function onSearchInput() {
    clearTimeout(searchDebounce);
    const value = searchInput;
    searchDebounce = window.setTimeout(() => setLicenseFilter(value), 150);
  }

  function back() {
    appState.screen = "settings";
  }

  function onKeydown(e) {
    if (e.key === "Escape") {
      // Модалки (форма лицензии, показ product key) перехватывают Esc
      // сами в capture-фазе (см. Modal.svelte) — на всякий случай тоже
      // не закрываем экран поверх открытой модалки.
      if (showCreateForm || newProductKey) return;
      e.preventDefault();
      back();
    }
  }

  onMount(() => {
    loadLicenses().finally(() => (loading = false));
    document.addEventListener("keydown", onKeydown);
    return () => document.removeEventListener("keydown", onKeydown);
  });
</script>

<section class="screen" id="screen-admin" data-screen="admin">
  <button class="ghost small screen-back" type="button" onclick={back}>← Настройки</button>
  <div class="admin-page">
    <div class="admin-page-head">
      <div>
        <p class="panel-label">Администрирование</p>
        <h2>Лицензии</h2>
      </div>
      <div class="admin-toolbar">
        <input
          type="search"
          placeholder="Поиск: ключ, email, имя…"
          autocomplete="off"
          spellcheck="false"
          bind:value={searchInput}
          oninput={onSearchInput}
        />
        <button class="icon-btn" type="button" title="Обновить список" onclick={() => { loading = true; loadLicenses().finally(() => (loading = false)); }}>↻</button>
        <button class="chapter-start" type="button" onclick={() => (showCreateForm = true)}>➕ Выдать лицензию</button>
      </div>
    </div>

    <div class="admin-table-wrap">
      {#if loading}
        <p class="loading">Загрузка лицензий…</p>
      {:else if licenses.length === 0}
        {#if appState.licenseFilter.trim()}
          <p class="loading">Ничего не найдено по запросу «{appState.licenseFilter}».</p>
        {:else}
          <p class="loading">Лицензий пока нет.</p>
        {/if}
      {:else}
        <table class="admin-table">
          <thead>
            <tr>
              {#each LICENSE_COLUMNS as c}
                <th
                  class="sortable"
                  class:sorted={appState.licenseSort.field === c.field}
                  onclick={() => setLicenseSort(c.field)}
                >
                  {c.label}
                  {#if appState.licenseSort.field === c.field}
                    <span class="sort-arrow">{appState.licenseSort.dir === "asc" ? "▲" : "▼"}</span>
                  {/if}
                </th>
              {/each}
              <th class="admin-actions-head">Действия</th>
            </tr>
          </thead>
          <tbody>
            {#each licenses as lic (lic.id)}
              {@const fullName = [lic.first_name, lic.last_name].filter(Boolean).join(" ")}
              <tr class="license-row" class:blocked={lic.is_blocked}>
                <td class="license-id">{lic.id ?? "—"}</td>
                <td class="license-key">
                  <span class="license-key-text">{lic.product_key}</span>
                  <button type="button" class="icon-btn tiny" title="Скопировать ключ" onclick={() => copyLicenseKey(lic.product_key)}>📋</button>
                </td>
                <td class="license-role">{ROLE_LABELS[lic.user_type] || lic.user_type || "—"}</td>
                <td class="license-email">{lic.email || "—"}</td>
                <td class="license-name">{fullName || "—"}</td>
                <td class="license-until">{lic.license_until ? formatDate(lic.license_until) : "—"}</td>
                <td class="license-status">
                  <span class="status-pill" class:blocked={lic.is_blocked} class:active={!lic.is_blocked}>
                    {lic.is_blocked ? "Заблокирован" : "Активна"}
                  </span>
                </td>
                <td class="license-created">{lic.created_at ? formatDate(lic.created_at) : "—"}</td>
                <td class="license-controls">
                  <button class="icon-btn tiny" type="button" title="Продлить на 30 дней" onclick={() => extendLicenseById(lic.id)}>+30д</button>
                  <button class="icon-btn tiny danger" type="button" title="Сбросить устройство" onclick={() => resetDeviceById(lic.id)}>↻</button>
                  <button
                    class="icon-btn tiny"
                    type="button"
                    title={lic.is_blocked ? "Разблокировать" : "Заблокировать"}
                    onclick={() => toggleBlockLicense(lic.id, lic.is_blocked)}
                  >
                    {lic.is_blocked ? "🔓" : "🔒"}
                  </button>
                  <button class="icon-btn tiny danger" type="button" title="Удалить пользователя" onclick={() => deleteLicenseById(lic.id)}>🗑</button>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      {/if}
    </div>
  </div>
</section>

{#if showCreateForm}
  <LicenseFormModal onclose={() => (showCreateForm = false)} oncreated={(key) => (newProductKey = key)} />
{/if}

{#if newProductKey}
  <ProductKeyModal productKey={newProductKey} onclose={() => (newProductKey = null)} />
{/if}
