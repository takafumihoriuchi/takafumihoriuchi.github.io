import {
  ASCII_CELL_WIDTH_RATIO,
  fittedAsciiFontSize,
} from "./ascii-layout.js?v=20260906-6";
import "./ascii-text-reveal.js?v=20260906-6";
import {
  asciiLoadElapsed,
  asciiLoadHasStarted,
  asciiLoadStarted,
  holdAsciiLoad,
} from "./ascii-load-clock.js?v=20260906-6";

const SCENES_URL = new URL("./scenes.json?v=20260906-6", import.meta.url);
const FRAME_INTERVAL = 1000 / 10;
const INTRO_FRAME_INTERVAL = 1000 / 6;
const INTRO_DURATION = 625;
const COMPACT_BREAKPOINT = 480;
// How far a pointer may travel and still be a tap rather than a scroll or a
// drag across the selectable text of the <pre>.
const TAP_MOVE_TOLERANCE = 10;
// Densest first, then the same thinning the introduction climbs, read
// backwards. A cell falls one rung down the ramp per step until there is
// nothing left of it. `@` rather than `#` at the top: the mark is laid over
// the drawing in the drawing's own ink, and at the sizes these scenes are
// fitted to, `#` tiles into a texture where `@` tiles into a solid.
const MARK_GLYPHS = ["@", "#", "*", "+", ":", "."];
/* The mark is drawn whole on the very first frame — the answer to a tap should
   not take a formation to arrive — held only long enough to be read, and then
   only its leaving is animated. Short, and the same length for both: whichever
   way the tap went, the thing the reader wants to look at is the drawing, and
   every frame the mark is held is a frame of the drawing held under it.
   `MARK_CRUMBLE_SPREAD` is how far apart the cells start leaving,
   `MARK_CRUMBLE_STEP` how long each rung of the ramp lasts. */
const MARK_HOLD = 320;
const MARK_CRUMBLE_SPREAD = 170;
const MARK_CRUMBLE_STEP = 50;
const MARK_DURATION = MARK_HOLD + MARK_CRUMBLE_SPREAD
  + MARK_CRUMBLE_STEP * MARK_GLYPHS.length;
// Proportions of a transport symbol, expressed against its own height. A cell
// is taller than it is wide, so a shape measured in cells has to be widened by
// that ratio to come out the shape it is meant to be.
const CELL_ASPECT = 1.08 / ASCII_CELL_WIDTH_RATIO;
// The tallest scene is drawn on thirteen rows and the shortest on five, but
// the boxes they are drawn in are within a few pixels of the same row height.
// So the ceiling is written in rows: past this the mark stops being a mark on
// the drawing and starts being the drawing.
const MARK_MAX_ROWS = 9;
const PAUSE_BAR_RATIO = 0.30;
const PAUSE_GAP_RATIO = 0.22;
const PLAY_WIDTH_RATIO = 0.866;

const scenesPromise = fetch(SCENES_URL)
  .then((response) => {
    if (!response.ok) throw new Error(`Could not load ASCII scenes (${response.status})`);
    return response.json();
  });
// The words wait for the drawing. Until this arrives there is no scene to
// form, and an introduction that began without it would be over by the time
// it did — which is what happened whenever this fetch was the slow part of
// the load. Registered here, at module evaluation, which is well before the
// reveal stops waiting.
holdAsciiLoad(scenesPromise);

function padFrames(lineSets, minimumColumns = 0) {
  const columns = Math.max(
    minimumColumns,
    ...lineSets.flat().map((line) => line.length)
  );
  const rows = Math.max(...lineSets.map((lines) => lines.length));
  return {
    columns,
    rows,
    frames: lineSets.map((lines) => ({
      columns,
      rows,
      lines: Array.from(
        { length: rows },
        (_, y) => (lines[y] || "").padEnd(columns, " ")
      ),
    })),
  };
}

function deterministicNoise(x, y) {
  const value = Math.sin((x + 1) * 12.9898 + (y + 1) * 78.233) * 43758.5453;
  return value - Math.floor(value);
}

