// Titlebar behavior — design/README.md §1.
//
// The drag region itself needs no JS: `data-tauri-drag-region` on the bar
// (and its left/right flex containers, so their empty flex gaps drag too)
// is handled by Tauri's webview-injected script, which only starts a drag
// when the *exact* event target carries the attribute — buttons and the
// search pill are left without it, so clicks on them behave normally.
//
// The layout toggle (Workbench ⇄ Reader) used to keep its own `reader`
// boolean and flip `data-layout` itself here; Task 7 moved that into
// layout.ts (which owns #layout-toggle/#layout-glyph/#layout-label
// directly, alongside the panel state its click now also drives), so this
// module only wires the titlebar buttons that are still purely local.
import { getCurrentWindow } from "@tauri-apps/api/window";

export interface TitlebarCallbacks {
  /** Search pill click — opens the command palette (design §1/§8). */
  onOpenCommandPalette(): void;
  /** ⚙ click — opens the Preferences overlay (design §9). */
  onOpenPreferences(): void;
}

export function initTitlebar(cb: TitlebarCallbacks): void {
  const win = getCurrentWindow();

  document.getElementById("titlebar-search")?.addEventListener("click", () => cb.onOpenCommandPalette());

  document.getElementById("settings-btn")?.addEventListener("click", () => cb.onOpenPreferences());

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
