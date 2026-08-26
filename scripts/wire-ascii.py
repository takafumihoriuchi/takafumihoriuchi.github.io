#!/usr/bin/env python3
"""Wire the shared text-animation hero into every translated page.

The site is committed as finished HTML. This script performs the two
mechanical edits that must stay identical across all language copies:

    python3 scripts/wire-ascii.py          # rewrite pages in place
    python3 scripts/wire-ascii.py --check  # report drift, write nothing

It inserts the appropriate scene immediately after the page header and adds
the shared module to the head. The final wide frame is embedded as real text,
so the illustration remains present when JavaScript is unavailable.
"""

from __future__ import annotations

import html
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from langs import LANGS, PAGES  # noqa: E402


SCENE_FOR_PAGE = {
    "": "philosophy",
    "works/personal-fit-ui/": "personal-fit-ui",
    "works/my-own-pokemon-generation/": "pokemon-generation",
    "works/masters-thesis-hmi-design/": "masters-thesis",
    "works/bachelors-thesis-constraint-programming/": "constraint-programming",
}

MODULE = '<script type="module" src="/ascii/ascii-hero.js"></script>'
MODULE_RE = re.compile(r'\n?<script\s+type="module"\s+src="/ascii/ascii-hero\.js"></script>\n?')
HERO_RE = re.compile(
    r'\n(?:[ \t]*\n)*[ \t]*<ascii-hero\b.*?</ascii-hero>[ \t]*\n+', re.S
)
HEADER_END_RE = re.compile(r'([ \t]*</header>)')


def hero(scene_id: str, scenes: dict) -> str:
    lines = scenes[scene_id]["variants"]["wide"]["lines"]
    fallback = html.escape("\n".join(line.rstrip() for line in lines))
    return (
        f'  <ascii-hero data-scene="{scene_id}" dir="ltr" '
        'translate="no" aria-hidden="true">\n'
        '    <pre class="ascii-hero__canvas" aria-hidden="true" translate="no">'
        f'{fallback}</pre>\n'
        '  </ascii-hero>'
    )


def wire(source: str, scene_id: str, scenes: dict) -> str:
    # Keep one module tag, anchored at the end of the head.
    source = MODULE_RE.sub("\n", source)
    if "</head>" not in source:
        raise ValueError("no </head> anchor")
    source = source.replace("</head>", f"{MODULE}\n</head>", 1)

    markup = "\n\n" + hero(scene_id, scenes) + "\n\n"
    if HERO_RE.search(source):
        source = HERO_RE.sub(markup, source, count=1)
    else:
        match = HEADER_END_RE.search(source)
        if not match:
            raise ValueError("no </header> anchor")
        source = source[: match.end()] + markup + source[match.end():]
    return source


def main() -> int:
    check_only = "--check" in sys.argv
    root = Path(__file__).resolve().parent.parent
    scenes = json.loads((root / "ascii" / "scenes.json").read_text(encoding="utf-8"))
    changed: list[str] = []

    for page in PAGES:
        scene_id = SCENE_FOR_PAGE[page]
        for _, directory, _, _ in LANGS:
            path = root / directory / page / "index.html"
            if not path.exists():
                continue
            before = path.read_text(encoding="utf-8")
            try:
                after = wire(before, scene_id, scenes)
            except ValueError as error:
                raise SystemExit(f"{path.relative_to(root)}: {error}") from error
            if after != before:
                changed.append(str(path.relative_to(root)))
                if not check_only:
                    path.write_text(after, encoding="utf-8")

    verb = "would rewrite" if check_only else "rewrote"
    print(f"{verb} {len(changed)} file(s)" + (":" if changed else ""))
    for path in changed:
        print(f"  {path}")
    return 1 if check_only and changed else 0


if __name__ == "__main__":
    raise SystemExit(main())
