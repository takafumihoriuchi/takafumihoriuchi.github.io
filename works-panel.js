/* Gives the open works panel the height of exactly three cards.
 *
 * Everything else about the panel is in style.css: a checkbox opens it, the
 * entries past the second appear, the box scrolls and shows a scrollbar. This
 * file supplies the one number a stylesheet cannot hold — where the third card
 * ends — and nothing else. It writes no text and moves no element, so a reader
 * without JavaScript loses only the exactness of that edge: the panel still
 * opens, still scrolls, and falls back to the fixed height in the stylesheet.
 *
 * A hard-coded height was the alternative and it cannot be right twice. The
 * same three cards are 438px tall in Japanese and 521px in Russian, because a
 * description that fills three lines in one fills five in the other, and both
 * numbers move again each time a work is added or a sentence is edited. This
 * measures instead, in whatever language and at whatever width it finds.
 */

const OPEN_CARDS = 3;

function fit(panel, list) {
  const cards = list.children;
  if (cards.length <= OPEN_CARDS) {
    panel.style.removeProperty("--panel-height");
    return;
  }

  // While the panel is closed the cards past the second are display:none and
  // have no box to measure. Leave the last good value in place; the observer
  // below runs again on the way open, when they do.
  const last = cards[OPEN_CARDS - 1];
  if (!last.getClientRects().length) return;

  // Measured from the panel's own top edge, so the half-leading the list
  // carries above its first card is inside the figure, and offset by the
  // current scroll so that measuring a panel already scrolled is still right.
  const top = panel.getBoundingClientRect().top;
  const bottom = last.getBoundingClientRect().bottom + panel.scrollTop;
  const below = parseFloat(getComputedStyle(panel).paddingBottom) || 0;
  panel.style.setProperty("--panel-height", `${Math.ceil(bottom - top + below)}px`);
}

for (const panel of document.querySelectorAll(".works-panel")) {
  const list = panel.querySelector(".works");
  if (!list) continue;

  const measure = () => fit(panel, list);

  // The list changes height twice over: when the panel opens and the hidden
  // cards take their place, and whenever the window is resized and the
  // descriptions rewrap. Observing the list catches both, and cannot feed back
  // into itself — the panel's height is not the list's, and the scrollbar
  // gutter the stylesheet reserves in both states keeps the width from moving
  // when the scrollbar arrives.
  new ResizeObserver(measure).observe(list);

  // And again on the click itself. The observer is the general answer, but its
  // callbacks ride the rendering pipeline, and the one moment the height has to
  // be right is the moment the reader opens the panel. `change` fires before
  // that frame is painted, with the cards already laid out.
  const toggle = panel.parentElement.querySelector(".works-toggle");
  if (toggle) toggle.addEventListener("change", measure);

  measure();
}
