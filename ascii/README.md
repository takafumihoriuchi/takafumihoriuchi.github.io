# ASCII hero

The illustration between each page header and its first section is real text.
`ascii-hero.js` replaces the contents of a `<pre>` at 10 frames per second;
there is no canvas, SVG, image, or video renderer.

Every language page also contains a load reveal. The renderer in
`ascii-text-reveal.js` covers semantic text and images with temporary
canvases. Fixed ASCII cells switch through stepped glyph states while
deterministically shuffled windows reveal the real DOM underneath. Text and
image effects begin together during page initialization, including elements
below the fold. Every temporary canvas completes and is removed on that single
absolute load timeline, so dropped frames cannot extend the effect and
scrolling later never starts a second reveal. Glyph size,
weight, colour and line spacing come from the primary ASCII hero so the whole
page reads as one system.

The load reveal runs at 12fps in every language for twice as many stepped
intermediate states as the original 6fps treatment, while retaining the same
625ms formation deadline, per-grapheme timing, and ASCII cell size.

Each document adds `ascii-load-pending` synchronously in its head.
The shared stylesheet turns that state into a full-viewport background cover,
preventing the semantic DOM from flashing before the module can build its
canvases. The renderer removes the class immediately after all covers are
prepared; a 2.5-second inline fallback releases it if module loading fails.
With JavaScript disabled the class is never added, so the HTML fallback remains
visible.

The module entry point, its imports, and `scenes.json` use one shared query
version. Its canonical value lives in `scripts/ascii_config.py`; bump that and
the matching query literals in `ascii-hero.js` and `ascii-text-reveal.js`
whenever load-renderer behavior changes. The wiring check rejects import URLs
that do not match it. Versioning the entire module graph prevents an older
language-gated child module from being combined with newer HTML that already
enabled the pre-paint guard.

On every language page each `ascii-hero` uses its own canonical padded grid for the
same sparse-to-formed introduction. Its final introduction frame is exactly
the scene's base `lines`; only after that frame is painted does the existing
idle loop begin in the same `<pre>`. No overlay or DOM swap occurs at this
handoff.

## File layout

- `ascii-hero.js` is the reusable browser component. It owns responsive
  sizing, theme switching, reduced-motion behavior, visibility pausing, and
  frame playback.
- `ascii-layout.js` contains the shared cell-width and grid-fit calculation
  used by both the scene renderer and the load-reveal PoC.
- `ascii-text-reveal.js` is the Japanese page-load renderer. It reads grapheme
  positions from the live DOM, builds text masks for ASCII particles, tiles
  image rectangles with the shared cell grid, and removes each decorative
  canvas after the staggered DOM reveal completes.
- `scenes.json` contains only drawings and animation settings. Adding a work
  does not require changing the component.
- `page-scenes.json` is the single route-to-scene manifest used by both the
  wiring and validation scripts.
- `scripts/wire-ascii.py` inserts the component and its text fallback into all
  language copies.
- `scripts/check-ascii.py` validates scene dimensions, printable characters,
  route mappings, fallbacks, and placement across the site.

## Scenes

`scenes.json` contains one scene per page concept:

- `philosophy`
- `footer-rest`
- `personal-fit-ui`
- `pokemon-generation`
- `masters-thesis`
- `constraint-programming`

Every scene has `wide` and `compact` final frames. The engine selects the
compact frame below 480 CSS pixels. Frames must use printable ASCII only. The
Each scene first forms on its canonical grid, holds the exact complete frame,
and then enters the quiet idle loop.
Line glyphs wobble in place and the emphasis pulse returns
periodically; character positions never change, so the drawing does not
reflow. A scene can set `idleWobble` to `false` when its geometry needs to stay
precise, or to `subtle` for a slower, lower-density movement of line glyphs.

A scene may also define `frameDuration` and complete `frames` for motion that
changes the composition rather than individual glyphs. Every frame uses the
same row count and is padded to one shared grid, keeping the page geometry
fixed. The base `lines` remain the no-JavaScript and reduced-motion frame.

A size variant may replace `lines` and `frames` with `themes.light` and
`themes.dark`. The engine follows `prefers-color-scheme`, updates a running
scene if the system theme changes, and requires both themes to use an equal
grid. The committed HTML fallback uses the light theme.

## Adding an animation to a new work

1. Add the work route to `PAGES` in `scripts/langs.py` as part of creating the
   translated pages.
2. Add one scene to `scenes.json`. Give it both `wide` and `compact` variants;
   `lines` is the complete initial and fallback drawing, while optional
   `frames` provide the loop.
3. Add one route-to-scene entry to `page-scenes.json`.
4. Run `python3 scripts/wire-ascii.py` to update every language copy.
5. Run `python3 scripts/check-ascii.py` before committing.

The smallest reusable scene shape is:

```json
{
  "new-work": {
    "idlePulseInterval": 3600,
    "frameDuration": 850,
    "idleWobble": false,
    "variants": {
      "wide": { "lines": ["complete wide drawing"], "frames": [] },
      "compact": { "lines": ["compact drawing"], "frames": [] }
    }
  }
}
```

Use `idleWobble: "subtle"` for small in-place glyph changes, or complete
`frames` when the composition itself must move. Theme-specific scenes put
matching `light` and `dark` configurations under each size variant's `themes`
object. Wide drawings may use at most 100 columns; compact drawings may use at
most 64.

Set an optional `gridColumns` on a size variant when two scenes must use the
same glyph scale even though one drawing is narrower. It must be at least as
wide as every frame. The renderer pads the in-memory grid to that width; the
JSON lines themselves still have no trailing spaces.

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
