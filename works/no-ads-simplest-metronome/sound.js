/* The clicks for the running screen at the top of the metronome page.
 *
 * This is an enhancement, not the mechanism. The screen runs on CSS alone —
 * the pulse is a keyframe animation, and tapping the circle is a checkbox — so
 * with this script blocked, failed, or still loading the page is complete and
 * silent. The button that asks for sound is hidden in the markup and shown
 * here, by the one thing that can make it work; both of its labels are
 * written in the page, in the page's language (OPERATIONS.md §2).
 *
 * What it adds is the app's own click, at the moment the circle swells. The
 * CSS animation keeps the time and this follows it: beat n of the bar falls
 * at the animation's start time plus n half-seconds (120 BPM, as on the
 * screen), and each click is scheduled on the audio clock so that it is
 * *heard* then — getOutputTimestamp() says which sample is reaching the
 * speaker at which moment, which is the web's counterpart of the output
 * latency the app adds for Bluetooth. Stopping the circle cancels what was
 * scheduled; starting it again starts from the downbeat, the way the CSS
 * restarts it.
 *
 * The click is ClickSound from the app: a sine at 1875 Hz on the downbeat and
 * 1250 Hz on the others at 0.6 of its level, 1 ms attack, 20 ms decay, 0.12 s
 * long. It plays at half the app's peak — a page that someone chose to hear
 * should still not be the loudest thing on their computer.
 *
 * The sound goes off, and the button with it, when the tab is hidden or the
 * screen is scrolled out of sight: nothing should keep clicking on a page
 * after the thing it belongs to has gone. A reader who asked for less motion
 * has no running screen to hear, so the button stays hidden for them.
 */
