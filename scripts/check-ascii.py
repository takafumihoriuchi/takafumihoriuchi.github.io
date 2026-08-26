#!/usr/bin/env python3
"""Validate ASCII scene data and its wiring across every language page."""

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


def main() -> int:
    root = Path(__file__).resolve().parent.parent
    scenes = json.loads((root / "ascii" / "scenes.json").read_text(encoding="utf-8"))
    problems: list[str] = []

    def bad(where: str, message: str) -> None:
        problems.append(f"{where}: {message}")

    for scene_id, scene in scenes.items():
        where = f"ascii/scenes.json#{scene_id}"
        if not 1500 <= scene.get("idlePulseInterval", 0) <= 10000:
            bad(where, "idlePulseInterval must be between 1.5 and 10 seconds")
        for name, maximum in (("wide", 100), ("compact", 64)):
            variant = scene.get("variants", {}).get(name)
            if not variant:
                bad(where, f"missing {name} variant")
                continue
            lines = variant.get("lines", [])
            if not lines:
                bad(where, f"{name} has no lines")
                continue
            width = max(map(len, lines))
            if width > maximum:
                bad(where, f"{name} is {width} columns; maximum is {maximum}")
            for row, line in enumerate(lines, 1):
                if line.rstrip() != line:
                    bad(where, f"{name} row {row} has trailing spaces")
                if any(ord(character) < 32 or ord(character) > 126 for character in line):
                    bad(where, f"{name} row {row} contains a non-ASCII character")
            emphasis = variant.get("emphasis")
            if emphasis and not any(emphasis["token"] in line for line in lines):
                bad(where, f"{name} emphasis token is absent from its final frame")

    for page in PAGES:
        expected_scene = SCENE_FOR_PAGE[page]
        expected_fallback = "\n".join(
            line.rstrip() for line in scenes[expected_scene]["variants"]["wide"]["lines"]
        )
        for _, directory, _, _ in LANGS:
            path = root / directory / page / "index.html"
            if not path.exists():
                continue
            where = str(path.relative_to(root))
            source = path.read_text(encoding="utf-8")
            if source.count('src="/ascii/ascii-hero.js"') != 1:
                bad(where, "must load the ASCII module exactly once")
            heroes = re.findall(r"<ascii-hero\b.*?</ascii-hero>", source, re.S)
            if len(heroes) != 1:
                bad(where, f"has {len(heroes)} ASCII heroes, expected one")
                continue
            hero = heroes[0]
            if f'data-scene="{expected_scene}"' not in hero:
                bad(where, f"does not use scene {expected_scene!r}")
            fallback_match = re.search(r"<pre\b[^>]*>(.*?)</pre>", hero, re.S)
            fallback = html.unescape(fallback_match.group(1)) if fallback_match else None
            if fallback != expected_fallback:
                bad(where, "fallback frame differs from the scene's wide final frame")

            header_end = source.find("</header>")
            hero_start = source.find("<ascii-hero")
            first_section = source.find("<section", header_end)
            if not (header_end < hero_start < first_section):
                bad(where, "ASCII hero is not between the header and first section")

    if problems:
        print(f"{len(problems)} problem(s):\n")
        for problem in problems:
            print(f"  {problem}")
        return 1
    print(f"OK — {len(scenes)} ASCII scenes wired across {len(LANGS) * len(PAGES)} pages")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
