/*
 * Hero background interaction:
 * A field of small note/wave-like particles drifts slowly and is
 * gently attracted toward the pointer (or the last touch point).
 * Scoped to the hero section only — the rest of the page is static.
 */
(function () {
  "use strict";

  const hero = document.getElementById("hero");
  const canvas = document.getElementById("hero-canvas");
  if (!hero || !canvas) return;

  const ctx = canvas.getContext("2d");
  const prefersReducedMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)"
  ).matches;

  const isTouchDevice = window.matchMedia("(pointer: coarse)").matches;

  const COLORS = ["rgba(30, 58, 138, 0.35)", "rgba(125, 211, 252, 0.45)"];
  const PARTICLE_COUNT_DENSITY = 0.00009; // particles per px^2, capped below
  const MAX_PARTICLES = 90;
  const ATTRACT_RADIUS = 180;
  const ATTRACT_STRENGTH = 0.035;
  const FRICTION = 0.96;

  let width = 0;
  let height = 0;
  let dpr = Math.min(window.devicePixelRatio || 1, 2);
  let particles = [];
  let pointer = { x: null, y: null, active: false };
  let rafId = null;

  function resize() {
    const rect = hero.getBoundingClientRect();
    width = rect.width;
    height = rect.height;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = width + "px";
    canvas.style.height = height + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const count = Math.min(
      MAX_PARTICLES,
      Math.round(width * height * PARTICLE_COUNT_DENSITY)
    );
    particles = createParticles(count);
  }

  function createParticles(count) {
    const list = [];
    for (let i = 0; i < count; i++) {
      list.push({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 0.3,
        vy: (Math.random() - 0.5) * 0.3,
        radius: 1.5 + Math.random() * 2.5,
        color: COLORS[i % COLORS.length],
        phase: Math.random() * Math.PI * 2,
      });
    }
    return list;
  }

  function step(time) {
    ctx.clearRect(0, 0, width, height);

    for (const p of particles) {
      // gentle drift, like a note floating on a slow current
      p.phase += 0.004;
      p.vx += Math.cos(p.phase) * 0.002;
      p.vy += Math.sin(p.phase) * 0.002;

      if (pointer.active) {
        const dx = pointer.x - p.x;
        const dy = pointer.y - p.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < ATTRACT_RADIUS && dist > 0.01) {
          const force = ((ATTRACT_RADIUS - dist) / ATTRACT_RADIUS) * ATTRACT_STRENGTH;
          p.vx += (dx / dist) * force;
          p.vy += (dy / dist) * force;
        }
      }

      p.vx *= FRICTION;
      p.vy *= FRICTION;
      p.x += p.vx;
      p.y += p.vy;

      // wrap around edges so particles never "run out"
      if (p.x < -10) p.x = width + 10;
      if (p.x > width + 10) p.x = -10;
      if (p.y < -10) p.y = height + 10;
      if (p.y > height + 10) p.y = -10;

      ctx.beginPath();
      ctx.fillStyle = p.color;
      ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
      ctx.fill();
    }

    rafId = requestAnimationFrame(step);
  }

  function drawStatic() {
    // Reduced-motion fallback: draw particles once, no animation loop.
    ctx.clearRect(0, 0, width, height);
    for (const p of particles) {
      ctx.beginPath();
      ctx.fillStyle = p.color;
      ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function handlePointerMove(clientX, clientY) {
    const rect = hero.getBoundingClientRect();
    pointer.x = clientX - rect.left;
    pointer.y = clientY - rect.top;
    pointer.active = true;
  }

  function handlePointerLeave() {
    pointer.active = false;
  }

  function init() {
    resize();

    if (prefersReducedMotion) {
      drawStatic();
      window.addEventListener("resize", () => {
        resize();
        drawStatic();
      });
      return;
    }

    if (isTouchDevice) {
      hero.addEventListener(
        "touchmove",
        (e) => {
          const touch = e.touches[0];
          if (touch) handlePointerMove(touch.clientX, touch.clientY);
        },
        { passive: true }
      );
      hero.addEventListener("touchend", handlePointerLeave, { passive: true });
    } else {
      hero.addEventListener("mousemove", (e) => {
        handlePointerMove(e.clientX, e.clientY);
      });
      hero.addEventListener("mouseleave", handlePointerLeave);
    }

    let resizeTimeout;
    window.addEventListener("resize", () => {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(resize, 150);
    });

    rafId = requestAnimationFrame(step);
  }

  init();
})();
