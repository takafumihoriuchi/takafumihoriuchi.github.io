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


def main() -> int:
    root = Path(__file__).resolve().parent.parent
    scenes = json.loads((root / "ascii" / "scenes.json").read_text(encoding="utf-8"))
    manifest = json.loads(
        (root / "ascii" / "page-scenes.json").read_text(encoding="utf-8")
    )
    page_scenes = manifest.get("pages", {})
    footer_scene_id = manifest.get("homeFooter")
    problems: list[str] = []

    def bad(where: str, message: str) -> None:
        problems.append(f"{where}: {message}")

    def light_wide_lines(scene_id: str) -> list[str]:
        variant = scenes[scene_id]["variants"]["wide"]
        return variant.get("themes", {}).get("light", variant)["lines"]

    for page in sorted(set(PAGES) - set(page_scenes)):
        bad("ascii/page-scenes.json", f"missing page route {page!r}")
    for page in sorted(set(page_scenes) - set(PAGES)):
        bad("ascii/page-scenes.json", f"unknown page route {page!r}")
    for page, scene_id in page_scenes.items():
        if scene_id not in scenes:
            bad(
                "ascii/page-scenes.json",
                f"page route {page!r} references unknown scene {scene_id!r}",
            )
    if footer_scene_id not in scenes:
        bad(
            "ascii/page-scenes.json",
            f"homeFooter references unknown scene {footer_scene_id!r}",
        )

    for scene_id, scene in scenes.items():
        where = f"ascii/scenes.json#{scene_id}"
        if not 1500 <= scene.get("idlePulseInterval", 0) <= 10000:
            bad(where, "idlePulseInterval must be between 1.5 and 10 seconds")
        frame_duration = scene.get("frameDuration")
        if frame_duration is not None and not 150 <= frame_duration <= 2000:
            bad(where, "frameDuration must be between 150ms and 2 seconds")
        idle_wobble = scene.get("idleWobble")
        if idle_wobble not in (None, True, False, "subtle"):
            bad(where, 'idleWobble must be true, false, or "subtle"')
        for name, maximum in (("wide", 100), ("compact", 64)):
            variant = scene.get("variants", {}).get(name)
            if not variant:
                bad(where, f"missing {name} variant")
                continue
            themes = variant.get("themes")
            if themes is not None:
                if set(themes) != {"light", "dark"}:
                    bad(where, f"{name} themes must contain light and dark")
                frame_sets = [(theme, config) for theme, config in themes.items()]
            else:
                frame_sets = [("default", variant)]

            dimensions: set[tuple[int, int]] = set()
            for theme, config in frame_sets:
                label_prefix = name if theme == "default" else f"{name}/{theme}"
                lines = config.get("lines", [])
                if not lines:
                    bad(where, f"{label_prefix} has no lines")
                    continue
                frames = config.get("frames", [])
                for index, frame in enumerate(frames, 1):
                    if len(frame) != len(lines):
                        bad(
                            where,
                            f"{label_prefix} frame {index} must have {len(lines)} rows",
                        )
                all_lines = lines + [line for frame in frames for line in frame]
                measured_width = max(map(len, all_lines))
                grid_columns = config.get(
                    "gridColumns", variant.get("gridColumns", measured_width)
                )
                if not isinstance(grid_columns, int) or grid_columns < measured_width:
                    bad(
                        where,
                        f"{label_prefix} gridColumns must be an integer at least "
                        f"{measured_width}",
                    )
                    grid_columns = measured_width
                dimensions.add((len(lines), grid_columns))
                if grid_columns > maximum:
                    bad(
                        where,
                        f"{label_prefix} is {grid_columns} columns; maximum is {maximum}",
                    )
                for frame_index, frame in enumerate([lines, *frames]):
                    label = "fallback" if frame_index == 0 else f"frame {frame_index}"
                    for row, line in enumerate(frame, 1):
                        if line.rstrip() != line:
                            bad(
                                where,
                                f"{label_prefix} {label} row {row} has trailing spaces",
                            )
                        if any(
                            ord(character) < 32 or ord(character) > 126
                            for character in line
                        ):
                            bad(
                                where,
                                f"{label_prefix} {label} row {row} contains a non-ASCII character",
                            )
                emphasis = config.get("emphasis")
                if emphasis and not any(emphasis["token"] in line for line in lines):
                    bad(
                        where,
                        f"{label_prefix} emphasis token is absent from its fallback frame",
                    )
            if themes is not None and len(dimensions) > 1:
                bad(where, f"{name} light and dark grids must have equal dimensions")

    for page in PAGES:
        expected_scene = page_scenes.get(page)
        if expected_scene not in scenes:
            continue
        expected_fallback = "\n".join(
            line.rstrip() for line in light_wide_lines(expected_scene)
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
            expected_count = 2 if page == "" else 1
            if len(heroes) != expected_count:
                bad(where, f"has {len(heroes)} ASCII heroes, expected {expected_count}")
                continue
            primary = next(
                (item for item in heroes if 'data-placement="footer"' not in item),
                None,
            )
            if primary is None or f'data-scene="{expected_scene}"' not in primary:
                bad(where, f"does not use scene {expected_scene!r}")
                continue
            fallback_match = re.search(r"<pre\b[^>]*>(.*?)</pre>", primary, re.S)
            fallback = html.unescape(fallback_match.group(1)) if fallback_match else None
            if fallback != expected_fallback:
                bad(where, "fallback frame differs from the scene's wide final frame")

            header_end = source.find("</header>")
            hero_start = source.find("<ascii-hero")
            first_section = source.find("<section", header_end)
            if not (header_end < hero_start < first_section):
                bad(where, "ASCII hero is not between the header and first section")

            footer_heroes = [
                item for item in heroes if 'data-placement="footer"' in item
            ]
            if page == "":
                footer_hero = footer_heroes[0]
                if f'data-scene="{footer_scene_id}"' not in footer_hero:
                    bad(where, f"footer does not use scene {footer_scene_id!r}")
                footer_fallback_match = re.search(
                    r"<pre\b[^>]*>(.*?)</pre>", footer_hero, re.S
                )
                footer_fallback = (
                    html.unescape(footer_fallback_match.group(1))
                    if footer_fallback_match
                    else None
                )
                expected_footer_fallback = "\n".join(
                    line.rstrip() for line in light_wide_lines(footer_scene_id)
                )
                if footer_fallback != expected_footer_fallback:
                    bad(where, "footer fallback differs from its light wide frame")
                footer_hero_start = source.find(
                    f'<ascii-hero data-scene="{footer_scene_id}"'
                )
                last_section_end = source.rfind("</section>")
                footer_start = source.find("<footer", last_section_end)
                if not (last_section_end < footer_hero_start < footer_start):
                    bad(where, "footer ASCII is not between the final section and footer")

    if problems:
        print(f"{len(problems)} problem(s):\n")
        for problem in problems:
            print(f"  {problem}")
        return 1
    print(f"OK — {len(scenes)} ASCII scenes wired across {len(LANGS) * len(PAGES)} pages")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
