// Activity rail wiring — design/README.md §2.
//
// Task 7 moved the actual open/close state (and the "which icon is
// active" paint) into layout.ts, which owns #rail-files/#rail-outline
// directly (same DOM-ownership pattern this module used to use alone) —
// clicking either now calls `layout.pickPanel()`. This module is left as
// main.ts's call site for symmetry with initTitlebar()/initTheme(), and
// wires the one rail button layout.ts doesn't own: Home, which opens the
// welcome-over-doc overlay (design §2/§11) without touching main.ts's
// document store. Search/Export stay inert v2 placeholders (their
// "coming in v2" titles are set in index.html).
import * as layout from "./layout";

export function initRail(): void {
  document.getElementById("rail-home")?.addEventListener("click", () => layout.openWelcomeOverlay());
}
