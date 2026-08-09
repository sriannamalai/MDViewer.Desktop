// Theme switching. Sets `data-theme` on <html> (`:root`), which is what
// every `--t-*` custom property in tokens.css keys off of — every other
// module just reads `var(--t-*)` and never touches the theme directly.
//
// Persistence across sessions is main.ts's job (it calls `initTheme()`
// with the value `appstate.load()` restored, and persists further changes
// via a second `#theme-toggle` listener registered after this module's
// own) — this module itself stays persistence-agnostic, just current
// theme + DOM application.

export type Theme = "light" | "dark";

let current: Theme = "light";

export function getTheme(): Theme {
  return current;
}

export function setTheme(theme: Theme): void {
  current = theme;
  document.documentElement.dataset.theme = theme;
  const glyph = document.getElementById("theme-glyph");
  if (glyph) {
    // ☾ (moon) in light mode invites switching to dark; ☀ (sun) in dark
    // mode invites switching back — matches design/README.md §1.
    glyph.textContent = theme === "dark" ? "☀" : "☾";
  }
}

export function toggleTheme(): void {
  setTheme(current === "dark" ? "light" : "dark");
}

/** Wires the titlebar's theme-toggle button and applies the initial theme. */
export function initTheme(initial: Theme = "light"): void {
  setTheme(initial);
  document.getElementById("theme-toggle")?.addEventListener("click", toggleTheme);
}
