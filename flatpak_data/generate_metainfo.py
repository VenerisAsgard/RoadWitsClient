#!/usr/bin/env python3
"""
Заполняет <releases> и <screenshots> в com.roadwits.client.metainfo.xml
перед сборкой Flatpak. Запускается из CI (release-flatpak в release.yml)
прямо перед flatpak-builder, ничего никуда не коммитит — файл в рабочей
копии просто перезаписывается на каждом прогоне.

releases:
    История версий собирается из git-тегов вида v* (аннотированных или
    лёгких — не важно, читаем через for-each-ref) + текущей версии из
    src-tauri/tauri.conf.json. Версия из tauri.conf.json добавляется
    ВСЕГДА, даже если соответствующего тега ещё нет в репозитории на
    момент этого прогона (актуально для workflow_dispatch — см.
    комментарий в release.yml про создание тега тем же прогоном).

screenshots:
    Берутся из flatpak_data/screenshots/*.png|jpg (по алфавиту),
    отдаются через raw.githubusercontent.com/<owner>/<repo>/HEAD/...
    — HEAD тут спец-алиас GitHub на дефолтную ветку, хардкодить имя
    ветки не нужно. Если папка пустая или её нет — блок просто не
    добавляется (это не ошибка).
"""
import json
import os
import re
import subprocess
from datetime import date
from xml.sax.saxutils import escape

ROOT = subprocess.run(
    ["git", "rev-parse", "--show-toplevel"],
    capture_output=True, text=True, check=True,
).stdout.strip()

METAINFO_PATH = os.path.join(ROOT, "flatpak_data", "com.roadwits.client.metainfo.xml")
SCREENSHOTS_DIR = os.path.join(ROOT, "flatpak_data", "screenshots")
TAURI_CONF = os.path.join(ROOT, "src-tauri", "tauri.conf.json")


def current_version() -> str:
    with open(TAURI_CONF, encoding="utf-8") as f:
        return json.load(f)["version"]


def git_tag_entries() -> list[tuple[str, str]]:
    """[(версия_без_v, YYYY-MM-DD), ...] по всем тегам v*, новые сначала."""
    result = subprocess.run(
        ["git", "for-each-ref", "--sort=-creatordate",
         "--format=%(refname:short) %(creatordate:short)", "refs/tags/v*"],
        capture_output=True, text=True,
    )
    entries = []
    for line in result.stdout.strip().splitlines():
        if not line.strip():
            continue
        tag, tag_date = line.split(" ", 1)
        entries.append((tag.lstrip("v"), tag_date))
    return entries


def build_releases_xml() -> str:
    today = date.today().isoformat()
    entries = [(current_version(), today)] + git_tag_entries()
    seen = set()
    lines = []
    for version, entry_date in entries:
        if version in seen:
            continue
        seen.add(version)
        lines.append(f'    <release version="{escape(version)}" date="{entry_date}" />')
    return "<releases>\n" + "\n".join(lines) + "\n  </releases>"


def build_screenshots_xml() -> str | None:
    repo = os.environ.get("GITHUB_REPOSITORY")  # владелец/репо — задан GitHub Actions сам
    if not repo or not os.path.isdir(SCREENSHOTS_DIR):
        return None
    files = sorted(
        f for f in os.listdir(SCREENSHOTS_DIR)
        if f.lower().endswith((".png", ".jpg", ".jpeg"))
    )
    if not files:
        return None
    lines = ["<screenshots>"]
    for i, fname in enumerate(files):
        url = f"https://raw.githubusercontent.com/{repo}/HEAD/flatpak_data/screenshots/{fname}"
        default_attr = ' type="default"' if i == 0 else ""
        lines.append(f"    <screenshot{default_attr}>")
        lines.append(f"      <image>{escape(url)}</image>")
        lines.append("    </screenshot>")
    lines.append("  </screenshots>")
    return "\n".join(lines)


def main() -> None:
    with open(METAINFO_PATH, encoding="utf-8") as f:
        content = f.read()

    content = re.sub(r"<releases>.*?</releases>", build_releases_xml(), content, flags=re.S)

    screenshots_xml = build_screenshots_xml()
    if screenshots_xml:
        if re.search(r"<screenshots>.*?</screenshots>", content, flags=re.S):
            content = re.sub(r"<screenshots>.*?</screenshots>", screenshots_xml, content, flags=re.S)
        else:
            content = content.replace("<releases>", screenshots_xml + "\n  <releases>", 1)

    with open(METAINFO_PATH, "w", encoding="utf-8") as f:
        f.write(content)

    print(f"metainfo.xml обновлён: версия={current_version()}, "
          f"скриншоты={'да' if screenshots_xml else 'нет (папка пуста или отсутствует)'}")


if __name__ == "__main__":
    main()
