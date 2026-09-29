#!/usr/bin/env python3
"""Wire the shared appearance control, including translated accessible names.

Run scripts/wire-theme.py after adding a page; --check reports stale wiring.
Only the theme script and the control inside an existing home mark are owned
here. Prose and other scripts are left untouched.
"""
import html
import re
import sys
from pathlib import Path

LABELS = {
    "en": ("Appearance", "Light mode", "Dark mode"),
    "zh-Hans": ("外观", "浅色模式", "深色模式"),
    "zh-Hant": ("外觀", "淺色模式", "深色模式"),
    "es": ("Apariencia", "Modo claro", "Modo oscuro"),
    "ar": ("المظهر", "الوضع الفاتح", "الوضع الداكن"),
    "pt": ("Aparência", "Modo claro", "Modo escuro"),
    "fr": ("Apparence", "Mode clair", "Mode sombre"),
    "ja": ("表示テーマ", "ライトモード", "ダークモード"),
    "ko": ("화면 모드", "라이트 모드", "다크 모드"),
    "ru": ("Внешний вид", "Светлая тема", "Тёмная тема"),
    "de": ("Darstellung", "Heller Modus", "Dunkler Modus"),
    "it": ("Aspetto", "Modalità chiara", "Modalità scura"),
    "id": ("Tampilan", "Mode terang", "Mode gelap"),
    "eo": ("Aspekto", "Hela reĝimo", "Malhela reĝimo"),
}
CONTROL = re.compile(r'\n?  <div class="theme-toggle".*?</div>\n?', re.S)
SCRIPT = re.compile(r'<script src="[^"]*theme\.js"></script>\n')
MARK = re.compile(r'(<div class="home-mark">.*?</a>)(\s*</div>)', re.S)


def wire(source):
    stylesheet = re.search(r'<link rel="stylesheet" href="([^"]*)style\.css">', source)
    if not stylesheet:
        return source
    language = re.search(r'<html\b[^>]*lang="([^"]+)"', source).group(1)
    group, light, dark = [html.escape(label, quote=True) for label in LABELS[language]]
    source = SCRIPT.sub('', source)
    # Apply the preference ahead of the ASCII prepaint guard and stylesheet.
    viewport = re.search(r'<meta name="viewport"[^>]*>\n', source)
    script = f'<script src="{stylesheet.group(1)}theme.js"></script>\n'
    source = source[:viewport.end()] + script + source[viewport.end():]
    source = CONTROL.sub('', source)
    control = f'\n  <div class="theme-toggle" role="radiogroup" aria-label="{group}" dir="ltr" hidden>\n'
    for value, label, icon in (("light", light, "sun"), ("dark", dark, "moon")):
        control += (
            f'    <label title="{label}">\n'
            f'      <input type="radio" name="theme" value="{value}" aria-label="{label}">\n'
            f'      <span class="theme-toggle__icon theme-toggle__{icon}" aria-hidden="true"></span>\n'
            '    </label>\n'
        )
    control += '  </div>\n'
    return MARK.sub(lambda m: m.group(1) + control + '</div>', source, count=1)


def main():
    root = Path(__file__).resolve().parent.parent
    check = '--check' in sys.argv
    changed = []
    for path in sorted(root.rglob('*.html')):
        before = path.read_text(encoding='utf-8')
        after = wire(before)
        if before == after:
            continue
        changed.append(str(path.relative_to(root)))
        if not check:
            path.write_text(after, encoding='utf-8')
    print(f"Theme wiring: {len(changed)} {'stale' if check else 'updated'} page(s)")
    if check:
        for path in changed:
            print('  ' + path)
    return int(check and bool(changed))


if __name__ == '__main__':
    raise SystemExit(main())
