#!/usr/bin/env python3
"""Turn the transparent top sketch into responsive, fixed-layout ASCII SVGs."""

from __future__ import annotations

import argparse
import html
import math
from pathlib import Path

import numpy as np
from PIL import Image


SVG_WIDTH = 600
SVG_HEIGHT = 200
ACCENT = "#7c6553"
DARK_ACCENT = "#b49780"


def skeletonize(mask: np.ndarray) -> np.ndarray:
    """Zhang-Suen thinning on a boolean image."""
    image = mask.astype(np.uint8)

    while True:
        changed = False
        for phase in (0, 1):
            padded = np.pad(image, 1)
            p2 = padded[:-2, 1:-1]
            p3 = padded[:-2, 2:]
            p4 = padded[1:-1, 2:]
            p5 = padded[2:, 2:]
            p6 = padded[2:, 1:-1]
            p7 = padded[2:, :-2]
            p8 = padded[1:-1, :-2]
            p9 = padded[:-2, :-2]

            neighbours = p2 + p3 + p4 + p5 + p6 + p7 + p8 + p9
            transitions = (
                ((p2 == 0) & (p3 == 1))
                + ((p3 == 0) & (p4 == 1))
                + ((p4 == 0) & (p5 == 1))
                + ((p5 == 0) & (p6 == 1))
                + ((p6 == 0) & (p7 == 1))
                + ((p7 == 0) & (p8 == 1))
                + ((p8 == 0) & (p9 == 1))
                + ((p9 == 0) & (p2 == 1))
            )

            if phase == 0:
                preserve_a = p2 * p4 * p6 == 0
                preserve_b = p4 * p6 * p8 == 0
            else:
                preserve_a = p2 * p4 * p8 == 0
                preserve_b = p2 * p6 * p8 == 0

            remove = (
                (image == 1)
                & (neighbours >= 2)
                & (neighbours <= 6)
                & (transitions == 1)
                & preserve_a
                & preserve_b
            )
            if np.any(remove):
                image[remove] = 0
                changed = True

        if not changed:
            break

    return image.astype(bool)


def crop_to_aspect(alpha: Image.Image, aspect: float = 3.0) -> Image.Image:
    bbox = alpha.point(lambda value: 255 if value > 8 else 0).getbbox()
    if bbox is None:
        raise ValueError("The source image has no visible alpha pixels.")

    left, top, right, bottom = bbox
    content_width = right - left
    content_height = bottom - top
    center_x = (left + right) / 2
    center_y = (top + bottom) / 2

    # Preserve breathing room around the sketch, then expand to a 3:1 crop.
    crop_height = content_height * 1.16
    crop_width = max(content_width * 1.08, crop_height * aspect)
    crop_height = max(crop_height, crop_width / aspect)

    crop_width = min(crop_width, alpha.width)
    crop_height = min(crop_height, alpha.height)
    center_x = min(max(center_x, crop_width / 2), alpha.width - crop_width / 2)
    center_y = min(max(center_y, crop_height / 2), alpha.height - crop_height / 2)

    box = (
        round(center_x - crop_width / 2),
        round(center_y - crop_height / 2),
        round(center_x + crop_width / 2),
        round(center_y + crop_height / 2),
    )
    return alpha.crop(box)


def direction_character(points: np.ndarray, cell_width: float, cell_height: float) -> str:
    if len(points) < 3:
        return "."

    centered = points - points.mean(axis=0)
    covariance = centered.T @ centered
    values, vectors = np.linalg.eigh(covariance)
    largest = float(values[-1])
    smallest = float(values[0])

    if largest < 0.01:
        return "."
    if smallest / largest > 0.42:
        return "+"

    # Work in source-image coordinates so the direction is not distorted by
    # the tall cells of a monospace text grid.
    x, y = vectors[:, -1]
    angle = math.degrees(math.atan2(y, x)) % 180
    if angle < 22.5 or angle >= 157.5:
        return "-"
    if angle < 67.5:
        return "\\"
    if angle < 112.5:
        return "|"
    return "/"


def make_grid(skeleton: np.ndarray, columns: int) -> list[str]:
    rows = round(columns / 5)
    height, width = skeleton.shape
    cell_width = width / columns
    cell_height = height / rows
    ys, xs = np.nonzero(skeleton)
    all_points = np.column_stack((xs, ys))

    grid: list[list[str]] = [[" " for _ in range(columns)] for _ in range(rows)]
    for row in range(rows):
        y0 = row * cell_height
        y1 = (row + 1) * cell_height
        for column in range(columns):
            x0 = column * cell_width
            x1 = (column + 1) * cell_width
            inside = (
                (all_points[:, 0] >= x0)
                & (all_points[:, 0] < x1)
                & (all_points[:, 1] >= y0)
                & (all_points[:, 1] < y1)
            )
            if not np.any(inside):
                continue

            local = (
                (all_points[:, 0] >= x0 - cell_width)
                & (all_points[:, 0] < x1 + cell_width)
                & (all_points[:, 1] >= y0 - cell_height)
                & (all_points[:, 1] < y1 + cell_height)
            )
            grid[row][column] = direction_character(
                all_points[local], cell_width, cell_height
            )

    return ["".join(line).rstrip() for line in grid]


def svg_for_grid(lines: list[str], label: str) -> str:
    rows = len(lines)
    columns = max(len(line) for line in lines)
    cell_width = SVG_WIDTH / columns
    cell_height = SVG_HEIGHT / rows
    font_size = cell_height * 1.05

    glyphs: list[str] = []
    for row, line in enumerate(lines):
        for column, character in enumerate(line):
            if character == " ":
                continue
            x = (column + 0.5) * cell_width
            y = (row + 0.5) * cell_height
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
  <title id="title">制約型デザインのASCIIスケッチ（{label}）</title>
  <desc id="desc">人が可能性の境界を組み立て、その内側から一つの形を選ぶ様子をASCII文字で描いたスケッチ。</desc>
  <style>
    text {{
      fill: {ACCENT};
      stroke: {ACCENT};
      stroke-width: 0.22px;
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
  <g aria-hidden="true">
{glyph_markup}
  </g>
</svg>
'''


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path)
    parser.add_argument("output_directory", type=Path)
    args = parser.parse_args()

    source = Image.open(args.source).convert("RGBA")
    alpha = crop_to_aspect(source.getchannel("A"))
    working = alpha.resize((900, 300), Image.Resampling.LANCZOS)
    mask = np.asarray(working) >= 34
    skeleton = skeletonize(mask)

    args.output_directory.mkdir(parents=True, exist_ok=True)
    variants = {
        "desktop": (120, "PC向け"),
        "mobile": (72, "スマートフォン向け"),
    }
    for name, (columns, label) in variants.items():
        lines = make_grid(skeleton, columns)
        svg = svg_for_grid(lines, label)
        output = args.output_directory / f"topsketch-ascii-{name}.svg"
        output.write_text(svg, encoding="utf-8")
        print(f"{output}: {columns} columns x {len(lines)} rows")


if __name__ == "__main__":
    main()
