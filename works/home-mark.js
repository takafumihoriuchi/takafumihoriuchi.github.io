/* The band at the top of a work page, getting out of the way of the writing.
 *
 * This is an enhancement, not the mechanism. The band is a fixed element with
 * a link in it, and with the script blocked, failed, or still loading it
 * simply stays where it is — `--mark-shift` falls back to zero in the
 * stylesheet. Nothing here is the way home; it only decides when the way home
 * is on screen.
 *
 * It travels with the scroll rather than snapping between shown and hidden.
 * A band that animates out over a fixed duration is doing something the reader
 * did not ask for and cannot stop halfway; one that moves the distance the
 * page moved is the same gesture as the scroll itself, and a reader who turns
 * back a few pixels gets a few pixels of it back. That is the behaviour of
 * every long-form reader people arrive here from, and it is the reason there
 * is no CSS transition on the transform: a transition would lag behind the
 * finger it is meant to be following.
 *
 * The one thing it will not do is hide the band from someone who cannot see
 * it move. Under `prefers-reduced-motion` the listener is never attached.
 */
(() => {
  const mark = document.querySelector(".home-mark");
  if (!mark) return;

  const motion = window.matchMedia("(prefers-reduced-motion: reduce)");

  /* Rubber-banding at either end of the document reports a scroll position
     outside it, and a negative reading would otherwise be spent unhiding a
     band that is already down. */
  const position = () => Math.max(0, window.scrollY);

  let shift = 0;
  let height = 0;
  let last = position();
  let frame = 0;

  function apply() {
    mark.style.setProperty("--mark-shift", `${shift}px`);
  }

  /* Measuring inside the scroll handler would read layout on every frame of
     every scroll. The band's height changes with the window — the name wraps
     at no width it is ever given, but the root font size can change under the
     reader — so it is measured when that happens instead. Read with the shift
     backed out, since `offsetHeight` is the border box and the transform does
     not alter it, but a future change to how the band is lifted might. */
  function measure() {
    height = mark.offsetHeight;
    if (shift > height) {
      shift = height;
      apply();
    }
  }

  function settle() {
    frame = 0;
    const y = position();
    const travelled = y - last;
    last = y;

    /* At the top of the document the band is always down. Otherwise it takes
       the scroll's own distance, clamped to its height: down past its full
       height is still down, and up past zero is still up. */
    shift = y === 0 ? 0 : Math.min(height, Math.max(0, shift + travelled));
    apply();
  }

  function onScroll() {
    if (!frame) frame = requestAnimationFrame(settle);
  }

  /* Tabbing to the link is a request for the link. If the band is up at that
     moment, focus is on something the reader cannot see, and the page appears
     to have swallowed the keystroke. */
  function reveal() {
    shift = 0;
    apply();
  }

  function attach() {
    if (motion.matches) {
      window.removeEventListener("scroll", onScroll);
      reveal();
      return;
    }
    measure();
    last = position();
    window.addEventListener("scroll", onScroll, { passive: true });
  }

  window.addEventListener("resize", measure, { passive: true });
  mark.addEventListener("focusin", reveal);

  /* Safari before 14 has `addListener` and not `addEventListener` here. The
     preference is one a reader can change while the page is open. */
  if (motion.addEventListener) motion.addEventListener("change", attach);
  else if (motion.addListener) motion.addListener(attach);

  attach();
})();
