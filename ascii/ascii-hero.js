import {
  fittedAsciiFontSize,
} from "./ascii-layout.js?v=20260906-4";
import "./ascii-text-reveal.js?v=20260906-4";
import {
  asciiLoadElapsed,
  asciiLoadHasStarted,
  asciiLoadStarted,
  holdAsciiLoad,
} from "./ascii-load-clock.js?v=20260906-4";

const SCENES_URL = new URL("./scenes.json?v=20260906-4", import.meta.url);
const FRAME_INTERVAL = 1000 / 10;
const INTRO_FRAME_INTERVAL = 1000 / 6;
const INTRO_DURATION = 625;
const COMPACT_BREAKPOINT = 480;

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
    this._stop();
    this._resizeObserver?.disconnect();
    this._intersectionObserver?.disconnect();
    this._motion.removeEventListener("change", this._onMotionChange);
    this._colorScheme.removeEventListener("change", this._onColorSchemeChange);
    document.removeEventListener("visibilitychange", this._onVisibilityChange);
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

  /* Whether the loop should be running, in one place. The sync, the scheduler
     and the tick each used to spell out their own version of this, and they
     had already drifted: `paused` reached only the first of the three, so a
     frame already in flight when the overlay opened would re-arm the loop the
     overlay had just stopped. Three conditions, one answer:

     - the tab is in front,
     - nothing in front of the page has asked for quiet,
     - and the scene is where somebody can see it. Scrolled out of view it
       stops; scrolled back it starts again, which is the IntersectionObserver
       calling this. The intro is exempt: it forms once, on load, whether or
       not the reader has already scrolled past it. */
  _shouldAnimate() {
    return !document.hidden
      && !this.hasAttribute("paused")
      && (this._phase === "intro" || this._inView);
  }

  _syncPlayback() {
    if (!this._scene || this._motion.matches) return;
    if (!this._shouldAnimate()) {
      this._stop(false);
      return;
    }
    if (!this._started) this._maybeStart();
    else this._schedule();
  }

  _schedule() {
    if (this._raf || !this._shouldAnimate()) return;
    this._raf = requestAnimationFrame((time) => this._tick(time));
  }

  _tick(time) {
    this._raf = null;
    if (!this._shouldAnimate()) {
      this._lastTick = null;
      return;
    }
    if (this._lastTick === null) this._lastTick = time;
    const delta = Math.min(time - this._lastTick, 120);
    this._lastTick = time;
    if (this._phase === "intro") {
      this._elapsed = Math.max(0, asciiLoadElapsed(time));
    } else {
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
    this._pre.textContent = grid.map((row) => row.join("")).join("\n");
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
    this._pre.textContent = lines.join("\n");
  }

  _renderFinal() {
    if (!this._variant) return;
    this._pre.textContent = this._variant.lines.join("\n");
    if (this._motion.matches) this.dataset.state = "reduced-motion";
  }

  _stop(resetClock = true) {
    if (this._raf) cancelAnimationFrame(this._raf);
    this._raf = null;
    if (resetClock) this._lastTick = null;
  }
}

customElements.define("ascii-hero", AsciiHero);
