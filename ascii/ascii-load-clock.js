/* The one clock the load reveal runs on.
 *
 * Every renderer on the page — the drawing above the first section, the words
 * under it, the pictures further down — reads its position from this single
 * origin. That is what keeps a busy frame from postponing the end: a dropped
 * frame skips visual steps, and an element below the fold is already finished
 * by the time it is scrolled to.
 *
 * What the origin must not be is the moment this module is evaluated, which
 * is what it used to be. Between evaluation and the first frame anybody could
 * see, the page still has to load its fonts, settle the layout those fonts
 * change, wait for the scene it is going to draw, and let every renderer
 * measure and cover its own element. On a work page with a hundred covered
 * elements that is most of the 625ms the formation lasts — measured at 613ms
 * of it on a warm local load — and over a slow connection it is all of it. The
 * animation was being spent before there was anything on screen to spend it
 * on, so what the reader got was the finished page.
 *
 * So the origin is set by hand, once, by the renderer that owns the page
 * cover: after the covers are drawn and the tab is in front of somebody. Until
 * then the clock reads zero, which is the beginning of the formation rather
 * than the far side of it.
 */

let origin = null;
let announce;
const started = new Promise((resolve) => {
  announce = resolve;
});
const holds = new Set();

/* Something the reveal should be waiting for. The hero registers its scene
   fetch, so the drawing and the words still form as one thing when
   scenes.json is the slow part of the load. A hold that rejects is a hold
   that is over: a failed fetch must not keep the page under its cover. */
export function holdAsciiLoad(promise) {
  holds.add(Promise.resolve(promise).then(() => {}, () => {}));
}

export function settledAsciiLoadHolds() {
  return Promise.all([...holds]);
}

/* Idempotent: the first caller fixes the origin for the whole page. */
export function startAsciiLoadClock() {
  if (origin === null) {
    origin = performance.now();
    announce(origin);
  }
  return origin;
}

export function asciiLoadHasStarted() {
  return origin !== null;
}

/* Resolves when the clock starts, for a renderer that is ready before the
   page is. */
export function asciiLoadStarted() {
  return started;
}

export function asciiLoadElapsed(now = performance.now()) {
  return origin === null ? 0 : now - origin;
}
