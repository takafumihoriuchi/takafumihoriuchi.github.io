import {
  ASCII_CELL_WIDTH_RATIO,
  fittedAsciiFontSize,
} from "./ascii-layout.js?v=20260829-2";

// All text and image instances use one page-level wall clock. A busy frame can
// skip visual steps, but it cannot postpone completion until the user scrolls.
const ASCII_LOAD_STARTED_AT = performance.now();
const TARGET_SELECTOR = [
  "main h1", "main h2", "main h3", "main h4", "main h5", "main h6",
  "main p", "main figcaption", "main dt", "main dd", "main li",
  "main .work-title", "main .work-desc", "footer p", "footer li",
].join(", ");
const BLOCK_DESCENDANT_SELECTOR = [
  "h1", "h2", "h3", "h4", "h5", "h6", "p", "figcaption", "dt", "dd",
  ".work-title", ".work-desc", "img", "video", "svg",
].join(", ");
const FRAME_RATE = 12;
const FRAME_INTERVAL = 1000 / FRAME_RATE;
const FORMATION_DURATION = 625;
const REVEAL_START = 140;
const REVEAL_END = 580;
const FORMATION_EASE_POWER = 1.8;
const ELEMENT_STAGGER = 55;
const ADAPTIVE_ASCII_FRAME_COUNT = 3;
const ADAPTIVE_ASCII_DURATION = FRAME_INTERVAL * ADAPTIVE_ASCII_FRAME_COUNT;
const ADAPTIVE_SIGNATURE_COLUMNS = 3;
const ADAPTIVE_SIGNATURE_ROWS = 5;
const ADAPTIVE_SAMPLE_OFFSETS = [0.25, 0.75];
const ADAPTIVE_ALPHA_THRESHOLD = 0.12;
const POC_GRID_COLUMNS = { wide: 72, compact: 48 };
const COMPACT_BREAKPOINT = 480;
const EARLY_GLYPHS = [".", ".", ":", "'"];
const WOBBLE_GLYPHS = [".", ":", "*", "+", "-"];
const IMAGE_GLYPHS = [".", ".", ":", "+", "#", "o"];
const PRINTABLE_ASCII = Array.from(
  { length: 94 },
  (_, index) => String.fromCharCode(index + 33)
);
const PREPAINT_CLASS = "ascii-load-pending";
const adaptiveAsciiAtlasCache = new Map();

function clamp(value, minimum = 0, maximum = 1) {
  return Math.min(maximum, Math.max(minimum, value));
}

// Uniform deterministic ranks become later wall-clock timestamps so the
// cumulative visible fraction follows progress^1.8: restrained at first,
// then increasingly quick, while every item still lands by the same deadline.
function acceleratedArrivalTime(progress, start, end) {
  const timeProgress = Math.pow(clamp(progress), 1 / FORMATION_EASE_POWER);
  return start + timeProgress * (end - start);
}

function downsampleAlpha(pixels, width, height) {
  const signature = new Float32Array(
    ADAPTIVE_SIGNATURE_COLUMNS * ADAPTIVE_SIGNATURE_ROWS
  );
  for (let row = 0; row < ADAPTIVE_SIGNATURE_ROWS; row += 1) {
    const firstY = Math.floor(row * height / ADAPTIVE_SIGNATURE_ROWS);
    const lastY = Math.max(
      firstY + 1,
      Math.floor((row + 1) * height / ADAPTIVE_SIGNATURE_ROWS)
    );
    for (let column = 0; column < ADAPTIVE_SIGNATURE_COLUMNS; column += 1) {
      const firstX = Math.floor(column * width / ADAPTIVE_SIGNATURE_COLUMNS);
      const lastX = Math.max(
        firstX + 1,
        Math.floor((column + 1) * width / ADAPTIVE_SIGNATURE_COLUMNS)
      );
      let alpha = 0;
      let samples = 0;
      for (let y = firstY; y < Math.min(lastY, height); y += 1) {
        for (let x = firstX; x < Math.min(lastX, width); x += 1) {
          alpha += pixels[(y * width + x) * 4 + 3];
          samples += 1;
        }
      }
      signature[row * ADAPTIVE_SIGNATURE_COLUMNS + column]
        = samples ? alpha / (samples * 255) : 0;
    }
  }
  return signature;
}

