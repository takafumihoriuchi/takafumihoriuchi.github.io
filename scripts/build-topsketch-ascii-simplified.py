#!/usr/bin/env python3
"""Render a hand-curated, simplified ASCII interpretation as responsive SVG."""

from __future__ import annotations

import html
import textwrap
from pathlib import Path


SVG_WIDTH = 600
SVG_HEIGHT = 200
ACCENT = "#7c6553"
DARK_ACCENT = "#b49780"


DESKTOP = r"""
          _______
     o---/       \              .--------.   .--------.   .------.
    /|\                         /                                  \
    / \             .----------       ( )       /\       ~~~~      \                 o
                   /                                                \               /|\
                  |       { }           @          [ ]               |             / |
                  |             o             ____          (  )------------------/  |
                  |                         /    \                                  / \
                  |       /\               (      )       ~~~
                   \                                                    /
                    '-----.       .----------.       .--------.--------'
"""


MOBILE = r"""
       _____                 .----.   .----.
   o--/     \               /               \             o
  /|\        .-------------    ()  /\  ~     \           /|\
  / \       /       {}       @    []          |         / |
           |             o          ()-----------------/  |
           |        /\        (__)      ~              / \
            \                                          /
             '----.       .------.       .------------'
"""


def lines(template: str) -> list[str]:
    result = textwrap.dedent(template).strip("\n").splitlines()
    width = max(len(line) for line in result)
    return [line.ljust(width) for line in result]


def render_svg(template: str, label: str) -> str:
    art = lines(template)
    rows = len(art)
    columns = len(art[0])
    cell_width = SVG_WIDTH / columns

    # Keep the character cells close to the natural proportions of the bundled
    # monospace fonts, then center the compact drawing vertically.
    font_size = cell_width / 0.62 * 0.88
    line_height = font_size * 1.24
    art_height = rows * line_height
    top = (SVG_HEIGHT - art_height) / 2

    glyphs: list[str] = []
    for row, line in enumerate(art):
        for column, character in enumerate(line):
            if character == " ":
                continue
            x = (column + 0.5) * cell_width
            y = top + (row + 0.5) * line_height
            glyphs.append(
                f'    <text x="{x:.2f}" y="{y:.2f}">{html.escape(character)}</text>'
            )

    glyph_markup = "\n".join(glyphs)
    return f'''<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg"
     viewBox="0 0 {SVG_WIDTH} {SVG_HEIGHT}"
     width="{SVG_WIDTH}" height="{SVG_HEIGHT}"
     role="img" aria-labelledby="title desc"
     preserveAspectRatio="xMidYMid meet">
  <title id="title">制約型デザインの簡潔なASCIIスケッチ（{label}）</title>
  <desc id="desc">左側の人が可能性の境界を組み立て、右側の人が境界の内側にある一つの形を選ぶ様子。</desc>
  <style>
    text {{
      fill: {ACCENT};
      stroke: {ACCENT};
      stroke-width: 0.18px;
      paint-order: stroke fill;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas,
                   "Liberation Mono", "Courier New", monospace;
      font-size: {font_size:.3f}px;
      font-weight: 500;
      text-anchor: middle;
      dominant-baseline: central;
    }}
    @media (prefers-color-scheme: dark) {{
      text {{ fill: {DARK_ACCENT}; stroke: {DARK_ACCENT}; }}
    }}
  </style>
  <g aria-hidden="true" focusable="false">
{glyph_markup}
  </g>
</svg>
'''


def main() -> None:
    output_directory = Path(__file__).resolve().parent.parent / "assets"
    output_directory.mkdir(parents=True, exist_ok=True)
    variants = {
        "desktop": (DESKTOP, "PC向け"),
        "mobile": (MOBILE, "スマートフォン向け"),
    }
    for name, (template, label) in variants.items():
        output = output_directory / f"topsketch-ascii-simplified-{name}.svg"
        output.write_text(render_svg(template, label), encoding="utf-8")
        art = lines(template)
        print(f"{output}: {len(art[0])} columns x {len(art)} rows")


if __name__ == "__main__":
    main()