function introCharacter(character, x, y, elapsed) {
  const seed = deterministicNoise(x + 41, y + 73);
  const bornAt = seed * 390 - 25;
  if (elapsed < bornAt) return " ";

  const settleAt = 250 + deterministicNoise(x + 97, y + 13) * 315;
  if (elapsed >= settleAt) return character;

  const beat = Math.floor(elapsed / INTRO_FRAME_INTERVAL);
  const glyphs = elapsed - bornAt < 120
    ? [".", ".", ":", "'"]
    : [".", ":", "*", "+", "-"];
  const index = Math.floor(
    deterministicNoise(x + beat * 19, y + beat * 7) * glyphs.length
  );
  return glyphs[index];
}

function pulseCharacter(character) {
  const replacements = {
    "(": "<",
    ")": ">",
    "[": "<",
    "]": ">",
    "<": "[",
    ">": "]",
    "=": "~",
    "o": "*",
    "O": "*",
  };
  return replacements[character] || character;
}

function idleCharacter(character, x, y, elapsed, mode = true) {
  const subtle = mode === "subtle";
  const replacements = subtle
    ? {
        "-": "~",
        "_": "-",
        "~": "_",
        "|": ":",
      }
    : {
        "-": "~",
        "_": "-",
        "~": "_",
        "|": ":",
        ":": "|",
        ".": "'",
        "'": ".",
        "/": "|",
        "\\": "|",
      };
  if (!replacements[character]) return character;

  // Move a small, deterministic group of line glyphs on each beat. Since no
  // cell changes position, the drawing can feel hand-drawn without reflowing.
  const phaseCount = subtle ? 53 : 17;
  const beat = Math.floor(elapsed / (subtle ? 420 : 260));
  const cellPhase = Math.floor(
    deterministicNoise(x + 17, y + 31) * phaseCount
  );
  return (beat + cellPhase) % phaseCount === 0
    ? replacements[character]
    : character;
}

/* The two transport marks, as cell coordinates on the scene's own grid. Both
   are built from the height they are handed rather than stored as art: the
   scenes are drawn on anything from five rows to thirteen, and a mark kept as
   lines would be either lost on the tall ones or too big for the short ones. */
function markShape(kind, columns, rows, height) {
  const ink = [];
  const top = Math.floor((rows - height) / 2);
  const stamp = (x, y) => {
    if (x < 0 || x >= columns || y < 0 || y >= rows) return;
    ink.push({ x, y });
  };

  if (kind === "pause") {
    const bar = Math.max(2, Math.round(PAUSE_BAR_RATIO * height * CELL_ASPECT));
    const gap = Math.max(1, Math.round(PAUSE_GAP_RATIO * height * CELL_ASPECT));
    const left = Math.floor((columns - (bar * 2 + gap)) / 2);
    for (let row = 0; row < height; row += 1) {
      for (let offset = 0; offset < bar; offset += 1) {
        stamp(left + offset, top + row);
        stamp(left + bar + gap + offset, top + row);
      }
    }
  } else {
    // A triangle on its side: every row begins on the same left edge and
    // reaches further the nearer it is to the apex row, so the stepped side is
    // the one the point is on.
    const width = Math.max(3, Math.round(PLAY_WIDTH_RATIO * height * CELL_ASPECT));
    const half = (height - 1) / 2;
    // A triangle carries its weight at the base, so the box it fits in and the
    // shape inside it do not look centred in the same place. Centring the mass
    // instead of the box moves it right by the distance between the two.
    const left = Math.floor((columns - width) / 2) + Math.round(width / 6);
    for (let row = 0; row < height; row += 1) {
      const reach = Math.max(2, Math.round(
        width * (half - Math.abs(row - half) + 0.5) / (half + 0.5)
      ));
      for (let offset = 0; offset < reach; offset += 1) {
        stamp(left + offset, top + row);
      }
    }
  }

  /* One cell of clear air all the way round. The mark is laid on the drawing
     in the drawing's own ink, so without it a stroke of the scene running up
     against a bar joins on to it and the silhouette stops being a silhouette.
     These cells are not erased, only held blank for as long as the mark is
     there — each one on its own clock, like the ink, so what the drawing gets
     back it gets back in the same pieces the mark left in. */
  const taken = new Set(ink.map(({ x, y }) => y * columns + x));
  const halo = [];
  for (const { x, y } of ink) {
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        const hx = x + dx;
        const hy = y + dy;
        if (hx < 0 || hx >= columns || hy < 0 || hy >= rows) continue;
        const key = hy * columns + hx;
        if (taken.has(key)) continue;
        taken.add(key);
        halo.push({ x: hx, y: hy });
      }
    }
  }

  const seeded = ({ x, y }) => ({ x, y, seed: deterministicNoise(x + 7, y + 53) });
  return { ink: ink.map(seeded), halo: halo.map(seeded) };
}