function adaptiveAsciiAtlas(style) {
  const key = [
    style.fontWeight,
    style.fontSize.toFixed(3),
    style.lineHeight.toFixed(3),
    style.fontFamily,
  ].join("|");
  const cached = adaptiveAsciiAtlasCache.get(key);
  if (cached) return cached;

  const scale = 2;
  const cellWidth = style.fontSize * ASCII_CELL_WIDTH_RATIO;
  const cellHeight = style.lineHeight;
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.ceil(cellWidth * scale));
  canvas.height = Math.max(1, Math.ceil(cellHeight * scale));
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return [];
  context.setTransform(scale, 0, 0, scale, 0, 0);
  context.fillStyle = "#fff";
  context.font = `${style.fontWeight} ${style.fontSize}px ${style.fontFamily}`;
  context.textAlign = "center";
  context.textBaseline = "alphabetic";

  const candidates = PRINTABLE_ASCII.map((character) => {
    context.clearRect(0, 0, cellWidth, cellHeight);
    context.fillText(character, cellWidth / 2, cellHeight * 0.72);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    return {
      character,
      signature: downsampleAlpha(pixels, canvas.width, canvas.height),
    };
  });
  const atlas = { candidates, matches: new Map() };
  adaptiveAsciiAtlasCache.set(key, atlas);
  return atlas;
}

function binarySignatureKey(signature) {
  let key = 0;
  signature.forEach((alpha) => {
    key = (key << 1) | (alpha >= ADAPTIVE_ALPHA_THRESHOLD ? 1 : 0);
  });
  return key;
}

function closestAdaptiveCharacters(targetSignature, atlas) {
  if (!atlas.candidates?.length) return [];
  const signatureKey = binarySignatureKey(targetSignature);
  const cached = atlas.matches.get(signatureKey);
  if (cached) return cached;

  const closest = [];
  atlas.candidates.forEach((candidate, candidateIndex) => {
    let score = candidateIndex * 0.000000001;
    for (let index = 0; index < targetSignature.length; index += 1) {
      const targetInk = targetSignature[index] >= ADAPTIVE_ALPHA_THRESHOLD;
      const candidateInk = candidate.signature[index] >= ADAPTIVE_ALPHA_THRESHOLD;
      const difference = targetSignature[index] - candidate.signature[index];
      score += (targetInk === candidateInk ? 0 : 1)
        + difference * difference * 0.05;
    }
    const result = { character: candidate.character, score };
    const insertAt = closest.findIndex((item) => score < item.score);
    if (insertAt < 0) closest.push(result);
    else closest.splice(insertAt, 0, result);
    if (closest.length > ADAPTIVE_ASCII_FRAME_COUNT) closest.pop();
  });
  const characters = closest.map((item) => item.character);
  atlas.matches.set(signatureKey, characters);
  return characters;
}

function hashString(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function noise(seed, salt = 0) {
  let value = (seed + Math.imul(salt + 1, 0x9e3779b1)) >>> 0;
  value ^= value >>> 16;
  value = Math.imul(value, 0x21f0aaad);
  value ^= value >>> 15;
  value = Math.imul(value, 0x735a2d97);
  value ^= value >>> 15;
  return (value >>> 0) / 4294967296;
}

function shuffledRevealTimes(glyphs, seed) {
  const order = glyphs.map((_, index) => index);
  for (let index = order.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(noise(seed, index) * (index + 1));
    [order[index], order[swapIndex]] = [order[swapIndex], order[index]];
  }

  const denominator = Math.max(1, order.length - 1);
  order.forEach((glyphIndex, rank) => {
    const evenProgress = rank / denominator;
    const jitter = (noise(seed, glyphIndex + 1000) - 0.5) / denominator;
    glyphs[glyphIndex].revealAt = acceleratedArrivalTime(
      evenProgress + jitter,
      REVEAL_START,
      REVEAL_END
    );
  });
}

function textNodesWithin(element) {
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      return node.nodeValue?.trim()
        ? NodeFilter.FILTER_ACCEPT
        : NodeFilter.FILTER_REJECT;
    },
  });
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  return nodes;
}

