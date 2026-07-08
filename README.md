# 🚗 RoadWitsClient

<p align="center">
  <b>Учись где угодно и когда удобно</b><br>
  Короткие тесты по Правилам дорожного движения Республики Беларусь
</p>

---

## 📖 О проекте

**RoadWitsClient** — это приложение для подготовки и проверки знаний по ПДД Республики Беларусь. Основано на Tauri + SvelteKit

Учись в любое удобное время:

- 🚗 В дороге
- ☕ На перерыве
- 🏠 Дома
- 💻 За компьютером
- 📱 На мобильном устройстве

Приложение создано для быстрого повторения материала с помощью коротких тестов и удобного интерфейса.

---

## ✨ Возможности

- ✅ Тесты по ПДД Республики Беларусь
- ✅ Быстрое обучение небольшими сессиями
- ✅ Поддержка Desktop версии
- ✅ Поддержка Android версии
- ✅ Современный интерфейс на базе Tauri
- 🚧 Развитие проекта продолжается

---

# 🛠 Требования

Перед запуском проекта необходимо установить:

- [Rust](https://www.rust-lang.org/)
- [Deno](https://deno.com/)
- Java JDK 25
- Системные зависимости Tauri

---

## 🔥 Рекомендуемая настройка IDE

[VS Code](https://code.visualstudio.com/) + [Svelte](https://marketplace.visualstudio.com/items?itemName=svelte.svelte-vscode) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer).

# 📥 Установка проекта

## 1. Клонирование репозитория

Сначала необходимо скачать исходный код:

```bash
git clone https://github.com/VenerisAsgard/RoadWitsClient.git

cd RoadWitsClient
```

---

## 2. Установка общих зависимостей

### Rust

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

---

### Deno

```bash
curl -fsSL https://deno.land/install.sh | sh
```

---

# 🐧 Arch Linux

Установка необходимых пакетов:

```bash
sudo pacman -Syu

sudo pacman -S --needed \
webkit2gtk-4.1 \
base-devel \
curl \
wget \
file \
openssl \
appmenu-gtk-module \
libappindicator-gtk3 \
librsvg \
xdotool
```

Установка Java:

```bash
sudo pacman -S jdk25-openjdk
```

---

# 🟠 Debian / Ubuntu

Обновление пакетов:

```bash
sudo apt update
```

Установка зависимостей:

```bash
sudo apt install \
libwebkit2gtk-4.1-dev \
build-essential \
curl \
wget \
file \
libxdo-dev \
libssl-dev \
libayatana-appindicator3-dev \
librsvg2-dev
```

Установка Java:

```bash
sudo apt-get install openjdk-25-jdk
```

---

# 📦 Установка зависимостей проекта

После клонирования репозитория выполните:

```bash
deno install
```

---


# 🚀 Запуск проекта

## 💻 Desktop Development

Для запуска Desktop версии:

```bash
deno task tauri dev
```

---

## 📱 Android Development

Для запуска Android версии:

```bash
deno task tauri android dev
```

---

# 🏗 Сборка проекта

## Desktop Build

```bash
deno task tauri build
```

---

## Android Build

```bash
deno task tauri android build
```

---

# 🧩 Технологии

Проект использует:

- ⚙️ Tauri
- 🦀 Rust
- 🦕 Deno
- ☕ Java
- 📱 Android SDK

---

# 🗺 Roadmap

Планируемые улучшения:

- [ ] UI + UX
- [ ] Подключение Backend

---

# 📄 Лицензия

MIT License

Copyright (c) 2026 VenerisAsgard

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

---