/* Each cell keeps its full weight until its own moment, then falls one rung
   down the ramp per step until there is nothing left of it. The moments are a
   fixed function of position, so the mark comes apart in the same pieces every
   time rather than dissolving evenly. */
function markCharacter(elapsed, seed) {
  const crumbleAt = MARK_HOLD + seed * MARK_CRUMBLE_SPREAD;
  if (elapsed < crumbleAt) return MARK_GLYPHS[0];
  const index = Math.floor((elapsed - crumbleAt) / MARK_CRUMBLE_STEP) + 1;
  return index < MARK_GLYPHS.length ? MARK_GLYPHS[index] : " ";
}

class AsciiHero extends HTMLElement {
  constructor() {
    super();
    this._scene = null;
    this._variantName = null;
    this._variantKey = null;
    this._variantConfig = null;
    this._variant = null;
    this._frames = [];
    this._emphasis = null;
    this._elapsed = 0;
    this._lastTick = null;
    this._lastRender = -Infinity;
    this._raf = null;
    this._inView = false;
    this._started = false;
    this._awaitingLoadClock = false;
    this._userPaused = false;
    this._mark = null;
    this._pointer = null;
    this._introEnabled = true;
    this._phase = this._introEnabled ? "intro" : "idle";
    this._motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    this._colorScheme = window.matchMedia("(prefers-color-scheme: dark)");
  }

  connectedCallback() {
    if (this._connected) return;
    this._connected = true;
    this.setAttribute("dir", "ltr");
    this.setAttribute("translate", "no");
    this.setAttribute("aria-hidden", "true");

    this._pre = this.querySelector("pre") || document.createElement("pre");
    this._pre.className = "ascii-hero__canvas";
    this._pre.setAttribute("aria-hidden", "true");
    this._pre.setAttribute("translate", "no");
    if (!this._pre.isConnected) this.append(this._pre);

    this._onVisibilityChange = () => this._syncPlayback();
    document.addEventListener("visibilitychange", this._onVisibilityChange);

    this._onMotionChange = () => {
      if (!this._scene) return;
      // The scene is being restarted from either end of this switch, so the
      // reader's own pause and the mark that announced it both go with it.
      this._mark = null;
      this._userPaused = false;
      if (this._motion.matches) {
        this._stop();
        this._renderFinal();
      } else {
        this._started = false;
        this._elapsed = 0;
        this._phase = this._introEnabled ? "intro" : "idle";
        this._maybeStart();
      }
    };
    this._motion.addEventListener("change", this._onMotionChange);

    this._onColorSchemeChange = () => {
      if (this._scene) this._selectVariant(true);
    };
    this._colorScheme.addEventListener("change", this._onColorSchemeChange);

    /* A vertical pan stays native. Pointer capture on a touchscreen is
       implicit, so a scroll arrives as pointercancel while a short, still
       gesture reaches pointerup — no preventDefault(), and none of the delay a
       synthetic click carries. The travel check is what a plain click handler
       would not give: the <pre> is selectable text, and a drag that selects
       some of it is not a tap on the drawing. */
    this._onPointerDown = (event) => {
      if (
        !event.isPrimary
        || (event.pointerType === "mouse" && event.button !== 0)
        || !this._canToggle()
      ) return;
      this._pointer = {
        id: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        moved: false,
      };
    };
    this._onPointerMove = (event) => {
      if (this._pointer?.id !== event.pointerId) return;
      if (this._travelled(event)) this._pointer.moved = true;
    };
    this._onPointerUp = (event) => {
      if (this._pointer?.id !== event.pointerId) return;
      const moved = this._pointer.moved || this._travelled(event);
      this._pointer = null;
      // Conditions are read again here rather than remembered from the press:
      // an overlay can have opened, or the scene scrolled away, in between.
      if (!moved) this._toggleMotion();
    };
    this._onPointerCancel = (event) => {
      if (this._pointer?.id === event.pointerId) this._pointer = null;
    };
    this.addEventListener("pointerdown", this._onPointerDown);
    this.addEventListener("pointermove", this._onPointerMove);
    this.addEventListener("pointerup", this._onPointerUp);
    this.addEventListener("pointercancel", this._onPointerCancel);

    this._resizeObserver = new ResizeObserver(() => this._selectVariant());
    this._resizeObserver.observe(this);

    this._intersectionObserver = new IntersectionObserver(
      (entries) => {
        this._inView = entries.some((entry) => entry.isIntersecting);
        this._syncPlayback();
      },
      { threshold: 0.05 }
    );
    this._intersectionObserver.observe(this);

    const sceneId = this.dataset.scene;
    scenesPromise
      .then((scenes) => {
        if (!scenes[sceneId]) throw new Error(`Unknown ASCII scene: ${sceneId}`);
        this._scene = scenes[sceneId];
        this._selectVariant(true);
        this.dataset.state = "ready";
        if (this._motion.matches) this._renderFinal();
        else this._maybeStart();
      })
      .catch((error) => {
        this.dataset.state = "error";
        console.warn(error);
      });
  }

