#!/usr/bin/env python3
"""Wire the shared text-animation hero into every translated page.

The site is committed as finished HTML. This script performs the two
mechanical edits that must stay identical across all language copies:

    python3 scripts/wire-ascii.py          # rewrite pages in place
    python3 scripts/wire-ascii.py --check  # report drift, write nothing

It reads the route-to-scene mapping from ascii/page-scenes.json, inserts the
appropriate scene immediately after the page header, adds the home-page
epilogue immediately before its footer, and adds both the pre-paint guard and
shared module to the head. The light-mode wide frame is embedded as real text,
so each illustration remains present when JavaScript is unavailable.
"""

from __future__ import annotations

import html
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from ascii_config import ASSET_VERSION, MODULE, PREPAINT  # noqa: E402
from langs import LANGS, PAGES  # noqa: E402


MODULE_RE = re.compile(
    r'\n?<script\s+type="module"\s+src="/ascii/ascii-hero\.js'
    r'(?:\?v=[^"]+)?"></script>\n?'
)
PREPAINT_RE = re.compile(
    r'\n?<script>document\.documentElement\.classList\.add\('
    r'"ascii-load-pending"\);setTimeout\(\(\)=>document\.documentElement'
    r'\.classList\.remove\("ascii-load-pending"\),2500\);</script>\n?'
)
VIEWPORT_RE = re.compile(r'<meta\s+name="viewport"\s+content="[^"]+">')
PRIMARY_HERO_RE = re.compile(
    r'\n(?:[ \t]*\n)*[ \t]*<ascii-hero\b'
    r'(?![^>]*\bdata-placement="footer").*?</ascii-hero>[ \t]*\n+',
    re.S,
)
FOOTER_HERO_RE = re.compile(
    r'\n(?:[ \t]*\n)*[ \t]*<ascii-hero\b'
    r'(?=[^>]*\bdata-placement="footer").*?</ascii-hero>[ \t]*\n+',
    re.S,
)
HEADER_END_RE = re.compile(r'([ \t]*</header>)')
FOOTER_START_RE = re.compile(r'([ \t]*<footer\b)')


def hero(scene_id: str, scenes: dict, *, placement: str | None = None) -> str:
    variant = scenes[scene_id]["variants"]["wide"]
    variant = variant.get("themes", {}).get("light", variant)
    lines = variant["lines"]
    fallback = html.escape("\n".join(line.rstrip() for line in lines))
    placement_attr = f' data-placement="{placement}"' if placement else ""
    return (
        f'  <ascii-hero data-scene="{scene_id}"{placement_attr} dir="ltr" '
        'translate="no" aria-hidden="true">\n'
        '    <pre class="ascii-hero__canvas" aria-hidden="true" translate="no">'
        f'{fallback}</pre>\n'
        '  </ascii-hero>'
    )


def wire(
    source: str,
    page: str,
    scene_id: str,
    footer_scene_id: str,
    scenes: dict,
) -> str:
    # Add the synchronous guard immediately after the viewport declaration so
    # it is active before a render-blocking stylesheet can permit first paint.
    source = PREPAINT_RE.sub("\n", source)
    viewport = VIEWPORT_RE.search(source)
    if not viewport:
        raise ValueError("no viewport meta anchor")
    source = source[: viewport.end()] + "\n" + PREPAINT + source[viewport.end():]

    # Keep one module tag, anchored at the end of the head.
    source = MODULE_RE.sub("\n", source)
    if "</head>" not in source:
        raise ValueError("no </head> anchor")
    source = source.replace("</head>", f"{MODULE}\n</head>", 1)

    markup = "\n\n" + hero(scene_id, scenes) + "\n\n"
    if PRIMARY_HERO_RE.search(source):
        source = PRIMARY_HERO_RE.sub(markup, source, count=1)
    else:
        match = HEADER_END_RE.search(source)
        if not match:
            raise ValueError("no </header> anchor")
        source = source[: match.end()] + markup + source[match.end():]

    if page == "":
        footer_markup = (
            "\n\n"
            + hero(footer_scene_id, scenes, placement="footer")
            + "\n\n"
        )
        if FOOTER_HERO_RE.search(source):
            source = FOOTER_HERO_RE.sub(footer_markup, source, count=1)
        else:
            match = FOOTER_START_RE.search(source)
            if not match:
                raise ValueError("no <footer> anchor")
            source = (
                source[: match.start()].rstrip()
                + footer_markup
                + source[match.start():]
            )
    else:
        source = FOOTER_HERO_RE.sub("\n\n", source)
    return source


def main() -> int:
    check_only = "--check" in sys.argv
    root = Path(__file__).resolve().parent.parent
    version_token = f"?v={ASSET_VERSION}"
    versioned_sources = {
        "ascii/ascii-hero.js": 3,
        "ascii/ascii-text-reveal.js": 1,
        # The index's works panel dissolves its control with the same renderer,
        # so it is part of the same module graph and carries the same version.
        "works-panel.js": 1,
    }
    for relative_path, expected_count in versioned_sources.items():
        source = (root / relative_path).read_text(encoding="utf-8")
        actual_count = source.count(version_token)
        if actual_count != expected_count:
            raise SystemExit(
                f"{relative_path}: expected {expected_count} references to "
                f"{version_token}, found {actual_count}"
            )
    scenes = json.loads((root / "ascii" / "scenes.json").read_text(encoding="utf-8"))
    manifest = json.loads(
        (root / "ascii" / "page-scenes.json").read_text(encoding="utf-8")
    )
    page_scenes = manifest.get("pages", {})
    footer_scene_id = manifest.get("homeFooter")

    missing_pages = sorted(set(PAGES) - set(page_scenes))
    extra_pages = sorted(set(page_scenes) - set(PAGES))
    if missing_pages or extra_pages:
        raise SystemExit(
            "ascii/page-scenes.json and scripts/langs.py PAGES differ: "
            f"missing={missing_pages}, extra={extra_pages}"
        )
    unknown_scenes = sorted(
        {scene_id for scene_id in page_scenes.values() if scene_id not in scenes}
    )
    if footer_scene_id not in scenes:
        unknown_scenes.append(str(footer_scene_id))
    if unknown_scenes:
        raise SystemExit(
            "ascii/page-scenes.json references unknown scenes: "
            + ", ".join(unknown_scenes)
        )

    changed: list[str] = []

    for page in PAGES:
        scene_id = page_scenes[page]
        for _, directory, _, _ in LANGS:
            path = root / directory / page / "index.html"
            if not path.exists():
                continue
            before = path.read_text(encoding="utf-8")
            try:
                after = wire(
                    before,
                    page,
                    scene_id,
                    footer_scene_id,
                    scenes,
                )
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