function collectGlyphs(element) {
  const bounds = element.getBoundingClientRect();
  const locale = element.closest("[lang]")?.lang || document.documentElement.lang;
  const segmenter = new Intl.Segmenter(locale, { granularity: "grapheme" });
  const range = document.createRange();
  const glyphs = [];

  for (const node of textNodesWithin(element)) {
    for (const item of segmenter.segment(node.nodeValue)) {
      if (!item.segment.trim()) continue;
      range.setStart(node, item.index);
      range.setEnd(node, item.index + item.segment.length);
      const rect = range.getBoundingClientRect();
      if (!rect.width || !rect.height) continue;
      glyphs.push({
        character: item.segment,
        x: rect.left - bounds.left,
        y: rect.top - bounds.top,
        width: rect.width,
        height: rect.height,
      });
    }
  }
  range.detach();
  return glyphs;
}

function canvasFont(style) {
  return [
    style.fontStyle,
    style.fontVariant,
    style.fontWeight,
    style.fontStretch,
    style.fontSize,
    style.fontFamily,
  ].filter(Boolean).join(" ");
}

function findBackground(element) {
  let current = element;
  while (current) {
    const color = getComputedStyle(current).backgroundColor;
    if (color && color !== "rgba(0, 0, 0, 0)" && color !== "transparent") {
      return color;
    }
    current = current.parentElement;
  }
  return getComputedStyle(document.documentElement).backgroundColor;
}

function referenceAsciiStyle() {
  const hero = document.querySelector(
    'ascii-hero:not([data-placement="footer"])'
  );
  const canvas = hero?.querySelector(".ascii-hero__canvas");
  const style = canvas ? getComputedStyle(canvas) : null;
  const sourceFontSize = parseFloat(style?.fontSize) || 8;
  const sourceLineHeight = parseFloat(style?.lineHeight);
  const lineHeightRatio = Number.isFinite(sourceLineHeight)
    ? sourceLineHeight / sourceFontSize
    : 1.08;
  const width = hero?.clientWidth || document.querySelector("main")?.clientWidth || 0;
  const columns = width < COMPACT_BREAKPOINT
    ? POC_GRID_COLUMNS.compact
    : POC_GRID_COLUMNS.wide;
  const fontSize = width ? fittedAsciiFontSize(width, columns) : sourceFontSize;
  return {
    element: canvas,
    color: hero ? getComputedStyle(hero).color : "currentColor",
    fontFamily: style?.fontFamily || "ui-monospace, monospace",
    fontSize,
    fontWeight: style?.fontWeight || "500",
    lineHeight: fontSize * lineHeightRatio,
  };
}

class AsciiTextReveal {
  constructor(element, index) {
    this.element = element;
    this.index = index;
    this.seed = hashString(`${location.pathname}:${index}:${element.textContent}`);
    this.delay = Math.floor(noise(this.seed, 701) * ELEMENT_STAGGER);
    this.elapsed = -this.delay;
    this.lastRender = -Infinity;
    this.frame = null;
    this.complete = false;
    this.motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    this.onMotionChange = () => {
      if (this.motion.matches) this.finish("reduced-motion");
    };
  }

  start() {
    if (this.motion.matches) {
      this.element.dataset.asciiRevealState = "reduced-motion";
      return;
    }

    this.element.classList.add("ascii-text-reveal");
    this.canvas = document.createElement("canvas");
    this.canvas.className = "ascii-text-reveal__canvas";
    this.canvas.setAttribute("aria-hidden", "true");
    this.element.append(this.canvas);
    this.context = this.canvas.getContext("2d");
    if (!this.context) {
      this.finish("error");
      return;
    }

    this.rebuild();
    if (!this.glyphs.length || !this.particles.length) {
      this.finish("empty");
      return;
    }

    this.element.dataset.asciiRevealState = "running";
    this.motion.addEventListener("change", this.onMotionChange);
    this.resizeObserver = new ResizeObserver(() => this.rebuild());
    this.resizeObserver.observe(this.element);
    if (this.referenceAscii.element) {
      this.resizeObserver.observe(this.referenceAscii.element);
    }
    this.elapsed = performance.now() - ASCII_LOAD_STARTED_AT - this.delay;
    if (this.elapsed >= FORMATION_DURATION) {
      this.finish("complete");
      return;
    }
    this.render();
    this.schedule();
  }