  /* `paused` is the way something in front of the page can stop the animation
     without hiding the tab. The idle loop rewrites the whole <pre> ten times a
     second for as long as the scene is on screen, which is work worth doing
     while somebody is looking at it and work worth nobody's main thread while
     an overlay is covering it. See works/figures.js. */
  static get observedAttributes() {
    return ["paused"];
  }

  attributeChangedCallback(name) {
    if (name === "paused") this._syncPlayback();
  }

  disconnectedCallback() {
    this._mark = null;
    this._pointer = null;
    this._stop();
    this._resizeObserver?.disconnect();
    this._intersectionObserver?.disconnect();
    this._motion.removeEventListener("change", this._onMotionChange);
    this._colorScheme.removeEventListener("change", this._onColorSchemeChange);
    document.removeEventListener("visibilitychange", this._onVisibilityChange);
    this.removeEventListener("pointerdown", this._onPointerDown);
    this.removeEventListener("pointermove", this._onPointerMove);
    this.removeEventListener("pointerup", this._onPointerUp);
    this.removeEventListener("pointercancel", this._onPointerCancel);
  }

  _selectVariant(force = false) {
    if (!this._scene) return;
    const name = this.clientWidth < COMPACT_BREAKPOINT ? "compact" : "wide";
    const baseVariant = this._scene.variants[name];
    const themeName = this._colorScheme.matches ? "dark" : "light";
    const variant = baseVariant.themes?.[themeName] || baseVariant;
    const key = `${name}:${baseVariant.themes ? themeName : "default"}`;
    if (!force && key === this._variantKey) {
      this._fitText();
      this._refitMark();
      return;
    }

    this._variantName = name;
    this._variantKey = key;
    this._variantConfig = variant;
    const gridColumns = variant.gridColumns || baseVariant.gridColumns || 0;
    const prepared = padFrames(
      [variant.lines, ...(variant.frames || [])],
      gridColumns
    );
    this._variant = prepared.frames[0];
    this._frames = prepared.frames;
    this._prepareAnimation();
    this._fitText();
    this._refitMark();

    if (this._motion.matches) this._renderFinal();
    else if (!this._started || this._phase === "intro") {
      this._renderIntro(this._started ? this._elapsed : 0);
    } else this._render(this._elapsed);
  }

