/* The app's day scale, shown beside the discarded stepped scale.
   Units and explanatory text belong to the HTML; this file only computes
   values. The complete 65-minute illustration survives without this script. */
(() => {
  const figure = document.querySelector('.pl-dayscale');
  if (!figure) return;
  const control = figure.querySelector('.pl-dayscale__control');
  const input = control.querySelector('input');
  const output = control.querySelector('output');
  const adopted = figure.querySelector('[data-scale="adopted"]');
  const rejected = figure.querySelector('[data-scale="rejected"]');
  const hour = figure.dataset.unitHour, minute = figure.dataset.unitMinute;

  // Verbatim logic from lib/timeline-axis.ts, v1.0-build2. Only TypeScript
  // annotations and export keywords were removed. Source and comparison
  // checks live in source/redesign/cp2/verify.mjs.
  const HOUR = 3600000;
  function timelineAxisCandidates(scale) {
    const hours = Array.from({ length: Math.floor(scale / HOUR) }, (_, i) => (i + 1) * HOUR);
    return [...new Set([0, HOUR / 2, ...hours, scale])];
  }

  function visibleTimelineTicks(scale, width, labels) {
    if (width <= 0 || scale < HOUR) return [];
    const gap = 8;
    const endLeft = width - (labels.get(scale) ?? 0);
    let previousRight = labels.get(0) ?? 0;
    const visible = [];
    const fits = (time) => {
      const center = time / scale * width;
      const half = (labels.get(time) ?? 0) / 2;
      return center - half >= previousRight + gap && center + half + gap <= endLeft;
    };
    if (scale === HOUR) return fits(HOUR / 2) ? [HOUR / 2] : [];
    for (let time = HOUR; time < scale; time += HOUR) {
      if (!fits(time)) continue;
      visible.push(time);
      previousRight = time / scale * width + (labels.get(time) ?? 0) / 2;
    }
    if (scale < 2 * HOUR && visible.length === 0 && fits(HOUR / 2)) return [HOUR / 2];
    return visible;
  }

  const format = minutes => {
    if (!minutes) return '0';
    if (minutes < 60) return minutes + minute;
    const rest = minutes % 60;
    return Math.floor(minutes / 60) + hour + (rest ? String(rest).padStart(2, '0') + minute : '');
  };
  const measure = document.createElement('span');
  measure.className = 'pl-dayscale__measure';
  measure.setAttribute('aria-hidden', 'true');
  figure.append(measure);
  const labelWidth = time => {
    measure.textContent = format(time / 60000);
    return measure.getBoundingClientRect().width;
  };

  function draw(row, minutes, maximum, ticks) {
    const bar = row.querySelector('.pl-dayscale__bar');
    bar.style.setProperty('--maximum', maximum);
    let remaining = minutes;
    for (const segment of bar.children) {
      const duration = Math.min(remaining, Number(segment.dataset.duration));
      segment.style.setProperty('--minutes', duration);
      segment.hidden = duration === 0;
      remaining -= duration;
    }
    const labels = ticks.map(value => {
      const span = document.createElement('span');
      span.textContent = format(value);
      span.dataset.minutes = value;
      span.style.setProperty('--position', value / maximum * 100);
      return span;
    });
    row.querySelector('.pl-dayscale__ticks').replaceChildren(...labels);
  }

  function update() {
    const minutes = Number(input.value);
    const scale = Math.max(60, minutes), milliseconds = scale * 60000;
    const labels = new Map(timelineAxisCandidates(milliseconds).map(t => [t, labelWidth(t)]));
    const width = adopted.querySelector('.pl-dayscale__bar').getBoundingClientRect().width;
    const ticks = visibleTimelineTicks(milliseconds, width, labels).map(t => t / 60000);
    draw(adopted, minutes, scale, [0, ...ticks, scale]);
    const stepped = minutes <= 60 ? 60 : minutes <= 90 ? 90 : 120;
    draw(rejected, minutes, stepped, Array.from({ length: stepped / 30 + 1 }, (_, i) => i * 30));
    const value = minutes ? format(minutes) : '0' + minute;
    output.value = value;
    input.setAttribute('aria-valuetext', value);
    figure.querySelector('[data-print-value]').textContent = value;
  }

  update();
  control.hidden = false;
  figure.dataset.enhanced = '';
  figure.querySelector('[data-static-caption]').hidden = true;
  figure.querySelector('[data-interactive-caption]').hidden = false;
  input.addEventListener('input', update);
  new ResizeObserver(update).observe(adopted.querySelector('.pl-dayscale__bar'));
  document.fonts?.ready.then(update);
})();
