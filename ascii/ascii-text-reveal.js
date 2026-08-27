const TARGET_SELECTOR = ".home-identity h1, .home-identity > .tagline";
const FRAME_INTERVAL = 1000 / 6;
const FORMATION_DURATION = 1250;
const REVEAL_START = 280;
const REVEAL_END = 1160;
const EARLY_GLYPHS = [".", ".", ":", "'"];
const WOBBLE_GLYPHS = [".", ":", "*", "+", "-"];

function clamp(value, minimum = 0, maximum = 1) {
  return Math.min(maximum, Math.max(minimum, value));
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
    glyphs[glyphIndex].revealAt = REVEAL_START
      + clamp(evenProgress + jitter) * (REVEAL_END - REVEAL_START);
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
  const fontSize = parseFloat(style?.fontSize) || 8;
  const lineHeight = parseFloat(style?.lineHeight);
  return {
    element: canvas,
    color: hero ? getComputedStyle(hero).color : "currentColor",
    fontFamily: style?.fontFamily || "ui-monospace, monospace",
    fontSize,
    fontWeight: style?.fontWeight || "500",
    lineHeight: Number.isFinite(lineHeight) ? lineHeight : fontSize * 1.08,
  };
}

class AsciiTextReveal {
  constructor(element, index) {
    this.element = element;
    this.index = index;
    this.seed = hashString(`${location.pathname}:${index}:${element.textContent}`);
    this.elapsed = -index * 110;
    this.lastTick = null;
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

  prepareParticles() {
    this.asciiSize = this.referenceAscii.fontSize;
    const cellWidth = this.asciiSize * 0.62;
    const cellHeight = this.referenceAscii.lineHeight;
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
          particles.push({
            glyphIndex,
            targetX,
            targetY,
            seed: particleSeed,
            bornAt: noise(particleSeed, 3)
              * Math.min(760, Math.max(180, glyph.revealAt - 60)) - 60,
            character: this.particleCharacter(targetX, targetY, particleSeed),
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
    if (this.lastTick === null) this.lastTick = time;
    const delta = Math.min(time - this.lastTick, 50);
    this.lastTick = time;
    this.elapsed += delta;

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
    context.textBaseline = "alphabetic";
    context.direction = "ltr";
    for (const particle of this.particles) {
      const glyph = this.glyphs[particle.glyphIndex];
      if (elapsed >= glyph.revealAt || elapsed < particle.bornAt) continue;
      const age = elapsed - particle.bornAt;
      const beat = Math.floor(elapsed / FRAME_INTERVAL)
        + Math.floor(noise(particle.seed, 12) * 3);
      if (age < 180 && noise(particle.seed, beat + 200) < 0.28) continue;

      let character;
      if (age < 190) {
        character = EARLY_GLYPHS[
          Math.floor(noise(particle.seed, beat + 20) * EARLY_GLYPHS.length)
        ];
      } else if (elapsed < glyph.revealAt - 120) {
        const choices = [...WOBBLE_GLYPHS, particle.character];
        character = choices[
          Math.floor(noise(particle.seed, beat + 40) * choices.length)
        ];
      } else {
        character = particle.character;
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

async function initialize() {
  if (document.documentElement.lang !== "ja") return;
  const elements = [...document.querySelectorAll(TARGET_SELECTOR)];
  if (!elements.length) return;
  try {
    await document.fonts.ready;
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    elements.forEach((element, index) => new AsciiTextReveal(element, index).start());
  } catch (error) {
    elements.forEach((element) => {
      element.dataset.asciiRevealState = "error";
      element.querySelector(".ascii-text-reveal__canvas")?.remove();
    });
    console.warn("ASCII text reveal could not start", error);
  }
}

initialize();
