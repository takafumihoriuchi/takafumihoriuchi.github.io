#!/usr/bin/env python3
"""Structural check across the language versions of the site.

This site has no build step. Translations are kept in sync by editing every
language in the same pass, which works but has one failure mode: a pass that
forgets a language leaves no trace. This script is that missing trace. It does
not read the translations — it cannot tell you a sentence is wrong — it tells
you a language is missing, stale in shape, or wired up incorrectly.

Run from the repository root:

    python3 scripts/check-i18n.py

Exit status is 0 when everything lines up, 1 otherwise.
"""

import html
import re
import sys
from pathlib import Path

SITE = "https://takafumihoriuchi.github.io"

# Display order is global reach, which is also the order the switcher uses.
# `dir` is only set where it differs from the document default.
# (code, directory, endonym, dir)
LANGS = [
    ("en",      "",        "English",          None),
    ("zh-Hans", "zh-Hans", "中文（简体）",       None),
    ("zh-Hant", "zh-Hant", "中文（繁體）",       None),
    ("es",      "es",      "Español",          None),
    ("ar",      "ar",      "العربية",           "rtl"),
    ("pt",      "pt",      "Português",        None),
    ("fr",      "fr",      "Français",         None),
    ("ja",      "ja",      "日本語",             None),
    ("ru",      "ru",      "Русский",          None),
    ("de",      "de",      "Deutsch",          None),
    ("id",      "id",      "Bahasa Indonesia", None),
    ("eo",      "eo",      "Esperanto",        None),
]

# Page groups: one entry per translatable page, as a path suffix under a
# language root. Add a line here when a work page is added.
PAGES = [
    "",
    "works/my-own-pokemon-generation/",
]

DEFAULT_LANG = "en"          # occupies the site root and the x-default slot


def page_path(root: Path, lang_dir: str, page: str) -> Path:
    return root / lang_dir / page / "index.html"


def page_url(lang_dir: str, page: str) -> str:
    return f"{SITE}/" + "".join(p for p in (lang_dir and lang_dir + "/", page) if p)


def attr(tag: str, name: str):
    m = re.search(rf'{name}\s*=\s*"([^"]*)"', tag)
    return html.unescape(m.group(1)) if m else None


def check() -> list:
    root = Path(__file__).resolve().parent.parent
    problems = []

    def bad(where, msg):
        problems.append(f"{where}: {msg}")

    for page in PAGES:
        expected_alts = {}
        for code, d, _, _ in LANGS:
            expected_alts[code] = page_url(d, page)
        expected_alts["x-default"] = page_url("", page)

        # Section shape is compared against the default language, which is the
        # source the translations are made from.
        reference_h2 = None

        for code, d, endonym, direction in LANGS:
            path = page_path(root, d, page)
            where = str(path.relative_to(root))

            if not path.exists():
                bad(where, "missing")
                continue

            src = path.read_text(encoding="utf-8")

            # <html lang> and dir
            m = re.search(r"<html\b[^>]*>", src)
            if not m:
                bad(where, "no <html> tag")
                continue
            if attr(m.group(0), "lang") != code:
                bad(where, f'<html lang> is {attr(m.group(0), "lang")!r}, expected {code!r}')
            if attr(m.group(0), "dir") != direction:
                bad(where, f'<html dir> is {attr(m.group(0), "dir")!r}, expected {direction!r}')

            # canonical and og:url must both point at this page
            want = page_url(d, page)
            canon = next(
                (attr(t, "href") for t in re.findall(r"<link\b[^>]*>", src)
                 if attr(t, "rel") == "canonical"), None)
            if canon != want:
                bad(where, f"canonical is {canon!r}, expected {want!r}")

            og_url = next(
                (attr(t, "content") for t in re.findall(r"<meta\b[^>]*>", src)
                 if attr(t, "property") == "og:url"), None)
            if og_url != want:
                bad(where, f"og:url is {og_url!r}, expected {want!r}")

            # hreflang set must be complete and identical on every version;
            # one missing link silently voids the whole cluster.
            alts = {}
            for tag in re.findall(r"<link\b[^>]*>", src):
                if attr(tag, "rel") == "alternate" and attr(tag, "hreflang"):
                    alts[attr(tag, "hreflang")] = attr(tag, "href")
            for k, v in expected_alts.items():
                if k not in alts:
                    bad(where, f"hreflang {k} missing")
                elif alts[k] != v:
                    bad(where, f"hreflang {k} points at {alts[k]!r}, expected {v!r}")
            for k in alts.keys() - expected_alts.keys():
                bad(where, f"hreflang {k} is not a language of this site")

            # Switcher: every language present, current one not a link.
            for c2, d2, endo2, _ in LANGS:
                if c2 == code:
                    continue
                if f'href="{page_url(d2, page)}"' not in src and endo2 not in src:
                    bad(where, f"language switcher has no entry for {c2}")

            # Shape: same number of sections and headings as the source.
            h2 = len(re.findall(r"<h2\b", src))
            if code == DEFAULT_LANG:
                reference_h2 = h2
            elif reference_h2 is not None and h2 != reference_h2:
                bad(where, f"{h2} <h2> headings, source has {reference_h2} "
                           "— a section is missing or extra")

    return problems


if __name__ == "__main__":
    found = check()
    if found:
        print(f"{len(found)} problem(s):\n")
        for p in found:
            print("  " + p)
        sys.exit(1)
    print(f"OK — {len(LANGS)} languages x {len(PAGES)} pages line up")
