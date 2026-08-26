# ASCII hero

The illustration between each page header and its first section is real text.
`ascii-hero.js` replaces the contents of a `<pre>` at 10 frames per second;
there is no canvas, SVG, image, or video renderer.

## Scenes

`scenes.json` contains one scene per page concept:

- `philosophy`
- `personal-fit-ui`
- `pokemon-generation`
- `masters-thesis`
- `constraint-programming`

Every scene has `wide` and `compact` final frames. The engine selects the
compact frame below 480 CSS pixels. Frames must use printable ASCII only. The
animation starts with the complete frame already visible and runs as a quiet
idle loop. Line glyphs wobble in place and the emphasis pulse returns
periodically; character positions never change, so the drawing does not
reflow. A scene can set `idleWobble` to `false` when its geometry needs to stay
precise, or to `subtle` for a slower, lower-density movement of line glyphs.

A scene may also define `frameDuration` and complete `frames` for motion that
changes the composition rather than individual glyphs. Every frame uses the
same row count and is padded to one shared grid, keeping the page geometry
fixed. The base `lines` remain the no-JavaScript and reduced-motion frame.

## Page wiring

Run:

```sh
python3 scripts/wire-ascii.py
```

This adds the shared module and embeds each scene's wide final frame as a
no-JavaScript fallback. It is safe to rerun. `--check` reports drift without
writing.

Validate the scene data and all 70 translated page integrations with:

```sh
python3 scripts/check-ascii.py
```

When the element is off screen or its tab is hidden, the loop pauses. When
`prefers-reduced-motion: reduce` is active, the engine skips animation and
displays the selected final frame. ASCII is forced to left-to-right even inside
the Arabic pages; all surrounding page direction remains unchanged.
