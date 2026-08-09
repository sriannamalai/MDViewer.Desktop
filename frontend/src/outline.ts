// Outline column — design/README.md §6 ("On this page").
//
// Stateless-ish renderer like explorer.ts/tabs.ts: main.ts calls render()
// whenever the active tab (or its parsed outline/stats) changes. Scrollspy
// events arrive far more often than that, though — once per animation
// frame while the user scrolls — so `setActiveLine()` is a separate, cheap
// entry point that only flips which row carries the active styling
// instead of rebuilding the whole tree on every frame.

import type { OutlineItem } from "./ipc";

export interface OutlineFooterStats {
  words: number;
  readMinutes: number;
  /** DocFile.modified_ms, or null while unknown. */
  modifiedMs: number | null;
}

export interface OutlineCallbacks {
  /** Row click — main.ts wires this to viewer.scrollToLine(). */
  onSelect(line: number): void;
  /** Header ⇥ button — hides the outline column (main.ts owns that state). */
  onCollapse(): void;
}

interface State {
  items: OutlineItem[];
  stats: OutlineFooterStats | null;
  cb: OutlineCallbacks;
}

let container: HTMLElement | null = null;
let state: State | null = null;
let activeLine = 0;
const rowsByLine = new Map<number, HTMLElement>();

/**
 * Maps an incoming scrollspy `line` to the outline item with the greatest
 * `line` that is still `<= line` (design §6) — i.e. the last heading the
 * reader has scrolled past. `items` is assumed to already be in document
 * (ascending line) order, which is how parse_document produces it.
 */
function activeItemFor(items: OutlineItem[], line: number): OutlineItem | null {
  let best: OutlineItem | null = null;
  for (const item of items) {
    if (item.line <= line) best = item;
  }
  return best ?? items[0] ?? null;
}

function formatModified(ms: number): string {
  // Matches the prototype's footer ("Aug 6") — short month + day, no year.
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(new Date(ms));
}

function buildFooterRow(label: string, value: string): HTMLElement {
  const row = document.createElement("div");
  row.className = "outline-footer-row";

  const labelEl = document.createElement("span");
  labelEl.className = "outline-footer-label";
  labelEl.textContent = label;

  const valueEl = document.createElement("span");
  valueEl.className = "outline-footer-value";
  valueEl.textContent = value;

  row.append(labelEl, valueEl);
  return row;
}

function buildFooter(stats: OutlineFooterStats): HTMLElement {
  const footer = document.createElement("div");
  footer.className = "outline-footer";
  footer.appendChild(buildFooterRow("Words", stats.words.toLocaleString()));
  footer.appendChild(buildFooterRow("Read time", `${stats.readMinutes} min`));
  footer.appendChild(buildFooterRow("Modified", stats.modifiedMs !== null ? formatModified(stats.modifiedMs) : "—"));
  return footer;
}

function paint(): void {
  if (!container || !state) return;
  const { items, stats, cb } = state;
  container.innerHTML = "";
  rowsByLine.clear();

  const inner = document.createElement("div");
  inner.className = "outline-inner";

  const header = document.createElement("div");
  header.className = "outline-header";

  const label = document.createElement("span");
  label.className = "outline-label";
  label.textContent = "On this page";

  const collapse = document.createElement("div");
  collapse.className = "sidebar-collapse-btn";
  collapse.title = "Collapse outline";
  collapse.textContent = "⇥";
  collapse.addEventListener("click", () => cb.onCollapse());

  header.append(label, collapse);
  inner.appendChild(header);

  if (items.length === 0) {
    const empty = document.createElement("div");
    empty.className = "outline-empty";
    empty.textContent = "No headings in this document.";
    inner.appendChild(empty);
  } else {
    const tree = document.createElement("div");
    tree.className = "outline-tree";
    for (const item of items) {
      const row = document.createElement("div");
      row.className = "outline-item" + (item.level === 1 ? " h1" : "") + (item.level >= 3 ? " deep" : "");
      row.style.paddingLeft = `${10 + (item.level - 1) * 13}px`;
      row.textContent = item.text;
      row.addEventListener("click", () => cb.onSelect(item.line));
      tree.appendChild(row);
      rowsByLine.set(item.line, row);
    }
    inner.appendChild(tree);
  }

  if (stats) inner.appendChild(buildFooter(stats));

  container.appendChild(inner);
  applyActive();
}

function applyActive(): void {
  if (!state) return;
  const active = activeItemFor(state.items, activeLine);
  for (const [line, row] of rowsByLine) {
    row.classList.toggle("active", active !== null && line === active.line);
  }
}

/** Renders the full outline panel (header + tree + footer stats) for the active document. */
export function render(
  target: HTMLElement,
  items: OutlineItem[],
  stats: OutlineFooterStats | null,
  cb: OutlineCallbacks,
): void {
  container = target;
  state = { items, stats, cb };
  activeLine = 0;
  paint();
}

/** Updates the active section from a scrollspy `line` without rebuilding the tree. */
export function setActiveLine(line: number): void {
  activeLine = line;
  applyActive();
}

/** The outline item currently considered active — statusbar.ts's "current section" reuses this mapping. */
export function activeItem(): OutlineItem | null {
  if (!state) return null;
  return activeItemFor(state.items, activeLine);
}