  rebuild() {
    if (!this.canvas || this.complete) return;
    const bounds = this.element.getBoundingClientRect();
    const width = Math.max(1, bounds.width);
    const height = Math.max(1, bounds.height);
    const scale = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.ceil(width * scale);
    this.canvas.height = Math.ceil(height * scale);
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
    this.context.setTransform(scale, 0, 0, scale, 0, 0);

    this.width = width;
    this.height = height;
    this.scale = scale;
    this.style = getComputedStyle(this.element);
    this.referenceAscii = referenceAsciiStyle();
    this.foreground = this.referenceAscii.color;
    this.background = findBackground(this.element);
    this.glyphs = collectGlyphs(this.element);
    shuffledRevealTimes(this.glyphs, this.seed);
    this.prepareMask();
    this.prepareParticles();
    this.render();
  }

  prepareMask() {
    const mask = document.createElement("canvas");
    mask.width = this.canvas.width;
    mask.height = this.canvas.height;
    const context = mask.getContext("2d", { willReadFrequently: true });
    context.setTransform(this.scale, 0, 0, this.scale, 0, 0);
    context.fillStyle = "#fff";
    context.font = canvasFont(this.style);
    context.textBaseline = "alphabetic";
    context.direction = this.style.direction;
    if ("letterSpacing" in context) context.letterSpacing = this.style.letterSpacing;

    for (const glyph of this.glyphs) {
      const metrics = context.measureText(glyph.character);
      const ascent = metrics.actualBoundingBoxAscent || parseFloat(this.style.fontSize) * 0.8;
      const descent = metrics.actualBoundingBoxDescent || parseFloat(this.style.fontSize) * 0.2;
      const inkHeight = ascent + descent;
      glyph.drawX = glyph.x + (metrics.actualBoundingBoxLeft || 0);
      glyph.baseline = glyph.y + (glyph.height - inkHeight) / 2 + ascent;
      context.fillText(glyph.character, glyph.drawX, glyph.baseline);
    }
    this.mask = context.getImageData(0, 0, mask.width, mask.height).data;
  }

  alphaAt(x, y) {
    const pixelX = Math.floor(clamp(x, 0, this.width - 1) * this.scale);
    const pixelY = Math.floor(clamp(y, 0, this.height - 1) * this.scale);
    return this.mask[(pixelY * this.canvas.width + pixelX) * 4 + 3] || 0;
  }

  particleCharacter(x, y, seed) {
    const step = 1.5;
    const horizontal = this.alphaAt(x + step, y) - this.alphaAt(x - step, y);
    const vertical = this.alphaAt(x, y + step) - this.alphaAt(x, y - step);
    if (Math.abs(horizontal) + Math.abs(vertical) < 55) {
      return noise(seed, 31) > 0.55 ? "." : "+";
    }
    const angle = Math.atan2(-horizontal, vertical);
    const eighth = Math.round(angle / (Math.PI / 4));
    return ["-", "/", "|", "\\", "-", "/", "|", "\\"][(eighth + 8) % 8];
  }

  cellInk(x, y, width, height) {
    let maximum = 0;
    for (const offsetY of [-0.42, 0, 0.42]) {
      for (const offsetX of [-0.45, -0.22, 0, 0.22, 0.45]) {
        maximum = Math.max(
          maximum,
          this.alphaAt(x + width * offsetX, y + height * offsetY)
        );
      }
    }
    return maximum;
  }

  cellSignature(x, y, width, height) {
    const signature = new Float32Array(
      ADAPTIVE_SIGNATURE_COLUMNS * ADAPTIVE_SIGNATURE_ROWS
    );
    const left = x - width / 2;
    const top = y - height / 2;
    for (let row = 0; row < ADAPTIVE_SIGNATURE_ROWS; row += 1) {
      for (let column = 0; column < ADAPTIVE_SIGNATURE_COLUMNS; column += 1) {
        let alpha = 0;
        let samples = 0;
        for (const offsetY of ADAPTIVE_SAMPLE_OFFSETS) {
          for (const offsetX of ADAPTIVE_SAMPLE_OFFSETS) {
            const sampleX = left
              + (column + offsetX) * width / ADAPTIVE_SIGNATURE_COLUMNS;
            const sampleY = top
              + (row + offsetY) * height / ADAPTIVE_SIGNATURE_ROWS;
            alpha += this.alphaAt(sampleX, sampleY);
            samples += 1;
          }
        }
        signature[row * ADAPTIVE_SIGNATURE_COLUMNS + column]
          = alpha / (samples * 255);
      }
    }
    return signature;
  }

