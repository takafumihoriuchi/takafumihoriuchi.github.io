/* Keep the original image links as a no-JavaScript fallback, but open them in
 * a modal viewer when the browser supports <dialog>. The page remains at the
 * reader's current scroll position, and the native dialog restores focus to
 * the selected image after it closes. */

const dialog = document.querySelector(".image-lightbox");

if (dialog && typeof dialog.showModal === "function") {
  const enlarged = dialog.querySelector(".image-lightbox__image");
  const close = dialog.querySelector(".image-lightbox__close");
  const links = document.querySelectorAll(".deck a, .paper-figure a");

  for (const link of links) {
    const thumbnail = link.querySelector("img");
    if (!thumbnail) continue;

    link.setAttribute("aria-haspopup", "dialog");
    link.addEventListener("click", (event) => {
      event.preventDefault();
      enlarged.src = link.href;
      enlarged.alt = thumbnail.alt;
      document.documentElement.classList.add("lightbox-open");
      dialog.showModal();
    });
  }

  close.addEventListener("click", () => dialog.close());

  // The dialog itself is the semi-transparent area around the image panel.
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  });

  dialog.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    event.preventDefault();
    dialog.close();
  });

  dialog.addEventListener("close", () => {
    document.documentElement.classList.remove("lightbox-open");
    enlarged.removeAttribute("src");
    enlarged.alt = "";
  });
}
