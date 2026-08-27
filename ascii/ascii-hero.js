import {
  fittedAsciiFontSize,
} from "./ascii-layout.js";
import "./ascii-text-reveal.js";

const SCENES_URL = new URL("./scenes.json", import.meta.url);
const FRAME_INTERVAL = 1000 / 10;
const COMPACT_BREAKPOINT = 480;

const scenesPromise = fetch(SCENES_URL)
  .then((response) => {
    if (!response.ok) throw new Error(`Could not load ASCII scenes (${response.status})`);
    return response.json();
  });

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

    if (this._motion.matches || !this._started) this._renderFinal();
    else this._render(this._elapsed);
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
    if (!this._scene || this._motion.matches || this._started || !this._inView) return;
    this._started = true;
    this._elapsed = 0;
    this._lastTick = null;
    this._render(0);
    this.dataset.state = "idle";
    this._schedule();
  }

  _syncPlayback() {
    if (!this._scene || this._motion.matches) return;
    const shouldRun = this._inView && !document.hidden;
    if (shouldRun) {
      if (!this._started) this._maybeStart();
      else this._schedule();
    } else {
      this._stop(false);
    }
  }

  _schedule() {
    if (this._raf || !this._inView || document.hidden) return;
    this._raf = requestAnimationFrame((time) => this._tick(time));
  }

  _tick(time) {
    this._raf = null;
    if (!this._inView || document.hidden) {
      this._lastTick = null;
      return;
    }
    if (this._lastTick === null) this._lastTick = time;
    const delta = Math.min(time - this._lastTick, 120);
    this._lastTick = time;
    this._elapsed += delta;

    if (time - this._lastRender >= FRAME_INTERVAL) {
      this._render(this._elapsed);
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
