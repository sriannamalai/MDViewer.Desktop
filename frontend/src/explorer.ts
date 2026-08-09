// Explorer sidebar panel — design/README.md §3 ("Sidebar" → Explorer).
//
// Renders the full sidebar content (header + file tree + Recent section)
// into `#sidebar`; `main.ts` (owner of the document-state store) calls
// `render()` on every store change. Directory expand/collapse is a local
// UI concern with no persisted-state equivalent yet, so it lives here as
// module state rather than round-tripping through the store.
//
// `read_dir_tree` returns the whole subtree up to a fixed depth in one
// call (see main.ts), so expanding a folder never needs another IPC round
// trip — it just reveals nodes already in memory.

import type { TreeNode } from "./ipc";

export interface RecentEntry {
  label: string;
  path: string;
  when: string;
}

export interface ExplorerCallbacks {
  onOpenFile(path: string): void;
  /** Header ⇤ button — collapses the sidebar (owned by layout.ts). */
  onCollapse(): void;
}

interface RenderArgs {
  container: HTMLElement;
  root: TreeNode | null;
  activePath: string | null;
  recents: RecentEntry[];
  cb: ExplorerCallbacks;
}

let last: RenderArgs | null = null;
const expandedDirs = new Set<string>();

export function render(
  container: HTMLElement,
  root: TreeNode | null,
  activePath: string | null,
  recents: RecentEntry[],
  cb: ExplorerCallbacks,
): void {
  last = { container, root, activePath, recents, cb };
  if (root) expandedDirs.add(root.path); // root always starts expanded
  paint();
}

function paint(): void {
  if (!last) return;
  const { container, root, activePath, recents, cb } = last;
  container.innerHTML = "";

  container.appendChild(buildHeader(root, cb));

  const body = document.createElement("div");
  body.className = "sidebar-body";

  if (root) {
    appendNode(body, root, 0, activePath);
  } else {
    const empty = document.createElement("div");
    empty.className = "explorer-empty";
    empty.textContent = "Open a folder to browse its files.";
    body.appendChild(empty);
  }

  body.appendChild(buildRecent(recents, cb));
  container.appendChild(body);
}

function countFiles(node: TreeNode): number {
  if (!node.is_dir) return 1;
  return node.children.reduce((sum, child) => sum + countFiles(child), 0);
}

function buildHeader(root: TreeNode | null, cb: ExplorerCallbacks): HTMLElement {
  const header = document.createElement("div");
  header.className = "sidebar-header";

  const title = document.createElement("span");
  title.className = "sidebar-title";
  title.textContent = "Explorer";

  const right = document.createElement("div");
  right.className = "sidebar-header-right";

  const meta = document.createElement("span");
  meta.className = "sidebar-meta";
  if (root) {
    const n = countFiles(root);
    meta.textContent = `${n} file${n === 1 ? "" : "s"}`;
  }

  const collapse = document.createElement("div");
  collapse.className = "sidebar-collapse-btn";
  collapse.title = "Collapse panel";
  collapse.textContent = "⇤";
  collapse.addEventListener("click", () => cb.onCollapse());

  right.append(meta, collapse);
  header.append(title, right);
  return header;
}

function appendNode(parent: HTMLElement, node: TreeNode, depth: number, activePath: string | null): void {
  if (!last) return;
  const { cb } = last;
  const row = document.createElement("div");
  const isActive = !node.is_dir && node.path === activePath;
  row.className = "tree-row " + (node.is_dir ? "dir" : "file") + (isActive ? " active" : "");
  row.style.paddingLeft = `${8 + depth * 14}px`;

  if (node.is_dir) {
    const expanded = expandedDirs.has(node.path);
    const caret = document.createElement("span");
    caret.className = "tree-caret";
    caret.textContent = expanded ? "▾" : "▸";

    const icon = document.createElement("span");
    icon.className = "tree-folder-icon";
    icon.textContent = "📁";

    const name = document.createElement("span");
    name.className = "tree-name";
    name.style.fontWeight = depth === 0 ? "500" : "400";
    name.style.color = depth === 0 ? "var(--t-text)" : "var(--t-text2)";
    name.textContent = node.name;

    row.append(caret, icon, name);
    row.addEventListener("click", () => {
      if (expandedDirs.has(node.path)) expandedDirs.delete(node.path);
      else expandedDirs.add(node.path);
      paint();
    });
  } else {
    const badge = document.createElement("span");
    badge.className = "tree-badge" + (node.is_markdown ? "" : " plain");
    badge.textContent = node.is_markdown ? "M" : "T";

    const name = document.createElement("span");
    name.className = "tree-name";
    name.textContent = node.name;

    row.append(badge, name);
    row.addEventListener("click", () => cb.onOpenFile(node.path));
  }

  parent.appendChild(row);

  if (node.is_dir && expandedDirs.has(node.path)) {
    for (const child of node.children) {
      appendNode(parent, child, depth + 1, activePath);
    }
  }
}

function buildRecent(recents: RecentEntry[], cb: ExplorerCallbacks): HTMLElement {
  const section = document.createElement("div");
  section.className = "sidebar-recent";

  const label = document.createElement("div");
  label.className = "sidebar-section-label";
  label.textContent = "Recent";
  section.appendChild(label);

  if (recents.length === 0) {
    const empty = document.createElement("div");
    empty.className = "sidebar-recent-empty";
    empty.textContent = "No recent files yet.";
    section.appendChild(empty);
    return section;
  }

  const list = document.createElement("div");
  list.className = "sidebar-recent-list";
  for (const entry of recents) {
    const row = document.createElement("div");
    row.className = "recent-row";
    row.title = entry.path;
    row.addEventListener("click", () => cb.onOpenFile(entry.path));
    const name = document.createElement("span");
    name.textContent = entry.label;
    const when = document.createElement("span");
    when.className = "recent-row-time";
    when.textContent = entry.when;
    row.append(name, when);
    list.appendChild(row);
  }
  section.appendChild(list);
  return section;
}