  prepareParticles() {
    this.asciiSize = this.referenceAscii.fontSize;
    const cellWidth = this.asciiSize * ASCII_CELL_WIDTH_RATIO;
    const cellHeight = this.referenceAscii.lineHeight;
    const adaptiveAtlas = adaptiveAsciiAtlas(this.referenceAscii);
    const particles = [];

    this.glyphs.forEach((glyph, glyphIndex) => {
      const firstColumn = Math.floor(glyph.x / cellWidth);
      const lastColumn = Math.ceil((glyph.x + glyph.width) / cellWidth);
      const firstRow = Math.floor(glyph.y / cellHeight);
      const lastRow = Math.ceil((glyph.y + glyph.height) / cellHeight);
      for (let row = firstRow; row <= lastRow; row += 1) {
        for (let column = firstColumn; column <= lastColumn; column += 1) {
          const targetX = (column + 0.5) * cellWidth;
          const sampleY = (row + 0.5) * cellHeight;
          const targetY = (row + 0.72) * cellHeight;
          if (this.cellInk(targetX, sampleY, cellWidth, cellHeight) < 18) continue;
          const particleSeed = hashString(`${this.seed}:${glyphIndex}:${column}:${row}`);
          const targetSignature = this.cellSignature(
            targetX,
            sampleY,
            cellWidth,
            cellHeight
          );
          particles.push({
            glyphIndex,
            targetX,
            targetY,
            seed: particleSeed,
            bornAt: acceleratedArrivalTime(
              noise(particleSeed, 3),
              -30,
              Math.min(380, Math.max(90, glyph.revealAt - 30)) - 30
            ),
            strokeCharacter: this.particleCharacter(targetX, targetY, particleSeed),
            adaptiveCharacters: closestAdaptiveCharacters(
              targetSignature,
              adaptiveAtlas
            ),
          });
        }
      }
    });
    this.particles = particles;
  }

  schedule() {
    if (this.frame || this.complete) return;
    this.frame = requestAnimationFrame((time) => this.tick(time));
  }

  tick(time) {
    this.frame = null;
    if (this.complete) return;
    this.elapsed = time - ASCII_LOAD_STARTED_AT - this.delay;

    if (time - this.lastRender >= FRAME_INTERVAL) {
      this.render();
      this.lastRender = time;
    }

    if (this.elapsed >= FORMATION_DURATION) this.finish("complete");
    else this.schedule();
  }

  render() {
    if (!this.context || this.complete) return;
    const elapsed = Math.max(0, this.elapsed);
    const context = this.context;
    context.save();
    context.setTransform(this.scale, 0, 0, this.scale, 0, 0);
    context.globalCompositeOperation = "source-over";
    context.globalAlpha = 1;
    context.fillStyle = this.background;
    context.fillRect(0, 0, this.width, this.height);

    context.fillStyle = this.foreground;
    context.font = `${this.referenceAscii.fontWeight} ${this.asciiSize}px `
      + this.referenceAscii.fontFamily;
    context.textAlign = "center";
    context.textBaseline = "alphabetic";
    context.direction = "ltr";
    for (const particle of this.particles) {
      const glyph = this.glyphs[particle.glyphIndex];
      if (elapsed >= glyph.revealAt || elapsed < particle.bornAt) continue;
      const age = elapsed - particle.bornAt;
      const beat = Math.floor(elapsed / FRAME_INTERVAL)
        + Math.floor(noise(particle.seed, 12) * 3);
      if (age < 90 && noise(particle.seed, beat + 200) < 0.28) continue;

      let character;
      if (elapsed >= glyph.revealAt - ADAPTIVE_ASCII_DURATION) {
        const framesUntilReveal = Math.max(
          1,
          Math.ceil((glyph.revealAt - elapsed) / FRAME_INTERVAL)
        );
        const candidateIndex = Math.min(
          particle.adaptiveCharacters.length - 1,
          framesUntilReveal - 1
        );
        character = particle.adaptiveCharacters[candidateIndex]
          || particle.strokeCharacter;
      } else if (age < 95) {
        character = EARLY_GLYPHS[
          Math.floor(noise(particle.seed, beat + 20) * EARLY_GLYPHS.length)
        ];
      } else {
        const choices = [...WOBBLE_GLYPHS, particle.strokeCharacter];
        character = choices[
          Math.floor(noise(particle.seed, beat + 40) * choices.length)
        ];
      }
      context.globalAlpha = 1;
      context.fillText(character, particle.targetX, particle.targetY);
    }

    // Each completed grapheme opens a transparent window in the cover canvas.
    // The pixels seen through it belong to the untouched semantic DOM below,
    // including the browser's native shaping and antialiasing.
    context.globalCompositeOperation = "destination-out";
    context.globalAlpha = 1;
    for (const glyph of this.glyphs) {
      if (elapsed < glyph.revealAt) continue;
      context.fillRect(
        Math.floor(glyph.x) - 1,
        Math.floor(glyph.y) - 1,
        Math.ceil(glyph.width) + 2,
        Math.ceil(glyph.height) + 2
      );
    }
    context.restore();
  }