  _prepareAnimation() {
    const emphasis = this._variantConfig.emphasis;
    this._emphasis = emphasis ? this._findEmphasis(emphasis) : null;
  }

  _findEmphasis({ token, occurrence = "first" }) {
    const matches = [];
    this._variant.lines.forEach((line, y) => {
      let from = 0;
      while (from <= line.length - token.length) {
        const x = line.indexOf(token, from);
        if (x < 0) break;
        matches.push({ x, y, token });
        from = x + 1;
      }
    });
    if (!matches.length) return null;
    return occurrence === "last" ? matches[matches.length - 1] : matches[0];
  }

  _fitText() {
    if (!this._variant || !this.clientWidth) return;
    const fontSize = fittedAsciiFontSize(
      this.clientWidth,
      this._variant.columns
    );
    this._pre.style.fontSize = `${fontSize}px`;
  }

  _maybeStart() {
    if (
      !this._scene
      || this._motion.matches
      || this._started
      || (!this._introEnabled && !this._inView)
    ) return;
    // The introduction shares the page's one origin, and that origin is not
    // set until the load reveal has its covers up and the tab is in front of
    // somebody. Arriving early means waiting, not starting from a clock that
    // has already run out.
    if (this._introEnabled && !asciiLoadHasStarted()) {
      if (!this._awaitingLoadClock) {
        this._awaitingLoadClock = true;
        // Hold the first frame of the introduction while the page finishes
        // getting ready, rather than leaving what the <pre> was committed
        // with — the finished drawing, which is the frame written for the
        // reader without JavaScript. A tab that loaded in the background is
        // uncovered by then and can be brought forward at any moment, and
        // the drawing would be the one thing on it already at its end.
        this._renderIntro(0);
        this.dataset.state = "forming";
        asciiLoadStarted().then(() => {
          this._awaitingLoadClock = false;
          this._maybeStart();
        });
      }
      return;
    }
    this._started = true;
    this._elapsed = Math.max(0, asciiLoadElapsed());
    this._lastTick = null;
    if (this._introEnabled) {
      this._phase = "intro";
      if (this._elapsed >= INTRO_DURATION) {
        this._renderFinal();
        this._phase = "idle";
        this._elapsed = 0;
        this.dataset.state = "idle";
      } else {
        this._renderIntro(this._elapsed);
        this.dataset.state = "forming";
      }
    } else {
      this._phase = "idle";
      this._render(0);
      this.dataset.state = "idle";
    }
    this._schedule();
  }

  /* What the page permits, in one place. The sync, the scheduler and the tick
     each used to spell out their own version of this, and they had already
     drifted: `paused` reached only the first of the three, so a frame already
     in flight when the overlay opened would re-arm the loop the overlay had
     just stopped. Three conditions, one answer:

     - the tab is in front,
     - nothing in front of the page has asked for quiet,
     - and the scene is where somebody can see it. Scrolled out of view it
       stops; scrolled back it starts again, which is the IntersectionObserver
       calling this. The intro is exempt: it forms once, on load, whether or
       not the reader has already scrolled past it. */
  _pageAllowsMotion() {
    return !document.hidden
      && !this.hasAttribute("paused")
      && (this._phase === "intro" || this._inView);
  }

  /* The reader's own answer, kept apart from the page's three because it means
     something different. The page's conditions come back by themselves when
     the tab or the scroll position does; this one only ever changes because
     somebody asked, so it survives a scroll away and back, an overlay opening
     and closing, and the tab going behind another. */
  _shouldAnimate() {
    return this._pageAllowsMotion() && !this._userPaused;
  }

  /* The loop also runs for a mark standing on a stopped drawing: the drawing
     has nothing left to redraw, but the mark that says so is still leaving. */
  _shouldRun() {
    return this._shouldAnimate()
      || (this._mark !== null && this._pageAllowsMotion());
  }

  _syncPlayback() {
    if (!this._scene || this._motion.matches) return;
    if (!this._pageAllowsMotion()) {
      // The mark answers a tap. Finishing it later, for a reader who has come
      // back to the tab or scrolled the scene into view again, would be
      // answering a question nobody is still asking.
      this._clearMark();
      this._stop(false);
      return;
    }
    if (!this._started) this._maybeStart();
    else this._schedule();
  }

