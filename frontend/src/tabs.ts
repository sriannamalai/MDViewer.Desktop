// Tab strip — design/README.md §5 ("Main column" → Tab strip).
//
// Stateless renderer: `main.ts` owns `openTabs`/`activeTab` in its
// document-state store and calls `render()` whenever they change. This
// module just paints the given tab list into `container` and wires clicks
// back through the callbacks — no state of its own.

export interface TabInfo {
  path: string;
  name: string;
  isMarkdown: boolean;
}

export interface TabsCallbacks {
  onSelect(path: string): void;
  onClose(path: string): void;
  onNewFile(): void;
}

export function render(container: HTMLElement, tabs: TabInfo[], activePath: string | null, cb: TabsCallbacks): void {
  container.innerHTML = "";

  for (const tab of tabs) {
    const row = document.createElement("div");
    row.className = "doc-tab" + (tab.path === activePath ? " active" : "");
    row.title = tab.path;
    row.addEventListener("click", () => cb.onSelect(tab.path));

    const badge = document.createElement("span");
    badge.className = "doc-tab-badge" + (tab.isMarkdown ? "" : " plain");
    badge.textContent = tab.isMarkdown ? "M" : "T";

    const label = document.createElement("span");
    label.className = "doc-tab-label";
    label.textContent = tab.name;

    const close = document.createElement("span");
    close.className = "doc-tab-close";
    close.textContent = "✕";
    close.title = "Close";
    close.addEventListener("click", (ev) => {
      ev.stopPropagation();
      cb.onClose(tab.path);
    });

    row.append(badge, label, close);
    container.appendChild(row);
  }

  const newTab = document.createElement("div");
  newTab.className = "doc-tab-new";
  newTab.title = "Open file…";
  newTab.textContent = "+";
  newTab.addEventListener("click", () => cb.onNewFile());
  container.appendChild(newTab);

  const spacer = document.createElement("div");
  spacer.className = "doc-tab-spacer";
  container.appendChild(spacer);
}