  finish(state) {
    if (this.complete) return;
    this.complete = true;
    if (this.frame) cancelAnimationFrame(this.frame);
    this.frame = null;
    this.resizeObserver?.disconnect();
    this.motion.removeEventListener("change", this.onMotionChange);
    this.canvas?.remove();
    this.element.classList.remove("ascii-text-reveal");
    this.element.dataset.asciiRevealState = state;
  }
}

class AsciiImageReveal {
  constructor(element, index, layer) {
    this.element = element;
    this.layer = layer;
    this.seed = hashString(`${location.pathname}:image:${index}:${element.currentSrc || element.src}`);
    this.delay = Math.floor(noise(this.seed, 911) * ELEMENT_STAGGER);
    this.elapsed = -this.delay;
    this.lastRender = -Infinity;
    this.frame = null;
    this.complete = false;
    this.motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    this.onMotionChange = () => {
      if (this.motion.matches) this.finish("reduced-motion");
    };
  }

  start() {
    if (this.complete || this.canvas || this.motion.matches) return;
    const bounds = this.element.getBoundingClientRect();
    if (!bounds.width || !bounds.height) {
      this.finish("empty");
      return;
    }

    this.canvas = document.createElement("canvas");
    this.canvas.className = "ascii-image-reveal__canvas";
    this.canvas.setAttribute("aria-hidden", "true");
    this.layer.append(this.canvas);
    this.context = this.canvas.getContext("2d");
    if (!this.context) {
      this.finish("error");
      return;
    }

    this.motion.addEventListener("change", this.onMotionChange);
    this.element.dataset.asciiRevealState = "running";
    this.rebuild();
    this.elapsed = performance.now() - ASCII_LOAD_STARTED_AT - this.delay;
    if (this.elapsed >= FORMATION_DURATION) {
      this.finish("complete");
      return;
    }
    this.render();
    this.schedule();
  }

  rebuild() {
    if (!this.canvas || this.complete) return;
    const bounds = this.element.getBoundingClientRect();
    const width = Math.max(1, bounds.width);
    const height = Math.max(1, bounds.height);
    const scale = Math.min(window.devicePixelRatio || 1, 1.5);
    this.canvas.width = Math.ceil(width * scale);
    this.canvas.height = Math.ceil(height * scale);
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
    this.canvas.style.left = `${bounds.left}px`;
    this.canvas.style.top = `${bounds.top}px`;
    this.canvas.style.borderRadius = getComputedStyle(this.element).borderRadius;
    this.context.setTransform(scale, 0, 0, scale, 0, 0);

    this.width = width;
    this.height = height;
    this.scale = scale;
    this.referenceAscii = referenceAsciiStyle();
    this.foreground = this.referenceAscii.color;
    this.background = findBackground(this.element);
    this.prepareCells();
  }