  _schedule() {
    if (this._raf) return;
    if (!this._shouldRun()) {
      // Nothing is coming, so the next frame after this is a fresh start
      // rather than one holding a delta measured across the whole pause.
      this._lastTick = null;
      return;
    }
    this._raf = requestAnimationFrame((time) => this._tick(time));
  }

  _tick(time) {
    this._raf = null;
    if (!this._shouldRun()) {
      this._lastTick = null;
      return;
    }
    if (this._lastTick === null) this._lastTick = time;
    const delta = Math.min(time - this._lastTick, 120);
    this._lastTick = time;
    // Two clocks, because the mark keeps going while the drawing does not:
    // that is the whole of what a pause looks like from here.
    if (this._mark) this._mark.elapsed += delta;
    if (this._phase === "intro") {
      this._elapsed = Math.max(0, asciiLoadElapsed(time));
    } else if (!this._userPaused) {
      this._elapsed += delta;
    }

    const frameInterval = this._phase === "intro"
      ? INTRO_FRAME_INTERVAL
      : FRAME_INTERVAL;
    if (time - this._lastRender >= frameInterval) {
      if (this._phase === "intro") this._renderIntro(this._elapsed);
      else this._render(this._elapsed);
      this._lastRender = time;
    }

    if (this._mark && this._mark.elapsed >= MARK_DURATION) this._clearMark();

    if (this._phase === "intro" && this._elapsed >= INTRO_DURATION) {
      // Hold the canonical first frame once before idle mutations begin. The
      // same padded grid and the same <pre> are used on both sides, so the
      // hand-off is pixel-identical rather than a second overlay swap.
      this._renderFinal();
      this._phase = "idle";
      this._elapsed = 0;
      this._lastRender = time;
      this.dataset.state = "idle";
    }

    this._schedule();
  }

  _render(elapsed) {
    const grid = Array.from(
      { length: this._variant.rows },
      () => Array(this._variant.columns).fill(" ")
    );

    const frameDuration = this._scene.frameDuration || Infinity;
    const frameIndex = Math.floor(elapsed / frameDuration) % this._frames.length;
    const frame = this._frames[frameIndex];
    for (let y = 0; y < frame.rows; y += 1) {
      for (let x = 0; x < frame.columns; x += 1) {
        const character = frame.lines[y][x];
        if (character === " ") continue;
        grid[y][x] = this._scene.idleWobble === false
          ? character
          : idleCharacter(character, x, y, elapsed, this._scene.idleWobble);
      }
    }

    if (this._emphasis) {
      const pulseElapsed = elapsed % this._scene.idlePulseInterval;
      const pulseOn = pulseElapsed < 620 && Math.floor(pulseElapsed / 155) % 2 === 0;
      if (pulseOn) {
        const { x, y, token } = this._emphasis;
        [...token].forEach((character, offset) => {
          if (character !== " ") grid[y][x + offset] = pulseCharacter(character);
        });
      }
    }

    // Keep every cell, including trailing spaces, so the max-content <pre>
    // cannot change its width as line glyphs wobble.
    this._commit(grid.map((row) => row.join("")));
  }

  _renderIntro(elapsed) {
    if (!this._variant) return;
    if (elapsed >= INTRO_DURATION) {
      this._renderFinal();
      return;
    }

    const lines = this._variant.lines.map((line, y) => [...line].map(
      (character, x) => character === " "
        ? " "
        : introCharacter(character, x, y, elapsed)
    ).join(""));
    this._commit(lines);
  }

  _renderFinal() {
    if (!this._variant) return;
    this._commit(this._variant.lines);
    if (this._motion.matches) this.dataset.state = "reduced-motion";
  }

