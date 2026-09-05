/* Measures the two lengths the works panel cannot be given in a stylesheet,
 * and runs the box open between them.
 *
 * The opening itself is still a checkbox and its label; nothing here decides
 * which entries are shown. What a stylesheet cannot supply is the list's open
 * height and the control's height, because both are sums of text that runs to a
 * different number of lines in every language — and a box cannot be animated
 * to or from `auto`. So this file reads those two numbers and steps out.
 *
 * Without it the panel still opens and shows every card; it arrives at once
 * instead of travelling. A hard-coded height was the alternative and it cannot
 * be right twice: every language wraps differently, and every new work changes
 * the answer again.
 */

import { asciiDissolve } from "./ascii/ascii-text-reveal.js?v=20260904-7";

/* This is the one switch between the two supported presentations:
 *
 *   "all"    shows the whole list in the page, without an inner scrollbar.
 *   "scroll" restores the four-card window and its inner scrollbar.
 *
 * Two cards remain on show before the control is pressed in either mode.
 */
const OPEN_MODE = "all";
const SCROLL_MODE = "scroll";
const SCROLL_OPEN_CARDS = 4;
// A little longer than the 340ms the box takes to be carried off, so the last
// particles go out after the movement has settled rather than with it.
const DISSOLVE_DURATION = 420;
const still = matchMedia("(prefers-reduced-motion: reduce)");
const stacked = matchMedia("(max-width: 32rem)");

/* In scroll mode, writes where the fourth card ends from the panel's own top
 * edge. The stylesheet takes that value or caps it against the window. All mode
 * has no cap to measure: the panel's natural height is the open height, however
 * many cards the list acquires.
 */
function fit(panel, list) {
  if (OPEN_MODE !== SCROLL_MODE) {
    panel.style.removeProperty("--panel-height");
    return;
  }

  const cards = list.children;
  if (cards.length <= SCROLL_OPEN_CARDS) {
    panel.style.removeProperty("--panel-height");
    return;
  }

  // While the panel is closed the cards past the second are display:none and
  // have no box to measure. Leave the last good value in place; this runs
  // again on the way open, when they have one.
  const last = cards[SCROLL_OPEN_CARDS - 1];
  if (!last.getClientRects().length) return;

  const top = panel.getBoundingClientRect().top;
  const bottom = last.getBoundingClientRect().bottom + panel.scrollTop;
  const below = parseFloat(getComputedStyle(panel).paddingBottom) || 0;
  panel.style.setProperty("--panel-height", `${Math.ceil(bottom - top + below)}px`);
}

/* Carries the window down with the panel as it grows, landing with the band the
 * box occupied still lying between the panel and the bottom of the window.
 *
 * Without it the box does the reader a disservice: the panel grows downward,
 * the newly revealed cards open below the fold, and pressing `show more` earns a
 * scroll before it shows anything more. The page below the section does not
 * move on screen while this runs — it is pushed down by exactly what the
 * window travels — so what changes is the panel filling the space, which is
 * what was asked for.
 *
 * The band is left empty rather than closed up, and that is the point of it:
 * the box is coming apart into ASCII in exactly that band while the travel
 * runs, and a window landing on the panel's own edge would carry it off the
 * bottom of the screen unwatched. Landing a band short keeps it in sight for
 * the whole of its dissolve — and since the band is measured from the panel's
 * bottom edge to the box's, the box cannot leave the screen on the way either:
 * it starts on screen, because it was just pressed, and it ends a band above
 * the window's edge, and it travels between the two.
 *
 * No easing of its own. Each frame it reads how far the panel has actually
 * grown and takes that same fraction of its own distance, so the two cannot
 * come apart whatever curve the stylesheet is running, and a transition that
 * never starts simply arrives at once. It lets go the moment the page is not
 * where it left it — a wheel, a trackpad, a key: the reader's scroll wins.
 */
function follow(panel, closed, open, rest) {
  const from = scrollY;
  let mine = from;

  const step = () => {
    if (Math.abs(scrollY - mine) > 2) return;

    const grown = (panel.getBoundingClientRect().height - closed) / (open - closed);
    const at = Math.min(1, Math.max(0, grown));

    scrollTo({ top: from + (rest - from) * at, behavior: "instant" });

    // Read back rather than trust: near the end of the page the browser has
    // less scroll to give than was asked for, and next frame's check must be
    // against where the page really is.
    mine = scrollY;
    if (at < 1) requestAnimationFrame(step);
  };

  requestAnimationFrame(step);
}

