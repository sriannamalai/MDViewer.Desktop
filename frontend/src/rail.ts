// Activity rail behavior — design/README.md §2.
//
// Files/Outline are the two live rail tabs in v1 (they toggle the empty
// `#sidebar` slot open/closed — its actual Explorer/Outline content is a
// later task's job). Search and Export are inert placeholders per the task
// brief, each carrying a "coming in v2" tooltip (set as `title` in
// index.html) and no click handler at all. Home swaps `#main` to a minimal
// welcome placeholder — the full design/README.md §11 welcome screen is
// out of this task's scope.

type Panel = "files" | "outline";

let activePanel: Panel = "files";
let sidebarOpen = true;

function paint(): void {
  document.getElementById("rail-files")?.classList.toggle("active", sidebarOpen && activePanel === "files");
  document.getElementById("rail-outline")?.classList.toggle("active", sidebarOpen && activePanel === "outline");
  const sidebar = document.getElementById("sidebar");
  if (sidebar) sidebar.dataset.collapsed = sidebarOpen ? "false" : "true";
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

function openWelcome(): void {
  const main = document.getElementById("main");
  if (!main) return;
  main.innerHTML = "";
  const wrap = document.createElement("div");
  wrap.className = "welcome-placeholder";

  const title = document.createElement("div");
  title.className = "welcome-title";
  title.textContent = "Nothing open yet";

  const body = document.createElement("div");
  body.className = "welcome-body";
  body.textContent = "Open a folder or file to start reading.";

  wrap.append(title, body);
  main.append(wrap);
}

export function initRail(): void {
  document.getElementById("rail-files")?.addEventListener("click", () => pick("files"));
  document.getElementById("rail-outline")?.addEventListener("click", () => pick("outline"));
  document.getElementById("rail-home")?.addEventListener("click", openWelcome);
  paint();
}