  /* The one place the drawing becomes text, so the mark is stamped over
     whatever the scene last drew — the frozen frame while it is paused, the
     moving one while it is not — without any of the three renderers having to
     know that a mark exists. Standing in the same grid is also what makes it
     the same ink at the same size as everything else on the page; there is no
     second layer to keep in step. */
  _commit(rows) {
    if (!this._mark) {
      this._pre.textContent = rows.join("\n");
      return;
    }
    const { elapsed, ink, halo } = this._mark;
    const grid = rows.map((row) => [...row]);
    // The clear air first, then the mark into it. A cell that has finished
    // leaving — blank or inked — gives the drawing underneath it back.
    for (const cell of halo) {
      if (markCharacter(elapsed, cell.seed) !== " ") grid[cell.y][cell.x] = " ";
    }
    for (const cell of ink) {
      const character = markCharacter(elapsed, cell.seed);
      if (character !== " ") grid[cell.y][cell.x] = character;
    }
    this._pre.textContent = grid.map((row) => row.join("")).join("\n");
  }

  _travelled(event) {
    return Math.hypot(
      event.clientX - this._pointer.x,
      event.clientY - this._pointer.y
    ) > TAP_MOVE_TOLERANCE;
  }

  _canToggle() {
    return Boolean(
      this._scene
      && this._variant
      && this._started
      && this._phase === "idle"
      // Nothing to stop, and a mark that arrives and comes apart is itself
      // motion. A reader who has asked for none is left with the still frame.
      && !this._motion.matches
      && this._pageAllowsMotion()
    );
  }

  /* A tap stops the drawing where it stands; the next one lets it go on. The
     mark is the whole of the feedback, and it is drawn into the scene's own
     grid rather than laid over it, so what the reader sees is the drawing
     answering rather than a control appearing on top of it. */
  _toggleMotion() {
    if (!this._canToggle()) return;
    this._userPaused = !this._userPaused;
    this.dataset.state = this._userPaused ? "paused" : "idle";
    this._showMark(this._userPaused ? "pause" : "play");
    this._lastTick = null;
    this._schedule();
  }

  _showMark(kind) {
    this._mark = { kind, elapsed: 0, ink: [], halo: [] };
    this._refitMark();
    // Drawn on this frame, not on the loop's next one. The mark acknowledges
    // the tap, and an acknowledgement that waits for a frame is not one — so
    // it arrives whole, with no formation, and only its leaving is animated.
    this._repaint();
  }

  /* The mark is measured in cells of the grid it stands on, so anything that
     changes the grid, or the height of the box the grid is cropped to, has to
     lay it out again where it is now. */
  _refitMark() {
    if (!this._mark || !this._variant) return;
    const { ink, halo } = markShape(
      this._mark.kind,
      this._variant.columns,
      this._variant.rows,
      this._markHeight()
    );
    this._mark.ink = ink;
    this._mark.halo = halo;
  }

  /* As tall as the scene lets it be. `ascii-hero` is a fixed box with
     `overflow: hidden`, and the taller scenes are drawn on more rows than the
     box shows, so what the mark has to fill is the visible band and not the
     grid — measured against the grid, a mark would have its ends cropped away
     on exactly the scenes with the most room in the middle. Odd, so that the
     play triangle comes to one apex row rather than two. */
  _markHeight() {
    const rows = this._variant.rows;
    const drawn = this._pre.getBoundingClientRect().height;
    const shown = this.getBoundingClientRect().height;
    const visible = drawn && shown
      ? Math.max(1, Math.min(rows, Math.floor(shown / (drawn / rows))))
      : rows;
    const usable = Math.max(3, Math.min(visible - 2, MARK_MAX_ROWS));
    return usable % 2 ? usable : usable - 1;
  }

  _repaint() {
    if (!this._variant) return;
    if (this._motion.matches) this._renderFinal();
    else if (this._phase === "intro") this._renderIntro(this._elapsed);
    else this._render(this._elapsed);
  }

  _clearMark() {
    if (!this._mark) return;
    this._mark = null;
    this._repaint();
  }

  _stop(resetClock = true) {
    if (this._raf) cancelAnimationFrame(this._raf);
    this._raf = null;
    if (resetClock) this._lastTick = null;
  }
}

customElements.define("ascii-hero", AsciiHero);
