// Doc toolbar — design/README.md §5 ("Main column" → Doc toolbar).
//
// Stateless renderer like tabs.ts/explorer.ts: main.ts calls render()
// whenever the active tab, its line/byte stats, or the outline/source
// toggle state changes. The Outline/Source toggles don't own any state
// here — main.ts passes in the current flags and gets a click callback
// back, which is also the hook Task 7's persisted layout state reuses.

export interface ToolbarStats {
  lines: number;
  bytes: number;
}

export interface ToolbarCallbacks {
  onToggleOutline(): void;
  onToggleSource(): void;
}

/** `path/to/file.md` → `to / file.md` — the immediate parent folder plus filename (design §5 breadcrumb). */
function formatBreadcrumb(path: string): string {
  const parts = path.split(/[\\/]/).filter(Boolean);
  if (parts.length <= 1) return parts[0] ?? path;
  return `${parts[parts.length - 2]} / ${parts[parts.length - 1]}`;
}

function formatStats(stats: ToolbarStats): string {
  const kb = (stats.bytes / 1024).toFixed(2);
  return `${stats.lines} line${stats.lines === 1 ? "" : "s"} · ${kb} KB`;
}

function buildButton(text: string, extraClass: string, title: string | null, onClick: () => void): HTMLElement {
  const btn = document.createElement("div");
  btn.className = "doc-toolbar-btn" + (extraClass ? ` ${extraClass}` : "");
  btn.textContent = text;
  if (title) btn.title = title;
  btn.addEventListener("click", onClick);
  return btn;
}

export function render(
  container: HTMLElement,
  path: string,
  stats: ToolbarStats,
  outlineOpen: boolean,
  sourceView: boolean,
  cb: ToolbarCallbacks,
): void {
  container.innerHTML = "";

  const breadcrumb = document.createElement("span");
  breadcrumb.className = "doc-toolbar-breadcrumb";
  breadcrumb.textContent = formatBreadcrumb(path);
  breadcrumb.title = path;

  const spacer = document.createElement("div");
  spacer.className = "doc-toolbar-spacer";

  const statsEl = document.createElement("span");
  statsEl.className = "doc-toolbar-stats";
  statsEl.textContent = formatStats(stats);

  const divider = document.createElement("div");
  divider.className = "doc-toolbar-divider";

  const outlineBtn = buildButton("Outline", outlineOpen ? "toggled" : "", "Toggle outline panel", () =>
    cb.onToggleOutline(),
  );

  const sourceBtn = buildButton(sourceView ? "Rendered" : "Source", sourceView ? "source-active" : "", null, () =>
    cb.onToggleSource(),
  );

  // Inert per the task brief — no export flow yet (v2).
  const exportBtn = buildButton("Export", "", "Export — coming in v2", () => {});

  container.append(breadcrumb, spacer, statsEl, divider, outlineBtn, sourceBtn, exportBtn);
}
