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

// -------------------------------------------------------- Preferences "Auto"
// design/README.md §9: Theme = Light/Dark/Auto. "Auto" isn't a `Theme`
// value itself (every other module — viewer.ts, chrome.css via
// data-theme — only ever needs the two resolved values) — it's a
// preferences-only concept that main.ts resolves into a concrete `Theme`
// via the functions below, then feeds through the same setTheme() path as
// a manual pick.

/** Resolves "auto" against the OS's current color-scheme preference; light/dark pass through unchanged. */
export function resolveThemeMode(mode: Theme | "auto"): Theme {
  if (mode !== "auto") return mode;
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

let autoQuery: MediaQueryList | null = null;
let autoHandler: (() => void) | null = null;

/** Starts (or restarts) watching the OS color-scheme preference, calling `onChange` with the newly-resolved theme on every change. No-op call to `unwatchAutoTheme()` first is required by no one — this replaces any previous listener itself. */
export function watchAutoTheme(onChange: (theme: Theme) => void): void {
  unwatchAutoTheme();
  if (!window.matchMedia) return;
  autoQuery = window.matchMedia("(prefers-color-scheme: dark)");
  autoHandler = () => onChange(autoQuery!.matches ? "dark" : "light");
  autoQuery.addEventListener("change", autoHandler);
}

/** Stops watching the OS color-scheme preference (leaving Auto mode for an explicit Light/Dark pick). */
export function unwatchAutoTheme(): void {
  if (autoQuery && autoHandler) autoQuery.removeEventListener("change", autoHandler);
  autoQuery = null;
  autoHandler = null;
}
