// Doc toolbar — design/README.md §5 ("Main column" → Doc toolbar).
//
// Stateless renderer like tabs.ts/explorer.ts: main.ts calls render()
// whenever the active tab, its line/byte stats, or the outline/source
// toggle state changes. The Outline/Source toggles don't own any state
// here — main.ts passes in the current flags (now backed by layout.ts)
// and gets a click callback back.

export interface ToolbarStats {
  lines: number;
  bytes: number;
}

export interface ToolbarCallbacks {
  onToggleOutline(): void;
  onToggleSource(): void;
  onExport(): void;
}

/** The Explorer's tree root — `null` when no folder is open. */
export interface BreadcrumbRoot {
  name: string;
  path: string;
}

/**
 * `Root / dir / file.md` when `path` is inside the open folder `root`
 * (design §5: "breadcrumb `Repo / path / file.md`"); falls back to the
 * two-segment `parent-folder / file.md` form (Task 6's original, simpler
 * breadcrumb) when no folder is open or `path` isn't under it.
 */
function formatBreadcrumb(path: string, root: BreadcrumbRoot | null): string {
  const norm = (p: string) => p.replace(/\\/g, "/");
  const normPath = norm(path);

  if (root) {
    const normRoot = norm(root.path).replace(/\/$/, "");
    if (normPath === normRoot || normPath.startsWith(`${normRoot}/`)) {
      const rel = normPath.slice(normRoot.length).replace(/^\//, "");
      const segments = rel.split("/").filter(Boolean);
      return [root.name, ...segments].join(" / ");
    }
  }

  const parts = normPath.split("/").filter(Boolean);
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
  root: BreadcrumbRoot | null,
  stats: ToolbarStats,
  outlineOpen: boolean,
  sourceView: boolean,
  cb: ToolbarCallbacks,
): void {
  container.innerHTML = "";

  const breadcrumb = document.createElement("span");
  breadcrumb.className = "doc-toolbar-breadcrumb";
  breadcrumb.textContent = formatBreadcrumb(path, root);
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

  const exportBtn = buildButton("Export", "", null, () => cb.onExport());

  container.append(breadcrumb, spacer, statsEl, divider, outlineBtn, sourceBtn, exportBtn);
}
