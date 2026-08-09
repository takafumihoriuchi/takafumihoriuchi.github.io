#!/usr/bin/env python3
"""Rewrite the two mechanical blocks that every language version must carry.

This is not a build step. The site in the repository is finished HTML and is
served exactly as committed; this only edits that HTML in place, the way a
find-and-replace would. What it removes is the one part of a twelve-language
site that cannot be done reliably by hand: the alternates are a 12x12 matrix
where a single missing link makes search engines discard the whole cluster, and
the switcher is twelve entries repeated on twenty-four pages.

    python3 scripts/wire-i18n.py            # rewrite every page
    python3 scripts/wire-i18n.py --check    # report what would change, write nothing

Everything else about a page — its prose, its title, its byline — is written by
hand in that page's own language and is never touched here.
"""

import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from langs import LANGS, PAGES, DEFAULT_LANG, page_url, rel_path  # noqa: E402

ALT_RE = re.compile(
    r'[ \t]*<link rel="alternate" hreflang="[^"]*" href="[^"]*">\n(?:[ \t]*<link rel="alternate" hreflang="[^"]*" href="[^"]*">\n)*'
)
SWITCHER_RE = re.compile(r'[ \t]*<ul class="langs">.*?</ul>\n', re.S)
CANONICAL_RE = re.compile(r'[ \t]*<link rel="canonical" href="[^"]*">\n')
COPYRIGHT_RE = re.compile(r'([ \t]*)<p>(?:<span dir="ltr">)?© ')


def alternates(page: str) -> str:
    lines = [f'<link rel="alternate" hreflang="x-default" href="{page_url("", page)}">']
    for code, d, _, _ in LANGS:
        lines.append(f'<link rel="alternate" hreflang="{code}" href="{page_url(d, page)}">')
    return "".join(line + "\n" for line in lines)


def switcher(current: str, page: str, indent: str) -> str:
    out = [f'{indent}<ul class="langs">']
    for code, d, endonym, _ in LANGS:
        if code == current:
            out.append(
                f'{indent}  <li><span lang="{code}" translate="no" aria-current="true">{endonym}</span></li>'
            )
        else:
            here = next(x[1] for x in LANGS if x[0] == current)
            href = rel_path(here, page, d)
            out.append(
                f'{indent}  <li><a lang="{code}" hreflang="{code}" translate="no" href="{href}">{endonym}</a></li>'
            )
    out.append(f"{indent}</ul>")
    return "\n".join(out) + "\n"


def wire(src: str, code: str, page: str) -> str:
    # Alternates: replace the existing run, or insert right after canonical.
    if ALT_RE.search(src):
        src = ALT_RE.sub(lambda _: alternates(page), src, count=1)
    else:
        m = CANONICAL_RE.search(src)
        if not m:
            raise SystemExit(f"no canonical link to anchor alternates to ({code} {page!r})")
        src = src[: m.end()] + alternates(page) + src[m.end():]

    # Switcher: replace, or insert immediately above the copyright line.
    m = COPYRIGHT_RE.search(src)
    if not m:
        raise SystemExit(f"no copyright line to anchor the switcher to ({code} {page!r})")
    indent = m.group(1)
    if SWITCHER_RE.search(src):
        src = SWITCHER_RE.sub(lambda _: switcher(code, page, indent), src, count=1)
    else:
        src = src[: m.start()] + switcher(code, page, indent) + src[m.start():]
    return src


def main() -> int:
    check_only = "--check" in sys.argv
    root = Path(__file__).resolve().parent.parent
    changed, missing = [], []

    for page in PAGES:
        for code, d, _, _ in LANGS:
            path = root / d / page / "index.html"
            if not path.exists():
                missing.append(str(path.relative_to(root)))
                continue
            before = path.read_text(encoding="utf-8")
            after = wire(before, code, page)
            if after != before:
                changed.append(str(path.relative_to(root)))
                if not check_only:
                    path.write_text(after, encoding="utf-8")

    for m in missing:
        print(f"  skipped (does not exist yet): {m}")
    verb = "would rewrite" if check_only else "rewrote"
    print(f"{verb} {len(changed)} file(s)" + ("" if not changed else ":"))
    for c in changed:
        print("  " + c)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
