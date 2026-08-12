# 🚦 Roadwits Client

**Кроссплатформенный тренажёр для подготовки к экзамену по ПДД.**

[![Release](https://img.shields.io/github/v/release/VenerisAsgard/RoadWitsClient?label=release&color=informational)](https://github.com/VenerisAsgard/RoadWitsClient/releases/latest)
[![Build](https://github.com/VenerisAsgard/RoadWitsClient/actions/workflows/release.yml/badge.svg)](https://github.com/VenerisAsgard/RoadWitsClient/actions/workflows/release.yml)
[![Tauri](https://img.shields.io/badge/Tauri-2-24C8DB?logo=tauri&logoColor=white)](https://tauri.app)
[![Platforms](https://img.shields.io/badge/platforms-Windows%20%7C%20macOS%20%7C%20Linux%20%7C%20Android%20%7C%20iOS-blue)]()
[![License](https://img.shields.io/badge/license-Proprietary-lightgrey)]()

---

## 📋 Содержание

- [О проекте](#-о-проекте)
- [Возможности](#-возможности)
- [Платформы](#-платформы)
- [Технологии](#-технологии)
- [Требования](#️-требования)
- [Быстрый старт](#-быстрый-старт)
- [Сборка](#️-сборка)
- [Установка готовых сборок](#-установка-готовых-сборок)
- [Структура проекта](#-структура-проекта)
- [Релизы](#-релизы)

---

## 🧭 О проекте

**Roadwits** — тренажёр для подготовки к экзамену по ПДД. Этот репозиторий — клиент: тонкое приложение на чистом JS без фреймворков и бандлера, обёрнутое в [Tauri 2](https://tauri.app/), которое общается с отдельным бэкендом (`roadwits-server`) по REST API. Вся бизнес-логика экзамена, лицензий и пользователей живёт на сервере — клиент лишь показывает интерфейс и делает запросы.

Дизайн клиента подчинён одному принципу — **каждый модуль отвечает ровно за одну вещь**:

| Модуль | Зона ответственности |
|---|---|
| `api.js` | Всё общение с backend'ом — единственная точка fetch |
| `auth.js` | Логин / автологин / логаут |
| `quiz.js` | Логика прохождения теста |
| `render.js` | Единственное место, которое пишет в DOM |
| `admin.js` | Редактирование контента и лицензий (editor/admin) |
| `friends.js` | Друзья в профиле |
| `device.js` | Слой поверх Tauri: `invoke()`, управление окном |
| `update.js` | Проверка обновлений по GitHub Releases |
| `state.js` | Единое состояние приложения |

## 📦 Платформы

| Платформа | Статус | Формат дистрибуции |
|---|---|---|
| 🪟 Windows | ✅ Стабильно | `.exe` (NSIS-инсталлятор) |
| 🍎 macOS | ✅ Стабильно | `.dmg` (universal: Intel + Apple Silicon) |
| 🐧 Linux | ✅ Стабильно | Flatpak |
| 🤖 Android | 🚧 В разработке | сборка из исходников |
| 📱 iOS | 🚧 В разработке | сборка из исходников |

## 🧰 Технологии

- **[Tauri 2](https://tauri.app/)** — Rust-ядро + системный WebView вместо Electron
- **Vanilla JS** — фронтенд без фреймворка и без сборщика (`src/` отдаётся as-is)
- **Rust** (`src-tauri/`) — нативный слой: команды, окно, `reqwest` (rustls, без OpenSSL)
- **Flatpak** — дистрибуция под Linux, appstream-метаданные компонуются автоматически
- **GitHub Actions** — сборка под все десктоп-платформы и публикация релиза по тегу `vX.Y.Z`

---

## ⚙️ Требования

### Общие (для всех платформ)

- [Node.js](https://nodejs.org/) 22+
- [Rust](https://www.rust-lang.org/tools/install) (stable) + Cargo
- Git

### 🖥️ Desktop

<details>
<summary><b>🪟 Windows</b></summary>

- [Microsoft C++ Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) (компонент "Desktop development with C++")
- WebView2 Runtime (в Windows 10/11 уже предустановлен)

</details>

<details>
<summary><b>🍎 macOS</b></summary>

- Xcode Command Line Tools: `xcode-select --install`
- Для universal-сборки (Intel + Apple Silicon) нужны оба Rust-таргета:
  ```bash
  rustup target add aarch64-apple-darwin x86_64-apple-darwin
  ```

</details>

<details>
<summary><b>🐧 Linux</b></summary>

Системные зависимости Tauri (Debian/Ubuntu):
```bash
sudo apt install libwebkit2gtk-4.1-dev libsoup-3.0-dev \
  libjavascriptcoregtk-4.1-dev build-essential curl wget file \
  libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev
```
Для сборки Flatpak-пакета — см. [flatpak_data/roadwits-client.flatpak.yaml](flatpak_data/roadwits-client.flatpak.yaml) и [.github/workflows/release.yml](.github/workflows/release.yml) (используются `flatpak`/`flatpak-builder` из `ppa:flatpak/stable`, а не устаревшие версии из `apt`).

</details>

### 📱 Mobile

<details>
<summary><b>🤖 Android</b></summary>

- **[Android Studio](https://developer.android.com/studio)** с установленными:
  - Android SDK Platform (актуальная API-версия)
  - Android SDK Build-Tools
  - **Android NDK** (устанавливается через SDK Manager → SDK Tools → NDK)
- **JDK 17** (обычно ставится вместе с Android Studio)
- Rust-таргеты для Android:
  ```bash
  rustup target add aarch64-linux-android armv7-linux-androideabi \
    i686-linux-android x86_64-linux-android
  ```
- Переменные окружения (пример для Linux/macOS, добавить в `~/.bashrc` / `~/.zshrc`):
  ```bash
  export ANDROID_HOME="$HOME/Android/Sdk"
  export NDK_HOME="$ANDROID_HOME/ndk/$(ls -1 $ANDROID_HOME/ndk)"
  export JAVA_HOME="/path/to/jdk-17"
  export PATH="$PATH:$ANDROID_HOME/platform-tools:$ANDROID_HOME/cmdline-tools/latest/bin"
  ```
  На Windows — те же переменные (`ANDROID_HOME`, `NDK_HOME`, `JAVA_HOME`) через "Переменные среды" в свойствах системы.

</details>

<details>
<summary><b>🍏 iOS</b></summary>

- Только **macOS** + **[Xcode](https://apps.apple.com/app/xcode/id497799835)** (полная версия, не только Command Line Tools)
- [CocoaPods](https://cocoapods.org/): `sudo gem install cocoapods`
- Rust-таргеты для iOS:
  ```bash
  rustup target add aarch64-apple-ios aarch64-apple-ios-sim x86_64-apple-ios
  ```
- Аккаунт Apple Developer — для запуска на физическом устройстве и подписи сборки

</details>

---

## 🚀 Быстрый старт

```bash
git clone https://github.com/VenerisAsgard/RoadWitsClient.git
cd RoadWitsClient
npm install
```

Запуск в режиме разработки (hot-reload окна Tauri):

```bash
npm run tauri dev
```

> В репозитории есть шорткат — исполняемый файл `./start`, который делает то же самое (`npm run tauri dev`).

## 🏗️ Сборка

### Desktop

```bash
npm run tauri build
```

Артефакты появятся в `src-tauri/target/release/bundle/` — `.exe`/NSIS-инсталлятор на Windows, `.app`/`.dmg` на macOS. Список форматов задаётся в [`src-tauri/tauri.conf.json`](src-tauri/tauri.conf.json) → `bundle.targets`.

Linux-сборка (Flatpak) выполняется отдельно, через `flatpak-builder` с манифестом [`flatpak_data/roadwits-client.flatpak.yaml`](flatpak_data/roadwits-client.flatpak.yaml) — см. соответствующий job в [`release.yml`](.github/workflows/release.yml).

### 🤖 Android

Первый запуск инициализирует Android-проект (`src-tauri/gen/android`):

```bash
npx tauri android init
```

Разработка (эмулятор/устройство с live-reload):

```bash
npx tauri android dev
```

Финальная сборка (`.apk` / `.aab`):

```bash
npx tauri android build
```

### 📱 iOS

Первый запуск инициализирует Xcode-проект (`src-tauri/gen/apple`):

```bash
npx tauri ios init
```

Разработка (симулятор/устройство):

```bash
npx tauri ios dev
```

Финальная сборка:

```bash
npx tauri ios build
```

---

## 📥 Установка готовых сборок

Все актуальные сборки — на странице **[Releases](https://github.com/VenerisAsgard/RoadWitsClient/releases/latest)**.

### 🪟 Windows

Скачать `.exe` из последнего релиза и запустить установщик (NSIS).

### 🍎 macOS

Скачать `.dmg` из последнего релиза, открыть и перетащить `Roadwits.app` в `Applications`.
> Если macOS Gatekeeper блокирует запуск ("приложение повреждено" / "неизвестный разработчик") — `ПКМ по приложению → Открыть`.

### 🐧 Linux (Flatpak)

**Через remote** (рекомендуется — даёт автообновления и appstream-метаданные в системном софт-центре):

```bash
sudo flatpak remote-add --system roadwits-client https://venerisasgard.github.io/RoadWitsClient/roadwits-client.flatpakrepo
sudo flatpak install --system roadwits-client com.roadwits.client
sudo flatpak update --appstream --system roadwits-client
```

**Или разово, из `.flatpak`-бандла в релизе** (без подписки на remote):

```bash
flatpak install --user ./com.roadwits.client.flatpak
```

### 🤖 Android / 📱 iOS

Пока не публикуются в Releases — соберите из исходников по инструкции выше ([Сборка → Android](#-android) / [Сборка → iOS](#-ios)).

---

## 🗂️ Структура проекта

```
RoadWitsClient/
├── src/                      # Фронтенд: чистый JS, без сборщика
│   ├── index.html
│   ├── app.js
│   ├── css/                  # Стили (reset / variables / layout / components)
│   └── js/
│       ├── api.js            # Общение с backend'ом
│       ├── auth.js           # Логин / автологин
│       ├── quiz.js           # Логика теста
│       ├── render.js         # Единственное место, пишущее в DOM
│       ├── admin.js          # Редактирование контента/лицензий
│       ├── friends.js        # Друзья
│       ├── device.js         # Слой поверх Tauri invoke()
│       ├── update.js         # Проверка обновлений по GitHub Releases
│       ├── state.js          # Общее состояние приложения
│       ├── controls.js       # Клавиатура/мышь/тач
│       └── config.js         # Единственное место с адресом backend'а
├── src-tauri/                 # Rust-ядро (Tauri)
│   ├── src/
│   │   ├── main.rs
│   │   └── lib.rs
│   ├── icons/                # Иконки приложения
│   ├── capabilities/          # ACL / permissions Tauri
│   ├── tauri.conf.json        # Конфигурация Tauri (окно, бандл, версия)
│   └── Cargo.toml
├── flatpak_data/               # Всё для Linux/Flatpak-сборки
│   ├── roadwits-client.flatpak.yaml   # Манифест flatpak-builder
│   ├── com.roadwits.client.metainfo.xml
│   ├── generate_metainfo.py    # Подстановка версии/скриншотов в metainfo при сборке
│   └── screenshots/
├── .github/workflows/
│   └── release.yml             # CI: сборка Windows/macOS/Linux + публикация релиза
├── start                       # Шорткат: npm run tauri dev
├── release                     # Скрипт бампа версии + тега + пуша релиза
└── package.json
```

## 🔖 Релизы

Версия синхронно живёт в `src-tauri/tauri.conf.json` и `src-tauri/Cargo.toml`. Для выпуска новой версии используется скрипт `./release`: он поднимает версию в обоих файлах, коммитит, ставит тег `vX.Y.Z` и пушит — тег автоматически запускает [`release.yml`](.github/workflows/release.yml), который собирает Windows/macOS/Linux-артефакты и публикует черновик релиза на GitHub.

```bash
./release
```

---

## TODO

Переход ui/ux на Svelte, улучшение отображения текста.

---

<div align="center">

Сделано с ❤️ и Rust для тех, кто готовится сдать на права.

</div>
