# AI Work Log — Legacy vs Svelte Reconciliation

Сверка src-legacy/* (vanilla JS/Tauri) vs src/* (SvelteKit) завершена —
все модули построчно/детально сопоставлены, legacy-код удалён из репозитория
(src-legacy/), приложение полностью живёт на SvelteKit.

## Итог сверки — найдено и исправлено 9 расхождений
1. ChaptersScreen.svelte: стрелки ↑/↓ не обновляли список вопросов
   редактора (не вызывали refreshEditorQuestions()).
2. ResultScreen.svelte: активная точка в review-grid не скроллилась в
   видимую область при навигации стрелками по разбору ответов.
3. QuestionFormModal.svelte: submit() молча делал return при невалидной
   форме вместо toast-сообщения.
4. EditorTooltip.svelte: не мерил реальные размеры элемента (offsetWidth/
   offsetHeight) и не клампил по краям окна — длинная подсказка у края
   могла вылезать за экран.
5. Общий баг во всех модалках-формах: не автофокусился первый input при
   открытии (легаси openModal() это делал) — исправлено одним фиксом в
   Modal.svelte.
6. MenuScreen.svelte: держал собственную устаревшую копию menuConfirm(),
   старт экзамена из меню вёл на пустой экран (beginQuiz не вызывался).
7. ConfirmDialog.svelte: не проставлял класс "danger" на .modal-box и
   id="modal-title" — у опасных подтверждений пропадала красная рамка.
8. ToastStack.svelte: красил тосты через data-kind вместо ожидаемых CSS
   классов .toast-error/.toast-success/.toast-info — цветовая индикация
   не работала совсем; плюс не было fade-out анимации перед удалением.
9. StatusBar.svelte: отсутствовала ветка для connectionStatus==="degraded"
   (показывало литералом "Сервер: degraded"), и не было title-тултипа
   с деталями статуса.

Все остальные модули (api.js, cache.js, config.js, questions.js, quiz.js,
auth.js, device.js, admin.js, friends.js, все .svelte-компоненты) сверены
и являются точным или документированно-улучшенным портом легаси —
дополнительных расхождений не найдено.

## Дополнительно найдено после "закрытия" всех этапов
10. HintBar.svelte — два расхождения:
    a) подсказки рендерились плоским текстом ("↑/↓ выбрать · Enter принять")
       вместо чипов <kbd> (легаси: каждая группа — .hint-group с <kbd> на
       каждую клавишу) — CSS для чипов (.hint-group, kbd, .hint-label)
       существовал, но никогда не применялся.
    b) панель не пряталась (класс "hidden") ни при пустых подсказках, ни на
       экране меню — легаси всегда скрывает hint-bar в обоих случаях
       (на меню подсказки не нужны, там цифры 1-9 видны на самих пунктах),
       и раскладка .stage зависит от #app-shell:has(.hint-bar.hidden).
    Оба фикса внесены.

## Найдено после добавления SvelteKit — пропущенный шаг сборки фронтенда
11. flatpak_data/roadwits-client.flatpak.yaml — build-commands модуля
    "roadwits-client" делали `npm ci` и сразу `cargo build --release`,
    без `npm run build` между ними. В легаси vanilla-JS фронтенд не
    требовал сборки (статика лежала в репозитории как есть), поэтому
    `cargo build` работал сразу — tauri_build::build() (build.rs)
    встраивает содержимое frontendDist ("../build" в tauri.conf.json)
    в бинарник на этапе компиляции. После миграции на SvelteKit каталог
    "../build" создаётся только `vite build` (npm run build), а сам
    он не в репозитории (не трекается git, .gitignore его тоже не
    перечислял). Без этого шага Flatpak-сборка либо падает (нет
    ../build), либо (при наличии старого каталога) зашивает устаревший
    фронтенд. Добавлен шаг `npm run build` перед cargo build; заодно
    добавлен `build/` в .gitignore (не был перечислён после миграции).
    Обычный релиз через tauri-action (job "release" в release.yml)
    этой проблеме не подвержен — tauri-action сам вызывает
    beforeBuildCommand ("npm run build") из tauri.conf.json, это уже
    сверено ранее.


## Найдено при первом dev-запуске (npm/Rust уже стояли, приложение работало) — 6 svelte-check warnings
12. a11y_no_noninteractive_element_to_interactive_role (4 места: MenuScreen,
    ChaptersScreen — список глав, RandomCountScreen, QuestionScreen —
    список вариантов ответа) — `<li role="button" tabindex="0" onclick
    onkeydown>` напрямую на `<li>` внутри `<ul>` ломает семантику списка
    для скринридеров (Svelte 5 предупреждает об этом явно, в отличие от
    Svelte 4). Исправлено переносом role/tabindex/обработчиков и класса
    стилизации на вложенный `<div>` внутри пустого `<li>` — визуально и
    по CSS ничего не меняется (все селекторы `.menu-item .m-index` и
    т.п. — descendant, не child-комбинаторы, `.menu-list`/`.chapter-list`
    flex-layout остаётся на уровне `<ul>` → `<li>`, не затронут).
    Проверено: `svelte-check` — warnings 10 → 0; `npm run build` проходит
    без ошибок.
13. state_referenced_locally (QuestionFormModal.svelte, ChapterFormModal.svelte,
    6 упоминаний) — локальные `$state` поля формы (text/hint/answers/
    title/description) инициализировались чтением реактивного пропа
    (question/chapter) без явного обозначения "только начальное
    значение" — Svelte 5 предупреждает, что это похоже на забытый
    `$derived`. По факту это осознанный паттерн (снимок на момент
    открытия, дальше редактируется локально), и баг был не в текущем
    поведении (родитель — ChaptersScreen.svelte — всегда закрывает
    модалку перед открытием другой цели), а в хрупкости: любое будущее
    изменение, при котором editingQuestion/editingChapter поменяется
    с одного объекта на другой без прохождения через null, тихо оставило
    бы в форме старые данные. Исправлено на два уровня: (1) в самих
    компонентах — обёрнуто в `untrack(() => ...)` из "svelte", что явно
    документирует намерение и убирает warning; (2) в ChaptersScreen.svelte
    — вызовы `<QuestionFormModal>`/`<ChapterFormModal>` обёрнуты в
    `{#key editingQuestion}`/`{#key editingChapter}`, что гарантирует
    полный ремонт компонента при смене цели редактирования независимо
    от будущих изменений логики — защита от регресса.

## Найдено пользователем — баг с кнопкой "Войти" после logout
14. auth.js: state.loginSubmitting сбрасывался в false только в catch
    (ветка ошибки submitLogin), но не в ветке успеха. После успешного
    входа флаг так и оставался true (незаметно, т.к. экран логина уже
    скрыт), а после logout() (который его тоже не трогал) LoginView
    показывался снова с застрявшим loginSubmitting === true — кнопка
    "Войти" превращалась в задизейбленную "Входим..." навсегда, до
    перезапуска приложения. Исправлено: submitLogin сбрасывает флаг
    и на успешном пути тоже; logout() дополнительно сбрасывает его
    сам как defensive reset (на случай будущих путей выхода, которые
    могли бы забыть это сделать) — по аналогии с уже имеющимся сбросом
    timerHandle в этой же функции.

Полноценных нерешённых задач по сверке не осталось. Если появятся идеи
по улучшениям (баги, новые фичи, стили, анимации) — можно реализовывать
их напрямую, отмечая здесь при необходимости.
- [x] package.json не обновляется — исправлено: добавлена переменная PACKAGE_JSON и sed-замена версии (первое вхождение "version" в файле — это и есть поле version, "name" стоит раньше и sed-паттерном "version": ... не задевается). Проверено на тестовых файлах.
- [x] git fetch origin без --tags — исправлено: `git fetch origin --tags`.
- [x] Скрипт не переходит в корень репозитория — исправлено: `cd "$(dirname "$0")"` в начале release (работает независимо от того, откуда скрипт запущен).
- [x] проверить start, release — оба скрипта прошли `bash -n` (синтаксис ОК); package.json содержит скрипт "tauri", так что `npm run tauri dev` / `npm run tauri build` из start рабочие; sed-замены версий проверены на тестовых копиях файлов.

## Улучшения по запросу (после сверки)
- Подсказки навигации в меню: раньше (и в легаси, и по инерции в
  HintBar.svelte) hint-bar на экране меню всегда скрывался (цифры 1-9
  на пунктах меню считались достаточной подсказкой). По просьбе — теперь
  меню тоже показывает hint-bar: "↑↓ выбрать · 1-9 быстрый выбор ·
  Enter начать". Заодно убраны 2 дублирующихся локальных объявления
  HINT_MENU (в MenuScreen.svelte и auth.js) в пользу одного
  экспортируемого из quiz.js — раньше при рассинхроне текста подсказки
  в этих трёх местах пришлось бы править в трёх местах.
- start: не было shebang — `./start` падал с "Exec format error"
  (годится было только `sh start`). Добавлен #!/bin/bash + флаг:
  `./start` — dev, `./start build` — production-сборка Tauri.
- .github/workflows/release.yml — принесён из старого (легаси) репозитория
  пользователем и сверен с текущим состоянием проекта: версии Node/Rust,
  SDK-расширения flatpak-builder (node22/rust-stable, runtime 50) и пути
  сборки (frontendDist "../build" в tauri.conf.json ↔ adapter-static
  pages/assets "build" в svelte.config.js) — всё совпадает 1-в-1 с тем,
  что уже настроено в репозитории после миграции на SvelteKit, изменений
  не потребовалось. Два job'а: "release" (tauri-action, Windows nsis +
  macOS universal dmg/app, публикует GitHub Release draft) и
  "release-flatpak" (собирает и подписывает Flatpak, публикует OSTree-репо
  на GitHub Pages, прикрепляет .flatpak к тому же релизу). Секреты
  (FLATPAK_GPG_PRIVATE_KEY, FLATPAK_GPG_PASSPHRASE) не мои — добавляются
  пользователем в настройках репозитория.