for (const panel of document.querySelectorAll(".works-panel")) {
  const list = panel.querySelector(".works");
  const toggle = panel.parentElement.querySelector(".works-toggle");
  const label = panel.parentElement.querySelector(".works-more");
  if (!list || !toggle) continue;

  // CSS owns both presentations; this attribute selects one without making
  // every translated page repeat a mode setting.
  panel.dataset.openMode = OPEN_MODE;

  // The height the panel is leaving from. Only meaningful while it is closed,
  // which is the only time it is written.
  let closed = null;

  // And the band the box takes below it — the box's own height plus the margin
  // above it, less the overhang the panel holds for the cards' hover wash;
  // 48.17px in all fourteen. Measured rather than worked out, because those
  // three lengths are in the stylesheet and one of them is negative. It has to
  // be read while the panel is closed: by the time the box is pressed the
  // rules for the open state already apply and the box is flat.
  let room = 0;

  // Where the page stood when the box was pressed. A pointer on the label hands
  // focus to the checkbox as part of the click, and a browser brings a newly
  // focused element into view — so by the time `change` arrives the page can
  // already have moved, to a place nobody asked for and, the checkbox being a
  // clipped 1px square, with nothing to show for it. Measured at 904px down the
  // Japanese page, the click alone throws it back to 488.
  //
  // The capture-phase click on the label is the last moment before that
  // happens, and the whole of it — jump, change, and the correction below — is
  // one click with no paint in the middle, so there is nothing to see. Nothing
  // is read on the keyboard path: space on a focused checkbox dispatches its
  // click on the checkbox and never on the label, it holds focus already so it
  // never jumps, and a control arrived at by tabbing *should* be scrolled to.
  let held = null;
  if (label) label.addEventListener("click", () => { held = scrollY; }, true);

  const measure = () => {
    fit(panel, list);
    if (!toggle.checked) {
      closed = panel.getBoundingClientRect().height;
      if (label) {
        label.style.removeProperty("--more-height");
        label.style.setProperty("--more-height", `${label.getBoundingClientRect().height}px`);
        room = label.getBoundingClientRect().bottom - panel.getBoundingClientRect().bottom;
      }
    }
  };

  // The list changes height twice over: when the panel opens and the hidden
  // cards take their place, and whenever the window is resized and the
  // descriptions rewrap. Observing the list catches both, and cannot feed back
  // into itself — the panel's height is not the list's. In optional scroll mode
  // its reserved gutter also keeps the width from moving when the bar arrives.
  new ResizeObserver(measure).observe(list);
  measure();

  toggle.addEventListener("change", () => {
    if (!toggle.checked) return;

    // Opening is one way: the label is on its way out, and leaving a checked
    // box in the tab order would leave a keyboard alone able to close a panel
    // whose control is no longer on the page. `:checked` still matches.
    toggle.disabled = true;

    if (held !== null && scrollY !== held) scrollTo({ top: held, behavior: "instant" });
    held = null;

    // The rules for the open state already apply here, so the panel is at the
    // size the stylesheet has chosen — capped against the window, or the whole
    // list below the stacking width. Read it rather than working it out again.
    fit(panel, list);
    const open = panel.getBoundingClientRect().height;

    // Where the page has to come to rest for the last card on show to sit a
    // band above the bottom edge of the window. Measured now, while the panel
    // is at its open size and has not started moving: it grows downward, so
    // its top is still where it was and this one reading holds for the whole
    // movement.
    const rest = panel.getBoundingClientRect().top + scrollY + open + room - innerHeight;

    // Downward only — a box that says `more` should not take the reader back
    // up the page. In all mode a long desktop list can exceed the window, but
    // the page can still follow its growing bottom just as it followed the
    // fourth card before; this also keeps the behaviour useful as works are
    // added. On a stacked phone the current rule remains: one card can already
    // fill most of the screen, so racing through several of them would be less
    // helpful than leaving the reader where they pressed.
    const canFollow = open + room <= innerHeight ||
      (OPEN_MODE === "all" && !stacked.matches);
    const carry = canFollow && rest > scrollY ? rest : null;

    if (still.matches) {
      // Reduced motion asks for the outcome without the travel, and that
      // includes this: the page arrives rather than goes.
      if (carry !== null) scrollTo({ top: carry, behavior: "instant" });
      return;
    }

    // The box comes apart into the ASCII the page was built out of, which is
    // the load animation read backwards. It is measured from the drawn box
    // rather than the label around it: the renderer's canvas sits inside the
    // border, so the outline is left for the stylesheet to fade (it would
    // otherwise be painted over in the first frame and vanish on the click).
    //
    // The label is clipping its own content so that the collapse above has
    // something to clip. For as long as the box is coming apart it must not:
    // the drawing keeps the size it was measured at while the label shrinks
    // out from under it, and the last of it would otherwise be sliced off.
    const box = label?.querySelector(".works-more__box");
    if (box) {
      label.style.overflow = "visible";
      asciiDissolve(box, { duration: DISSOLVE_DURATION });
      setTimeout(() => label.style.removeProperty("overflow"), DISSOLVE_DURATION + 80);
    }

    if (closed === null || open <= closed) {
      if (carry !== null) scrollTo({ top: carry, behavior: "instant" });
      return;
    }

    panel.style.transition = "none";
    panel.style.height = `${closed}px`;
    panel.getBoundingClientRect();
    panel.style.transition = "";
    panel.style.height = `${open}px`;

    if (carry !== null) follow(panel, closed, open, carry);

    // Hand the panel back to the stylesheet on arrival, so that a window
    // resized afterwards is governed by the rules there rather than by a
    // length measured for a window that is gone.
    const done = (event) => {
      if (event && event.propertyName !== "height") return;
      panel.style.height = "";
      panel.removeEventListener("transitionend", done);
    };
    panel.addEventListener("transitionend", done);
    setTimeout(done, 800);
  });
}
