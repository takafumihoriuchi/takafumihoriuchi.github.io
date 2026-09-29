/* Loaded before CSS so a saved choice is applied before the first paint.
 * Without JavaScript, the stylesheet continues to follow the OS. */
(() => {
  const root = document.documentElement;
  const key = "portfolio-theme";
  const system = window.matchMedia("(prefers-color-scheme: dark)");
  const valid = (value) => value === "light" || value === "dark";
  let choice = null;
  let controls = [];

  function readChoice() {
    try {
      const value = localStorage.getItem(key);
      return valid(value) ? value : null;
    } catch {
      return null;
    }
  }

  function apply() {
    const theme = choice || (system.matches ? "dark" : "light");
    const changed = root.dataset.theme !== theme;
    root.dataset.theme = theme;
    for (const input of controls) input.checked = input.value === theme;
    if (changed) window.dispatchEvent(new CustomEvent("themechange", { detail: { theme } }));
  }

  choice = readChoice();
  apply();

  document.addEventListener("DOMContentLoaded", () => {
    controls = [...document.querySelectorAll('.theme-toggle input[type="radio"]')];
    apply();
    for (const input of controls) {
      input.addEventListener("change", () => {
        if (!input.checked) return;
        choice = input.value;
        try { localStorage.setItem(key, choice); } catch { /* Still works for this page. */ }
        apply();
      });
    }
    for (const toggle of document.querySelectorAll(".theme-toggle")) toggle.hidden = false;
  }, { once: true });

  system.addEventListener("change", () => { if (!choice) apply(); });
  window.addEventListener("storage", (event) => {
    if (event.key !== key && event.key !== null) return;
    choice = readChoice();
    apply();
  });
  // A page restored by Back/Forward may have missed another page's choice.
  window.addEventListener("pageshow", (event) => {
    if (!event.persisted) return;
    choice = readChoice();
    apply();
  });
})();