(() => {
  const figure = document.querySelector(".device");
  if (!figure) return;
  const stopped = figure.querySelector(".device__toggle");
  const circle = figure.querySelector(".device__circle");
  const holder = figure.querySelector(".device__sound");
  const button = figure.querySelector(".sound-toggle");
  const Context = window.AudioContext || window.webkitAudioContext;
  if (!stopped || !circle || !holder || !button || !Context) return;
  if (typeof circle.getAnimations !== "function") return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  const BEAT = 500;      // ms, 120 BPM
  const LOOKAHEAD = 700; // ms of clicks queued ahead; covers Bluetooth
  const TICK = 50;       // ms between passes
  const VOLUME = 0.5;

  let context = null;
  let clicks = null;     // [downbeat, other beats] as AudioBuffers
  let output = null;
  let timer = 0;
  let queued = new Map(); // beat number → source, for the current start time
  let startedAt = null;   // the downbeat the queue is counted from
  let resumedAt = Infinity;

  function click(frequency, level) {
    const rate = context.sampleRate;
    const count = Math.ceil(0.12 * rate);
    const buffer = context.createBuffer(1, count, rate);
    const samples = buffer.getChannelData(0);
    for (let i = 0; i < count; i += 1) {
      const t = i / rate;
      const envelope = t < 0.001 ? t / 0.001 : Math.exp(-(t - 0.001) / 0.02);
      const fade = Math.min(1, (0.12 - t) / 0.005);
      samples[i] = 0.9 * level * envelope * fade * Math.sin(2 * Math.PI * frequency * t);
    }
    return buffer;
  }

  function pulse() {
    return circle.getAnimations().find((a) => a.animationName === "device-pulse");
  }

  /* The audio-clock time at which a sound must start to be heard at `when`, a
     time on the page's clock. Falls back to the latencies the context reports
     where the timestamp is not available or not yet meaningful. */
  function audioTimeFor(when) {
    const now = performance.now();
    const stamp = context.getOutputTimestamp?.();
    // A context that was suspended keeps reporting the moment it stopped; a
    // stamp that old would put every click that much late.
    if (stamp && stamp.performanceTime > 0 && now - stamp.performanceTime < 500) {
      return stamp.contextTime + (when - stamp.performanceTime) / 1000;
    }
    // Just resumed, the timestamp takes a moment to arrive. Waiting for it
    // costs a beat at most; guessing without it put the first clicks up to
    // 90 ms late in testing. Past that moment, go by what the context says.
    if (stamp && now - resumedAt < 300) return null;
    const latency = (context.outputLatency || 0) + (context.baseLatency || 0);
    return context.currentTime + (when - now) / 1000 - latency;
  }

  function cancel() {
    for (const source of queued.values()) {
      try { source.stop(); } catch { /* already finished */ }
    }
    queued = new Map();
    startedAt = null;
  }

  function schedule() {
    if (!timer) return; // turned off while the context was still starting
    const animation = pulse();
    if (stopped.checked || !animation || animation.startTime === null) {
      cancel();
      return;
    }
    // Until the context is running its clock stands still, and nothing timed
    // against it would land where it was meant to.
    if (context.state !== "running") return;
    // The downbeat is where the keyframes begin: the start time plus any
    // delay the swell was held back by (see the change listener below).
    const origin = animation.startTime + animation.effect.getTiming().delay;
    if (origin !== startedAt) {
      cancel();
      startedAt = origin;
    }
    const now = performance.now();
    const first = Math.max(0, Math.ceil((now - startedAt) / BEAT));
    for (let beat = first; startedAt + beat * BEAT <= now + LOOKAHEAD; beat += 1) {
      if (queued.has(beat)) continue;
      const at = audioTimeFor(startedAt + beat * BEAT);
      if (at === null) return;
      // Too late to be heard on its beat: better missing than late.
      if (at < context.currentTime + 0.005) continue;
      const source = context.createBufferSource();
      source.buffer = clicks[beat % 4 === 0 ? 0 : 1];
      source.connect(output);
      source.start(at);
      // The queue this click belongs to: after a restart the same beat
      // number means a different click, which must not be let go here.
      const queue = queued;
      source.onended = () => {
        if (queue.get(beat) === source) queue.delete(beat);
      };
      queue.set(beat, source);
    }
  }

  function on() {
    if (!context) {
      context = new Context();
      output = context.createGain();
      output.gain.value = VOLUME;
      output.connect(context.destination);
      clicks = [click(1875, 1), click(1250, 0.6)];
    }
    button.dataset.on = "";
    timer = window.setInterval(schedule, TICK);
    context.resume().then(() => {
      resumedAt = performance.now();
      schedule();
    });
  }

  function off() {
    window.clearInterval(timer);
    timer = 0;
    cancel();
    delete button.dataset.on;
    context?.suspend();
  }

  button.addEventListener("click", () => {
    if (timer) off();
    else on();
  });
  /* How long a click started now takes to be heard. */
  function latency() {
    const heard = audioTimeFor(performance.now());
    if (heard === null) return (context.outputLatency || 0) + (context.baseLatency || 0);
    return Math.max(0, context.currentTime - heard);
  }

  stopped.addEventListener("change", () => {
    // Started again with the sound on, the first swell is held back by the
    // time the first click takes to reach the ear — what the app does, its
    // circle swelling when a click is heard rather than when it is sent — so
    // the downbeat sounds instead of being too late to schedule.
    const lead = timer && !stopped.checked && context.state === "running"
      ? latency() + 0.06
      : 0;
    figure.style.setProperty("--lead", `${lead.toFixed(3)}s`);
    if (timer) schedule();
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && timer) off();
  });
  // The enlarged figure takes the page over; the clicks stop with it.
  const lightbox = document.querySelector(".lightbox");
  if (lightbox) {
    new MutationObserver(() => {
      if (!lightbox.hidden && timer) off();
    }).observe(lightbox, { attributes: true, attributeFilter: ["hidden"] });
  }
  if ("IntersectionObserver" in window) {
    new IntersectionObserver((entries) => {
      if (timer && !entries.some((entry) => entry.isIntersecting)) off();
    }).observe(figure);
  }

  holder.hidden = false;
})();