  prepareCells() {
    const cellWidth = this.referenceAscii.fontSize * ASCII_CELL_WIDTH_RATIO;
    const cellHeight = this.referenceAscii.lineHeight;
    const columns = Math.ceil(this.width / cellWidth);
    const rows = Math.ceil(this.height / cellHeight);
    this.cells = [];
    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < columns; column += 1) {
        const seed = hashString(`${this.seed}:${column}:${row}`);
        this.cells.push({
          x: column * cellWidth,
          y: row * cellHeight,
          drawX: (column + 0.18) * cellWidth,
          drawY: (row + 0.78) * cellHeight,
          width: cellWidth + 1,
          height: cellHeight + 1,
          bornAt: acceleratedArrivalTime(noise(seed, 3), -25, 225),
          revealAt: acceleratedArrivalTime(
            noise(seed, 7),
            REVEAL_START,
            REVEAL_END
          ),
          seed,
        });
      }
    }
  }

  schedule() {
    if (this.frame || this.complete) return;
    this.frame = requestAnimationFrame((time) => this.tick(time));
  }

  tick(time) {
    this.frame = null;
    if (this.complete) return;
    this.elapsed = time - ASCII_LOAD_STARTED_AT - this.delay;
    if (time - this.lastRender >= FRAME_INTERVAL) {
      this.render();
      this.lastRender = time;
    }
    if (this.elapsed >= FORMATION_DURATION) this.finish("complete");
    else this.schedule();
  }

  render() {
    if (!this.context || this.complete) return;
    const bounds = this.element.getBoundingClientRect();
    if (Math.abs(bounds.width - this.width) > 0.5 || Math.abs(bounds.height - this.height) > 0.5) {
      this.rebuild();
    } else {
      this.canvas.style.left = `${bounds.left}px`;
      this.canvas.style.top = `${bounds.top}px`;
    }

    const elapsed = Math.max(0, this.elapsed);
    const context = this.context;
    context.save();
    context.setTransform(this.scale, 0, 0, this.scale, 0, 0);
    context.globalCompositeOperation = "source-over";
    context.globalAlpha = 1;
    context.fillStyle = this.background;
    context.fillRect(0, 0, this.width, this.height);
    context.fillStyle = this.foreground;
    context.font = `${this.referenceAscii.fontWeight} ${this.referenceAscii.fontSize}px `
      + this.referenceAscii.fontFamily;
    context.textBaseline = "alphabetic";

    const beat = Math.floor(elapsed / FRAME_INTERVAL);
    for (const cell of this.cells) {
      if (elapsed >= cell.revealAt) continue;
      if (elapsed >= cell.bornAt) {
        const character = IMAGE_GLYPHS[
          Math.floor(noise(cell.seed, beat + 40) * IMAGE_GLYPHS.length)
        ];
        context.fillText(character, cell.drawX, cell.drawY);
      }
    }

    context.globalCompositeOperation = "destination-out";
    for (const cell of this.cells) {
      if (elapsed < cell.revealAt) continue;
      context.fillRect(cell.x, cell.y, cell.width, cell.height);
    }
    context.restore();
  }

  finish(state) {
    if (this.complete) return;
    this.complete = true;
    if (this.frame) cancelAnimationFrame(this.frame);
    this.frame = null;
    this.motion.removeEventListener("change", this.onMotionChange);
    this.canvas?.remove();
    this.element.dataset.asciiRevealState = state;
  }
}

function revealableTextElements() {
  return [...document.querySelectorAll(TARGET_SELECTOR)].filter((element) => {
    if (element.closest("ascii-hero")) return false;
    if (!element.textContent?.trim()) return false;
    if (element.matches("li") && element.querySelector(BLOCK_DESCENDANT_SELECTOR)) {
      return false;
    }
    return true;
  });
}

async function initialize() {
  const elements = revealableTextElements();
  const images = [...document.querySelectorAll("main img")];
  if (!elements.length && !images.length) {
    document.documentElement.classList.remove(PREPAINT_CLASS);
    return;
  }
  try {
    await document.fonts.ready;
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    elements.forEach((element, index) => {
      new AsciiTextReveal(element, index).start();
    });

    const imageLayer = document.createElement("div");
    imageLayer.className = "ascii-image-reveal";
    imageLayer.setAttribute("aria-hidden", "true");
    document.body.append(imageLayer);
    images.forEach((element, index) => {
      new AsciiImageReveal(element, index, imageLayer).start();
    });
    // Canvas drawing and class removal happen in one rendering opportunity:
    // the browser's first visible page frame therefore contains ASCII covers,
    // never the uncovered semantic DOM that was parsed underneath.
    document.documentElement.classList.remove(PREPAINT_CLASS);
  } catch (error) {
    elements.forEach((element) => {
      element.dataset.asciiRevealState = "error";
      element.querySelector(".ascii-text-reveal__canvas")?.remove();
    });
    document.documentElement.classList.remove(PREPAINT_CLASS);
    console.warn("ASCII text reveal could not start", error);
  }
}

initialize();
