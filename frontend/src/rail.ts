// Activity rail behavior — design/README.md §2.
//
// Files/Outline are the two live rail tabs in v1 (they toggle the empty
// `#sidebar` slot open/closed — its actual Explorer/Outline content is a
// later task's job). Search and Export are inert placeholders per the task
// brief, each carrying a "coming in v2" tooltip (set as `title` in
// index.html) and no click handler at all.

type Panel = "files" | "outline";

let activePanel: Panel = "files";
let sidebarOpen = true;

function paint(): void {
  document.getElementById("rail-files")?.classList.toggle("active", sidebarOpen && activePanel === "files");
  document.getElementById("rail-outline")?.classList.toggle("active", sidebarOpen && activePanel === "outline");
  const sidebar = document.getElementById("sidebar");
  if (sidebar) sidebar.dataset.collapsed = sidebarOpen ? "false" : "true";
}

/**
 * Collapses the sidebar from outside the rail — used by explorer.ts's
 * panel-header ⇤ button (design/README.md §3), which needs to drive the
 * same open/closed state the rail's Files icon does.
 */
export function collapseSidebar(): void {
  sidebarOpen = false;
  paint();
}

// Clicking the active rail icon toggles the sidebar closed/open; clicking
// the other one switches panel and opens it (design/README.md §2).
function pick(panel: Panel): void {
  if (sidebarOpen && activePanel === panel) {
    sidebarOpen = false;
  } else {
    activePanel = panel;
    sidebarOpen = true;
  }
  paint();
}

// Home's real behavior — an overlay-based welcome reachable while a doc is
// open, dismissed by veil-click/Esc — is Task 7's overlay system
// (design/README.md "State management" → `overlay`). Task 5 gave #main a
// real document store (explorer/tabs/viewer/welcome, all driven from
// main.ts's state); reaching in here to blindly clobber it would corrupt
// that state instead of just showing an overlay on top of it. So this is
// deliberately inert until the overlay system exists — the "no tabs open"
// welcome state (`main.ts`'s job) already covers the empty case.
function openWelcome(): void {}

export function initRail(): void {
  document.getElementById("rail-files")?.addEventListener("click", () => pick("files"));
  document.getElementById("rail-outline")?.addEventListener("click", () => pick("outline"));
  document.getElementById("rail-home")?.addEventListener("click", openWelcome);
  paint();
}
