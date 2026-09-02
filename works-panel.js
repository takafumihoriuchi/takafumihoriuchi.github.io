/* Measures the two lengths the works panel cannot be given in a stylesheet,
 * and runs the box open between them.
 *
 * The opening itself is still a checkbox and its label; nothing here decides
 * what is shown. What a stylesheet cannot supply is where the third card ends
 * and how tall the control is, because both are sums of text that runs to a
 * different number of lines in every language — and a box cannot be animated
 * to or from `auto`. So this file writes those two numbers and steps out.
 *
 * Without it the panel still opens, still scrolls and still shows its
 * scrollbar; it arrives at once instead of travelling, and falls back to the
 * fixed height in the stylesheet. A hard-coded height was the alternative and
 * it cannot be right twice: the same three cards stand 436px tall in Japanese
 * and 520px in German, and both numbers move again with every work added.
 */

const OPEN_CARDS = 3;
const still = matchMedia("(prefers-reduced-motion: reduce)");

/* Where the third card ends, measured from the panel's own top edge so that
 * the half-leading the list carries above its first card is inside the figure,
 * and offset by the current scroll so that measuring an already-scrolled panel
 * is still right. The stylesheet decides what to do with it — take it, or cap
 * it against the window, or ignore it below the width where the cards stack.
 */
function fit(panel, list) {
  const cards = list.children;
  if (cards.length <= OPEN_CARDS) {
    panel.style.removeProperty("--panel-height");
    return;
  }

  // While the panel is closed the cards past the second are display:none and
  // have no box to measure. Leave the last good value in place; this runs
  // again on the way open, when they have one.
  const last = cards[OPEN_CARDS - 1];
  if (!last.getClientRects().length) return;

  const top = panel.getBoundingClientRect().top;
  const bottom = last.getBoundingClientRect().bottom + panel.scrollTop;
  const below = parseFloat(getComputedStyle(panel).paddingBottom) || 0;
  panel.style.setProperty("--panel-height", `${Math.ceil(bottom - top + below)}px`);
}

for (const panel of document.querySelectorAll(".works-panel")) {
  const list = panel.querySelector(".works");
  const toggle = panel.parentElement.querySelector(".works-toggle");
  const label = panel.parentElement.querySelector(".works-more");
  if (!list || !toggle) continue;

  // The height the panel is leaving from. Only meaningful while it is closed,
  // which is the only time it is written.
  let closed = null;

  const measure = () => {
    fit(panel, list);
    if (!toggle.checked) {
      closed = panel.getBoundingClientRect().height;
      if (label) {
        label.style.removeProperty("--more-height");
        label.style.setProperty("--more-height", `${label.getBoundingClientRect().height}px`);
      }
    }
  };

  // The list changes height twice over: when the panel opens and the hidden
  // cards take their place, and whenever the window is resized and the
  // descriptions rewrap. Observing the list catches both, and cannot feed back
  // into itself — the panel's height is not the list's, and the scrollbar
  // gutter the stylesheet reserves in both states keeps the width from moving
  // when the scrollbar arrives.
  new ResizeObserver(measure).observe(list);
  measure();

  toggle.addEventListener("change", () => {
    if (!toggle.checked) return;

    // Opening is one way: the label is on its way out, and leaving a checked
    // box in the tab order would leave a keyboard alone able to close a panel
    // whose control is no longer on the page. `:checked` still matches.
    toggle.disabled = true;

    // The rules for the open state already apply here, so the panel is at the
    // size the stylesheet has chosen — capped against the window, or the whole
    // list below the stacking width. Read it rather than working it out again.
    fit(panel, list);
    const open = panel.getBoundingClientRect().height;
    if (still.matches || closed === null || open <= closed) return;

    panel.style.transition = "none";
    panel.style.height = `${closed}px`;
    panel.getBoundingClientRect();
    panel.style.transition = "";
    panel.style.height = `${open}px`;

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
