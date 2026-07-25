# Roadwits — клиент

Tauri 2 + чистый HTML/CSS/JS.

## Требования

- Rust + `cargo`
- Tauri CLI: `cargo install tauri-cli --version "^2.0"`
- Системные зависимости Tauri для твоей ОС: https://tauri.app/start/prerequisites/

## Запуск

```bash
cd roadwits-client/src-tauri
cargo tauri dev
cargo android dev
```

Бэкенд (`roadwits-server`) должен быть поднят отдельно на `localhost:8000`
(см. `src/app.js` — `API_BASE_URL`, поменяй под себя при необходимости).

## Сборка

```bash
cd roadwits-client/src-tauri
cargo tauri build
```

## Как это устроено

Никакого npm/Deno/бандлера — `tauri.conf.json` указывает `frontendDist: "../src"`
прямо на папку с готовыми `index.html`/`style.css`/`app.js`. Tauri сам отдаёт
их как статику, `beforeDevCommand`/`beforeBuildCommand` не нужны.

Хранение сессии — **не** через `tauri-plugin-store` (у него JS-биндинги
рассчитаны на npm-пакет), а через три собственные Rust-команды в `main.rs`,
вызываемые из `app.js` через `window.__TAURI__.core.invoke(...)`:

- `get_fingerprint` — стабильный UUID устройства, генерируется один раз при первом запуске
- `save_token` / `load_token` / `clear_token` — JWT

Всё лежит в одном JSON-файле в `app_data_dir()` (путь зависит от ОС —
управляется самим Tauri). `window.__TAURI__` доступен благодаря
`"app.withGlobalTauri": true` в `tauri.conf.json`.

## Реализовано

- Экран логина — ввод Product Key
- Автологин при следующих запусках по сохранённому токену
- Если токен истёк / лицензия заблокирована (401 от `/auth/me`) — токен сбрасывается, снова экран логина
- После входа: кнопка «Выйти» + карточка с данными — ФИО (если заданы), email, роль (Администратор/Редактор/Ученик), дата окончания лицензии, статус (Активна/Заблокирован)

## Не реализовано

- Экраны глав/заданий (были в предыдущей Svelte-версии, в этой — только логин + карточка пользователя)
- UI редактирования глав/заданий для editor/admin
- UI управления лицензиями для admin

## Структура

```
src/
  index.html   — оба экрана (логин / после входа), переключаются классом .hidden
  style.css
  app.js       — вся логика: fetch к API, invoke к Rust-командам, рендер
src-tauri/
  src/main.rs      — команды get_fingerprint/save_token/load_token/clear_token
  tauri.conf.json  — frontendDist указывает прямо на ../src, без bundler-полей
  capabilities/    — core:default, плагинов нет
```
