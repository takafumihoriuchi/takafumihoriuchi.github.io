/* Enlarging a figure without leaving the page. Shared by every work page.
 *
 * This is an enhancement, not the mechanism. Each figure that enlarges is an
 * ordinary link to the full-size file, so with the script blocked, failed, or
 * still loading, a click opens that file exactly as it did before. All the
 * script does is keep the reader here instead — same scroll position, same
 * place in the argument.
 *
 * Which figures enlarge is decided in the markup, not here: a figure whose
 * image is wrapped in a link to the image enlarges, one that is not wrapped
 * does not. That keeps the decision — "is this readable where it sits?" —
 * next to the picture it is about, and gives the no-JS fallback for free.
 *
 * It writes no text. The overlay's markup, including the two strings it needs,
 * is in the document, where it is written in that page's language along with
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

    /* A line-art figure is inverted where it sits in a dark page. Enlarged, it
       has to be the same drawing — an enlargement that changes the picture is
       showing you a different one. */
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
    if (supportsInert && main) main.inert = true;

    opener = link;
    closeButton.focus();
  }

  function close() {
    if (box.hidden) return;
    box.hidden = true;
    image.removeAttribute("src");
    image.alt = "";
    box.classList.remove("is-line-art");
    root.classList.remove("lightbox-open");
    root.style.removeProperty("--lightbox-gutter");
    if (supportsInert && main) main.inert = false;
    /* Focus goes back to the figure it came from, so the keyboard does not
       restart at the top of the document. Only after `inert` is lifted — a
       focus call into an inert subtree does nothing. */
    if (opener) opener.focus();
    opener = null;
  }

  /* Every link in the article whose whole content is an image, pointing at an
     image file. Written as a property of the link rather than a list of the
     classes that happen to use it today, so a new figure on a new page is
     enlargeable by being marked up the same way, with nothing to add here. */
  const IMAGE_FILE = /\.(webp|png|jpe?g|svg|gif|avif)(\?.*)?$/i;

  for (const link of (main || document).querySelectorAll("a[href]")) {
    if (!IMAGE_FILE.test(link.getAttribute("href"))) continue;
    if (link.children.length !== 1) continue;
    if (link.firstElementChild.tagName !== "IMG") continue;

    link.setAttribute("aria-haspopup", "dialog");
    link.addEventListener("click", (event) => {
      /* Anything that means "open this somewhere else" is left to the browser:
         middle click, and the modifier a reader uses for a new tab or window. */
      if (event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      open(link);
    });
  }

  /* The backdrop is the overlay itself, so a click that lands on it — rather
     than on the image inside it — is a click outside the picture. */
  box.addEventListener("click", (event) => {
    if (event.target === box || closeButton.contains(event.target)) close();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") close();
  });
})();
