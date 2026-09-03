/* Enlarging a figure without leaving the page.
 *
 * Shared by every language version of this work, for the same reason page.css
 * is a file rather than a <style> block: inline, this would become fourteen
 * copies of identical behaviour, and the fourteenth would eventually stop
 * matching the first.
 *
 * This is an enhancement, not the mechanism. Each figure's image is wrapped in
 * an ordinary link to the full-resolution file, so with the script blocked,
 * failed, or still loading, a click opens that file exactly as it did before.
 * All the script does is keep the reader here instead.
 *
 * It writes no text. The overlay's markup — including the two strings it needs
 * — is in the document, where it is written in that page's language like
 * everything else; the script only moves the image's own `alt` across. See
 * OPERATIONS.md §2.
 */
(() => {
  const box = document.querySelector(".lightbox");
  if (!box) return;

  const image = box.querySelector(".lightbox__image");
  const closeButton = box.querySelector(".lightbox__close");
  const main = document.querySelector("main");
  const root = document.documentElement;
  const supportsInert = "inert" in HTMLElement.prototype;
  let opener = null;

  function open(link) {
    const source = link.querySelector("img");
    image.src = link.href;
    image.alt = source ? source.alt : "";
    /* The two UML diagrams are inverted for dark mode where they sit in the
       page; enlarged, they have to be the same drawing. */
    box.classList.toggle("is-line-art", Boolean(link.closest(".line-art")));
    box.hidden = false;

    /* Where the scrollbar takes room from the layout rather than floating over
       it, removing the scroll without replacing that width slides the page
       sideways under the overlay — and slides it back on close. */
    const gutter = window.innerWidth - root.clientWidth;
    if (gutter > 0) root.style.setProperty("--lightbox-gutter", `${gutter}px`);
    root.classList.add("lightbox-open");

    /* `inert` is the trap: it takes the page behind the overlay out of the tab
       order and out of the accessibility tree in one property. Where it is not
       supported the overlay still works, it just does not hold focus. */
    if (supportsInert) main.inert = true;

    opener = link;
    closeButton.focus();
  }

  function close() {
    if (box.hidden) return;
    box.hidden = true;
    image.removeAttribute("src");
    root.classList.remove("lightbox-open");
    root.style.removeProperty("--lightbox-gutter");
    if (supportsInert) main.inert = false;
    /* Focus goes back to the figure it came from, so the keyboard does not
       restart at the top of the document. Only after `inert` is lifted — a
       focus call into an inert subtree does nothing. */
    if (opener) opener.focus();
    opener = null;
  }

  document.querySelectorAll(".paper-figure > a, .figure-pair > a").forEach((link) => {
    link.addEventListener("click", (event) => {
      /* Anything that means "open this somewhere else" is left to the browser:
         middle click, and the modifier a reader uses for a new tab or window. */
      if (event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      open(link);
    });
  });

  /* The backdrop is the overlay itself, so a click that lands on it — rather
     than on the image inside it — is a click outside the picture. */
  box.addEventListener("click", (event) => {
    if (event.target === box || closeButton.contains(event.target)) close();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") close();
  });
})();
