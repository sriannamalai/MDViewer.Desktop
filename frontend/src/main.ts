import { open } from "@tauri-apps/plugin-dialog";
import { initTitlebar } from "./titlebar";
import { initRail, collapseSidebar } from "./rail";
import { initTheme, getTheme } from "./theme";
import * as ipc from "./ipc";
import type { ThemeName, TreeNode } from "./ipc";
import * as viewer from "./viewer";
import * as tabsUi from "./tabs";
import * as explorerUi from "./explorer";
import * as welcomeUi from "./welcome";

// Document pipeline — design/README.md §3 (Explorer), §5 (tab strip), §11
// (welcome). This module owns the one document-state store for the app
// (`store` below) and is the single place that mutates it; explorer.ts,
// tabs.ts, welcome.ts and viewer.ts are all stateless renderers driven by
// callbacks into `openFile`/`openFolder`/`selectTab`/`closeTab` here.

interface OpenTab {
  path: string;
  name: string;
  isMarkdown: boolean;
  content: string;
  /** Rendered HTML cached per theme so switching tabs/themes can reuse it. */
  html: Partial<Record<ThemeName, string>>;
}

interface Store {
  openTabs: OpenTab[];
  activeTab: string | null;
  treeRoot: TreeNode | null;
}

const store: Store = { openTabs: [], activeTab: null, treeRoot: null };

const FILE_FILTERS = [{ name: "Markdown", extensions: ["md", "markdown", "txt"] }];

const sidebarEl = document.getElementById("sidebar");
const mainEl = document.getElementById("main");
if (!sidebarEl || !mainEl) {
  throw new Error("main.ts: #sidebar/#main not found — index.html shell changed?");
}

// #main's internal structure: a tab strip, a viewer content host, and a
// welcome host — main.ts toggles which pair is visible based on whether
// any tabs are open. Built once here; explorer.ts owns #sidebar's content
// the same way.
mainEl.classList.add("main-shell");
const tabstripEl = document.createElement("div");
tabstripEl.className = "doc-tabstrip";
const contentEl = document.createElement("div");
contentEl.className = "doc-content";
const welcomeHostEl = document.createElement("div");
welcomeHostEl.className = "welcome-host";
mainEl.append(tabstripEl, contentEl, welcomeHostEl);

viewer.mount(contentEl);

function fileName(path: string): string {
  const parts = path.split(/[\\/]/);
  return parts[parts.length - 1] || path;
}

function isMarkdownPath(path: string): boolean {
  const lower = path.toLowerCase();
  return lower.endsWith(".md") || lower.endsWith(".markdown");
}

/** Renders (or reuses the cached render of) `tab` under the current theme into the viewer. */
async function showTab(tab: OpenTab): Promise<void> {
  const theme = getTheme();
  try {
    let html = tab.html[theme];
    if (!html) {
      html = await ipc.renderDocument(tab.content, theme);
      tab.html[theme] = html;
    }
    viewer.load(html);
  } catch (err) {
    viewer.showError(err instanceof Error ? err.message : String(err));
  }
}

/** Repaints the tab strip, explorer and welcome/viewer visibility from `store`. Never re-renders the doc itself. */
function paintChrome(): void {
  const hasTabs = store.openTabs.length > 0;
  tabstripEl.classList.toggle("hidden", !hasTabs);
  contentEl.classList.toggle("hidden", !hasTabs);
  welcomeHostEl.classList.toggle("hidden", hasTabs);

  tabsUi.render(
    tabstripEl,
    store.openTabs.map((t) => ({ path: t.path, name: t.name, isMarkdown: t.isMarkdown })),
    store.activeTab,
    {
      onSelect: (path) => {
        void selectTab(path);
      },
      onClose: (path) => {
        void closeTab(path);
      },
      onNewFile: () => {
        void pickAndOpenFile();
      },
    },
  );

  if (!hasTabs) {
    // Recent columns are static until Task 7 wires persisted UI state.
    welcomeUi.mount(welcomeHostEl, [], {
      onOpenFolder: (path) => {
        void openFolder(path);
      },
      onOpenFile: (path) => {
        void openFile(path);
      },
    });
  }

  explorerUi.render(sidebarEl!, store.treeRoot, store.activeTab, [], {
    onOpenFile: (path) => {
      void openFile(path);
    },
    onCollapse: collapseSidebar,
  });
}

async function selectTab(path: string): Promise<void> {
  const tab = store.openTabs.find((t) => t.path === path);
  if (!tab) return;
  store.activeTab = path;
  paintChrome();
  await showTab(tab);
}

async function closeTab(path: string): Promise<void> {
  const idx = store.openTabs.findIndex((t) => t.path === path);
  if (idx === -1) return;
  const wasActive = store.activeTab === path;
  store.openTabs.splice(idx, 1);
  if (wasActive) {
    const next = store.openTabs[idx] ?? store.openTabs[idx - 1];
    store.activeTab = next ? next.path : null;
  }
  paintChrome();
  // Only re-render when the closed tab was the active one — closing a
  // background tab must never touch the viewer's live iframe (that would
  // reset scroll position and re-run mermaid/KaTeX on the doc the user is
  // actually reading).
  if (wasActive) {
    const activeTab = store.openTabs.find((t) => t.path === store.activeTab);
    if (activeTab) await showTab(activeTab);
  }
}

/** Opens `path` as a tab (reusing it if already open) and makes it active. Exported for Task 6/7 reuse. */
export async function openFile(path: string): Promise<void> {
  let tab = store.openTabs.find((t) => t.path === path);
  if (!tab) {
    try {
      const file = await ipc.readDocument(path);
      tab = { path, name: fileName(path), isMarkdown: isMarkdownPath(path), content: file.content, html: {} };
      store.openTabs.push(tab);
    } catch (err) {
      console.error(`openFile(${path}) failed:`, err);
      return;
    }
  }
  store.activeTab = path;
  paintChrome();
  await showTab(tab);
}

/** Reads the directory tree at `path` into the Explorer. Exported for Task 6/7 reuse. */
export async function openFolder(path: string): Promise<void> {
  try {
    // Depth generous enough for a typical project tree; read_dir_tree
    // returns the whole subtree in one call, so expand/collapse in
    // explorer.ts never needs another round trip.
    store.treeRoot = await ipc.readDirTree(path, 8);
  } catch (err) {
    console.error(`openFolder(${path}) failed:`, err);
    return;
  }
  paintChrome();
}

async function pickAndOpenFile(): Promise<void> {
  const picked = await open({ multiple: false, filters: FILE_FILTERS });
  if (typeof picked === "string") await openFile(picked);
}

async function onThemeChanged(): Promise<void> {
  const tab = store.openTabs.find((t) => t.path === store.activeTab);
  if (tab) await showTab(tab); // background tabs stay cached under the old theme and re-render lazily on next activation
}

initTheme("light");
initTitlebar();
initRail();

// Registered after initTheme()'s own #theme-toggle listener (which flips
// the theme state), so getTheme() here already reflects the new theme.
document.getElementById("theme-toggle")?.addEventListener("click", () => {
  void onThemeChanged();
});

paintChrome();
