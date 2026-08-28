// Activity rail wiring — design/README.md §2.
//
// Task 7 moved the actual open/close state (and the "active" paint) into
// layout.ts, which owns #rail-files directly (same DOM-ownership pattern
// this module used to use alone) — clicking it calls
// `layout.pickFilesPanel()`. #rail-outline is ruled inert for v1 (the
// controller: design §3's sidebar-hosted outline panel was never built,
// and §2's "only one icon lights up" contract has to hold with only Files
// as a real toggle) — it keeps a static "coming in v2" title in
// index.html, same as Search/Export, and layout.ts doesn't wire or paint
// it at all. The outline *column* stays reachable via the doc toolbar's
// Outline button and ⌘J.
//
// This module is left as main.ts's call site for symmetry with
// initTitlebar()/initTheme(), and wires the two rail buttons layout.ts
// doesn't own: Home, which opens the welcome-over-doc overlay (design
// §2/§11) without touching main.ts's document store, and Export, which
// main.ts supplies a callback for (it owns the active document needed to
// build the export sheet's title/content).
import * as layout from "./layout";

export interface RailCallbacks {
  onOpenExport(): void;
}

export function initRail(cb: RailCallbacks): void {
  document.getElementById("rail-home")?.addEventListener("click", () => layout.openWelcomeOverlay());
  document.getElementById("rail-export")?.addEventListener("click", () => cb.onOpenExport());
}
