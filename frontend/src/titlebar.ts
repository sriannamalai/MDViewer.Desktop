// Titlebar behavior — design/README.md §1.
//
// The drag region itself needs no JS: `data-tauri-drag-region` on the bar
// (and its left/right flex containers, so their empty flex gaps drag too)
// is handled by Tauri's webview-injected script, which only starts a drag
// when the *exact* event target carries the attribute — buttons and the
// search pill are left without it, so clicks on them behave normally.
import { getCurrentWindow } from "@tauri-apps/api/window";

export function initTitlebar(): void {
  const win = getCurrentWindow();

  // Search pill: static in v1 (no command palette yet) — intentionally a
  // no-op click per the task brief.
  document.getElementById("titlebar-search")?.addEventListener("click", () => {});

  // Layout toggle: Workbench ⇄ Reader. Flips its own label/glyph and marks
  // `data-layout` on <html> for later tasks (sidebar/outline collapse,
  // prose width) to key off of; this task doesn't yet have panel content
  // to actually reflow.
  const layoutBtn = document.getElementById("layout-toggle");
  const layoutGlyph = document.getElementById("layout-glyph");
  const layoutLabel = document.getElementById("layout-label");
  let reader = false;
  layoutBtn?.addEventListener("click", () => {
    reader = !reader;
    document.documentElement.dataset.layout = reader ? "reader" : "workbench";
    if (layoutGlyph) layoutGlyph.textContent = reader ? "▭" : "▥";
    if (layoutLabel) layoutLabel.textContent = reader ? "Reader" : "Workbench";
  });

  // Settings: disabled/no-op in v1 — Preferences overlay isn't built yet.
  document.getElementById("settings-btn")?.addEventListener("click", () => {});

  document.getElementById("win-minimize")?.addEventListener("click", () => {
    void win.minimize();
  });
  document.getElementById("win-maximize")?.addEventListener("click", () => {
    void win.toggleMaximize();
  });
  document.getElementById("win-close")?.addEventListener("click", () => {
    void win.close();
  });
}
