import { open } from "@tauri-apps/plugin-dialog";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { initTitlebar } from "./titlebar";
import { initRail } from "./rail";
import { initTheme, getTheme, setTheme, resolveThemeMode, watchAutoTheme, unwatchAutoTheme } from "./theme";
import * as layout from "./layout";
import * as appstate from "./appstate";
import * as ipc from "./ipc";
import type { DocModel, ThemeName, TreeNode } from "./ipc";
import * as viewer from "./viewer";
import * as tabsUi from "./tabs";
import * as explorerUi from "./explorer";
import * as welcomeUi from "./welcome";
import * as outlineUi from "./outline";
import * as toolbarUi from "./toolbar";
import * as statusbarUi from "./statusbar";
import * as searchUi from "./search";
import * as commandPaletteUi from "./commandpalette";
import type { PaletteCommand } from "./commandpalette";
import * as preferencesUi from "./preferences";
import * as exportSheetUi from "./exportsheet";

// Document pipeline — design/README.md §3 (Explorer), §5 (tab strip, doc
// toolbar, status bar), §6 (outline column), §11 (welcome). This module
// owns the one document-state store for the app (`store` below) and is the
// single place that mutates it; explorer.ts, tabs.ts, welcome.ts,
// outline.ts, toolbar.ts, statusbar.ts and viewer.ts are all stateless
// renderers driven by callbacks into `openFile`/`openFolder`/`selectTab`/
// `closeTab`/`toggleSourceView` here. Panel open/width/reader-mode state
// (Task 7) lives in layout.ts instead — this module just re-renders the
// doc-toolbar/outline when layout.ts reports a change relevant to them,
// and forwards layout.ts's state into appstate.ts for persistence.

interface OpenTab {
  path: string;
  name: string;
  isMarkdown: boolean;
  content: string;
  /** Rendered HTML cached per theme so switching tabs/themes can reuse it. */
  html: Partial<Record<ThemeName, string>>;
  lines: number;
  bytes: number;
  modifiedMs: number;
  /** Toolbar's Source/Rendered toggle — per tab, per the task brief. */
  sourceView: boolean;
  /** parse_document's outline/words/read_minutes — cached once per tab; independent of theme. */
  doc?: DocModel;
}

interface Store {
  openTabs: OpenTab[];
  activeTab: string | null;
  treeRoot: TreeNode | null;
}

const store: Store = { openTabs: [], activeTab: null, treeRoot: null };

const FILE_FILTERS = [{ name: "Markdown", extensions: ["md", "markdown", "txt"] }];

const sidebarEl = document.getElementById("sidebar");
const sidebarInnerEl = document.getElementById("sidebar-inner");
const mainEl = document.getElementById("main");
const outlineEl = document.getElementById("outline");
const outlineInnerEl = document.getElementById("outline-inner-wrap");
const statusbarEl = document.getElementById("statusbar");
if (!sidebarEl || !sidebarInnerEl || !mainEl || !outlineEl || !outlineInnerEl || !statusbarEl) {
  throw new Error(
    "main.ts: #sidebar/#sidebar-inner/#main/#outline/#outline-inner-wrap/#statusbar not found — index.html shell changed?",
  );
}

// #main's internal structure: a tab strip, a doc toolbar, a viewer content
// host, and a welcome host — main.ts toggles which of {toolbar+content,
// welcome} is visible based on whether any tabs are open. Built once here;
// explorer.ts owns #sidebar's content the same way, and outline.ts owns
// #outline's.
mainEl.classList.add("main-shell");
const tabstripEl = document.createElement("div");
tabstripEl.className = "doc-tabstrip";
const toolbarEl = document.createElement("div");
toolbarEl.className = "doc-toolbar";
const contentEl = document.createElement("div");
contentEl.className = "doc-content";
const welcomeHostEl = document.createElement("div");
welcomeHostEl.className = "welcome-host";
// Sits above whichever of {tabstrip+toolbar+content, welcome} is visible —
// open failures (Finding 1: a Recent/Explorer entry whose file was deleted,
// a folder that vanished) must surface *something* on screen regardless of
// whether any tab is open, not just a console.error nobody but a developer
// will ever see.
const openErrorEl = document.createElement("div");
openErrorEl.className = "open-error hidden";
mainEl.append(openErrorEl, tabstripEl, toolbarEl, contentEl, welcomeHostEl);

viewer.mount(contentEl);

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** Shows a dismissible inline banner at the top of #main — the "silent console.error" fix for Finding 1. */
function showOpenError(message: string): void {
  openErrorEl.innerHTML = "";
  const text = document.createElement("span");
  text.className = "open-error-text";
  text.textContent = message;
  const dismiss = document.createElement("span");
  dismiss.className = "open-error-dismiss";
  dismiss.textContent = "×";
  dismiss.title = "Dismiss";
  dismiss.addEventListener("click", () => hideOpenError());
  openErrorEl.append(text, dismiss);
  openErrorEl.classList.remove("hidden");
}

function hideOpenError(): void {
  openErrorEl.classList.add("hidden");
}

/** Fetched once at startup — same version for every doc, so no need to re-fetch per tab. */
let libVersion = "";
void ipc.libraryVersion().then((v) => {
  libVersion = v;
  renderStatusbar();
});

function fileName(path: string): string {
  const parts = path.split(/[\\/]/);
  return parts[parts.length - 1] || path;
}

function isMarkdownPath(path: string): boolean {
  const lower = path.toLowerCase();
  return lower.endsWith(".md") || lower.endsWith(".markdown");
}

/** Renders (or reuses the cached render of) `tab` under the current theme into the viewer, and repaints the doc panels. */
async function showTab(tab: OpenTab): Promise<void> {
  const theme = getTheme();
  try {
    let html = tab.html[theme];
    if (!html) {
      html = await ipc.renderDocument(tab.content, theme, currentRenderPrefs());
      tab.html[theme] = html;
    }
    if (!tab.doc) {
      tab.doc = await ipc.parseDocument(tab.content);
    }
    viewer.load(html);
    viewer.setSource(tab.content);
    viewer.setMode(tab.sourceView ? "source" : "rendered");
    updateDocPanels(tab);
  } catch (err) {
    viewer.showError(errMessage(err));
    // Rider finding 4: a render failure must not leave the *previous*
    // tab's outline/toolbar/statusbar painted next to the new error
    // surface — blank them so the chrome doesn't lie about which
    // document they describe.
    clearDocPanels();
  }
}

/** Repaints outline, toolbar and status bar from `tab`'s cached DocModel/stats — called on every tab switch/open. */
function updateDocPanels(tab: OpenTab): void {
  renderOutline(tab);
  renderToolbar(tab);
  renderStatusbar();
}

/** Blanks outline/toolbar/status-bar panels — used when showTab() fails so stale side panels don't stay painted next to the error surface (Finding 4). */
function clearDocPanels(): void {
  outlineUi.render(outlineInnerEl!, [], null, {
    onSelect: () => {},
    onCollapse: () => layout.setOutlineOpen(false),
  });
  toolbarEl.innerHTML = "";
  renderStatusbar();
}

function renderOutline(tab: OpenTab): void {
  const doc = tab.doc;
  outlineUi.render(
    outlineInnerEl!,
    doc?.outline ?? [],
    doc ? { words: doc.words, readMinutes: doc.read_minutes, modifiedMs: tab.modifiedMs } : null,
    {
      onSelect: (line) => {
        viewer.scrollToLine(line);
        outlineUi.setActiveLine(line);
        renderStatusbar();
      },
      onCollapse: () => layout.setOutlineOpen(false),
    },
  );
}

function renderToolbar(tab: OpenTab): void {
  const root: toolbarUi.BreadcrumbRoot | null = store.treeRoot ? { name: store.treeRoot.name, path: store.treeRoot.path } : null;
  toolbarUi.render(toolbarEl, tab.path, root, { lines: tab.lines, bytes: tab.bytes }, layout.isOutlineOpen(), tab.sourceView, {
    onToggleOutline: () => layout.toggleOutline(),
    onToggleSource: () => toggleSourceView(tab),
    onExport: () => openExportOverlay(),
  });
}

function renderStatusbar(): void {
  statusbarUi.render(statusbarEl!, { libraryVersion: libVersion, activeSection: outlineUi.activeItem()?.text ?? "" });
}

/** Toolbar's Source/Rendered toggle — per-tab flag; swaps the viewer's live view without re-rendering. */
function toggleSourceView(tab: OpenTab): void {
  tab.sourceView = !tab.sourceView;
  viewer.setMode(tab.sourceView ? "source" : "rendered");
  renderToolbar(tab);
}

// Scrollspy events fire once per animation frame while the iframe scrolls
// (see viewer.ts) — cheap enough to drive both the outline's active row
// and the status bar's section name straight from here.
window.addEventListener("mdviewer:scrollspy", (ev) => {
  const { line } = (ev as CustomEvent<{ line: number; scrollY: number; docH: number }>).detail;
  outlineUi.setActiveLine(line);
  renderStatusbar();
});

/** Repaints the tab strip, explorer and welcome/viewer visibility from `store`. Never re-renders the doc itself. */
function paintChrome(): void {
  const hasTabs = store.openTabs.length > 0;
  tabstripEl.classList.toggle("hidden", !hasTabs);
  toolbarEl.classList.toggle("hidden", !hasTabs);
  contentEl.classList.toggle("hidden", !hasTabs);
  welcomeHostEl.classList.toggle("hidden", hasTabs);
  outlineEl!.classList.toggle("hidden", !hasTabs);

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
    welcomeUi.mount(welcomeHostEl, welcomeRecents(), {
      onOpenFolder: (path) => {
        void openFolder(path);
      },
      onOpenFile: (path) => {
        void openFile(path);
      },
    });
  }

  if (layout.getState().activePanel === "search") {
    searchUi.render(sidebarInnerEl!, store.treeRoot?.path ?? null, {
      onOpenMatch: (path, line) => {
        void openSearchMatch(path, line);
      },
    });
  } else {
    explorerUi.render(sidebarInnerEl!, store.treeRoot, store.activeTab, explorerRecents(), {
      onOpenFile: (path) => {
        void openFile(path);
      },
      onCollapse: () => layout.setSidebarOpen(false),
    });
  }
}

/** Search result row click (design §3) — opens the file (reusing an already-open tab) then scrolls the *rendered* view to the match's line. A short delay is needed when the tab was just opened: the iframe's srcdoc assignment in viewer.ts is synchronous but the scrollspy script inside it needs a paint to attach its message listener, so scrollToLine() posted immediately after showTab() resolves can arrive before anyone is listening. */
async function openSearchMatch(path: string, line: number): Promise<void> {
  const wasAlreadyOpen = store.openTabs.some((t) => t.path === path) && store.activeTab === path;
  await openFile(path);
  const delay = wasAlreadyOpen ? 0 : 120;
  window.setTimeout(() => viewer.scrollToLine(line), delay);
}

/** `path/to/file.md` → `to/file.md` — last two path segments, matching design/reference's own "Recent" row style (e.g. "notes/2026-08-04.md"). */
function shortenPath(path: string): string {
  const parts = path.replace(/\\/g, "/").split("/").filter(Boolean);
  return parts.length <= 2 ? parts.join("/") : parts.slice(-2).join("/");
}

/** "2h"/"1d"/"3d"-style relative time, matching design/reference's Explorer Recent rows. */
function formatRelativeTime(ms: number): string {
  const diffSec = Math.max(0, Math.floor((Date.now() - ms) / 1000));
  if (diffSec < 60) return "now";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h`;
  return `${Math.floor(diffHr / 24)}d`;
}

/** appstate's persisted recents, formatted for the Explorer's "Recent" section (design §3: "path + relative-time"). */
function explorerRecents(): explorerUi.RecentEntry[] {
  return appstate.getState().recents.map((r) => ({
    label: shortenPath(r.path),
    path: r.path,
    when: formatRelativeTime(r.openedAt),
  }));
}

/** Same recents, formatted for the Welcome screen's "Recent" section (design §11: "name + mono path rows"). */
function welcomeRecents(): welcomeUi.RecentEntry[] {
  return appstate.getState().recents.map((r) => ({
    label: fileName(r.path),
    path: r.path,
    when: formatRelativeTime(r.openedAt),
  }));
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
      tab = {
        path,
        name: fileName(path),
        isMarkdown: isMarkdownPath(path),
        content: file.content,
        html: {},
        lines: file.lines,
        bytes: file.bytes,
        modifiedMs: file.modified_ms,
        sourceView: false,
      };
      store.openTabs.push(tab);
    } catch (err) {
      // Finding 1: was console.error-only — clicking a Recent/Explorer
      // entry whose file has since been moved/deleted did nothing visible.
      // Surface it inline in #main; the banner works whether or not any
      // tab is currently open (welcome screen or doc view underneath it).
      console.error(`openFile(${path}) failed:`, err);
      showOpenError(`Couldn't open "${fileName(path)}" — ${errMessage(err)}`);
      return;
    }
  }
  hideOpenError();
  store.activeTab = path;
  appstate.addRecent(path); // every successful open bumps recency, even for an already-open tab reselected via Explorer/Welcome
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
    // Finding 1, folder side — same silent-console-only gap as openFile().
    console.error(`openFolder(${path}) failed:`, err);
    showOpenError(`Couldn't open folder "${fileName(path)}" — ${errMessage(err)}`);
    return;
  }
  hideOpenError();
  paintChrome();
}

async function pickAndOpenFile(): Promise<void> {
  const picked = await open({ multiple: false, filters: FILE_FILTERS });
  if (typeof picked === "string") await openFile(picked);
}

/** Native folder-picker dialog → openFolder(). Mirrors welcome.ts's own "Open folder…" button; reused by the ⌘⇧O/Ctrl⇧O shortcut (Finding 2). */
async function pickAndOpenFolder(): Promise<void> {
  const picked = await open({ directory: true, multiple: false });
  if (typeof picked === "string") await openFolder(picked);
}

const DROPPABLE_EXT = /\.(md|markdown|txt)$/i;

/**
 * Filters a drag-drop event's paths down to files this app can open and
 * opens each via openFile() — split out from the onDragDropEvent listener
 * below so it's independently testable: a real OS drag can't be
 * synthesized in a headless/Playwright run, but this pure path-filtering
 * step can be exercised directly (Finding 2, drag-drop route).
 */
export function handleDroppedPaths(paths: string[]): void {
  for (const path of paths) {
    if (DROPPABLE_EXT.test(path)) void openFile(path);
  }
}

/**
 * Wires Tauri's window-level drag-drop event to openFile() (Finding 2).
 * `core:default` already grants `core:event:allow-listen` (confirmed via
 * `src-tauri/gen/schemas/acl-manifests.json`: core's default_permission
 * pulls in `core:event:default`, whose default permission is exactly
 * allow-listen/unlisten/emit/emit-to) and `dragDropEnabled` is Tauri's
 * webview default, so no capability grant was needed for this. Wrapped in
 * a .catch() because this same code also runs against a plain Vite dev
 * server (Playwright verification, no `window.__TAURI_INTERNALS__`) where
 * the event plumbing isn't present — that must degrade quietly rather than
 * break app boot.
 */
function wireDragDrop(): void {
  void getCurrentWebview()
    .onDragDropEvent((event) => {
      if (event.payload.type === "drop") handleDroppedPaths(event.payload.paths);
    })
    .catch((err) => {
      console.error("drag-drop wiring unavailable:", err);
    });
}

async function onThemeChanged(): Promise<void> {
  const tab = store.openTabs.find((t) => t.path === store.activeTab);
  if (tab) await showTab(tab); // background tabs stay cached under the old theme and re-render lazily on next activation
}

/**
 * Forwards layout.ts's panel/reader state into appstate.ts on every
 * change, and re-paints the doc toolbar (its Outline-toggled state and,
 * via `data-layout`'s CSS, prose padding both depend on it) whenever
 * `outlineOpen`/`layout` actually change — not on every drag-resize
 * mousemove, which only touches widths the toolbar doesn't render.
 */
let lastToolbarRelevant: { outlineOpen: boolean; layout: layout.LayoutMode } | null = null;
function onLayoutChange(s: layout.LayoutState): void {
  appstate.update({
    layout: s.layout,
    sidebarOpen: s.sidebarOpen,
    outlineOpen: s.outlineOpen,
    sidebarWidth: s.sidebarWidth,
    outlineWidth: s.outlineWidth,
    activePanel: s.activePanel,
  });
  if (!lastToolbarRelevant || lastToolbarRelevant.outlineOpen !== s.outlineOpen || lastToolbarRelevant.layout !== s.layout) {
    lastToolbarRelevant = { outlineOpen: s.outlineOpen, layout: s.layout };
    const tab = store.openTabs.find((t) => t.path === store.activeTab);
    if (tab) renderToolbar(tab);
  }
}

/** Builds the ffi::RenderPrefs the Rust side expects from the current persisted Preferences. */
function currentRenderPrefs(): ipc.RenderPrefs {
  const p = appstate.getState().prefs;
  return {
    mermaid: p.renderMathDiagrams,
    math: p.renderMathDiagrams,
    allow_raw_html: p.allowRawHtml,
    prose_typeface: p.proseTypeface,
  };
}

/** Drops every open tab's cached-per-theme HTML — called whenever a rendering-relevant preference changes, so the next showTab() re-renders under the new prefs instead of serving a stale cache hit keyed only by theme. */
function invalidateRenderCaches(): void {
  for (const tab of store.openTabs) tab.html = {};
}

/** Re-renders the active tab (if any) — the common tail of every rendering-relevant preference change. */
async function rerenderActiveTab(): Promise<void> {
  const tab = store.openTabs.find((t) => t.path === store.activeTab);
  if (tab) await showTab(tab);
}

function overlayContentHost(): HTMLElement | null {
  return document.getElementById("overlay-content");
}

function preferencesCallbacks(): preferencesUi.PreferencesCallbacks {
  return {
    onThemeMode: (mode) => {
      appstate.updatePrefs({ themeMode: mode });
      const resolved = resolveThemeMode(mode);
      setTheme(resolved);
      appstate.update({ theme: resolved });
      if (mode === "auto") {
        watchAutoTheme((t) => {
          setTheme(t);
          appstate.update({ theme: t });
          void onThemeChanged();
        });
      } else {
        unwatchAutoTheme();
      }
      void onThemeChanged();
      refreshPreferences();
    },
    onReadingWidth: (width) => {
      appstate.updatePrefs({ readingWidth: width });
      document.documentElement.dataset.readingWidth = width;
      refreshPreferences();
    },
    onProseTypeface: (typeface) => {
      appstate.updatePrefs({ proseTypeface: typeface });
      invalidateRenderCaches();
      void rerenderActiveTab();
      refreshPreferences();
    },
    onRenderMathDiagrams: (on) => {
      appstate.updatePrefs({ renderMathDiagrams: on });
      invalidateRenderCaches();
      void rerenderActiveTab();
      refreshPreferences();
    },
    onAllowRawHtml: (on) => {
      appstate.updatePrefs({ allowRawHtml: on });
      invalidateRenderCaches();
      void rerenderActiveTab();
      refreshPreferences();
    },
    onClose: () => layout.closeOverlay(),
  };
}

function refreshPreferences(): void {
  const host = overlayContentHost();
  if (host && layout.isOverlayOpen()) preferencesUi.refresh(host, appstate.getState().prefs, preferencesCallbacks());
}

function openPreferencesOverlay(): void {
  layout.openOverlay((host) => preferencesUi.mount(host, appstate.getState().prefs, preferencesCallbacks()));
}

/** Rail Export / doc-toolbar Export button (design §10) — no-ops with an inline error when there's nothing open to export, rather than opening an empty sheet. */
function openExportOverlay(): void {
  const tab = store.openTabs.find((t) => t.path === store.activeTab);
  if (!tab) {
    showOpenError("Open a document before exporting.");
    return;
  }
  layout.openOverlay((host) =>
    exportSheetUi.mount(host, tab.name, getTheme(), {
      onClose: () => layout.closeOverlay(),
      renderExport: (fragment) => ipc.exportDocument(tab.content, getTheme(), fragment, currentRenderPrefs()),
      onError: (message) => showOpenError(`Export failed — ${message}`),
    }),
  );
}

/** Command palette's command list (design §8) — thin wrappers around actions this module and layout.ts already expose elsewhere (titlebar/rail/toolbar buttons, keyboard shortcuts). Built fresh on every open so it always reflects the current active tab/state. */
function buildPaletteCommands(): PaletteCommand[] {
  const activeTab = () => store.openTabs.find((t) => t.path === store.activeTab);
  return [
    {
      id: "toggle-theme",
      icon: "◐",
      label: "Toggle theme",
      shortcut: "⌘⇧L",
      run: () => document.getElementById("theme-toggle")?.click(),
    },
    {
      id: "toggle-sidebar",
      icon: "▤",
      label: "Toggle sidebar",
      shortcut: "⌘B",
      run: () => layout.setSidebarOpen(!layout.isSidebarOpen()),
    },
    { id: "toggle-outline", icon: "☰", label: "Toggle outline", shortcut: "⌘J", run: () => layout.toggleOutline() },
    { id: "toggle-layout", icon: "▥", label: "Toggle layout (Workbench/Reader)", run: () => layout.toggleReaderMode() },
    {
      id: "toggle-source",
      icon: "{ }",
      label: "View Markdown source",
      run: () => {
        const tab = activeTab();
        if (tab) toggleSourceView(tab);
      },
    },
    { id: "open-file", icon: "＋", label: "Open file…", run: () => void pickAndOpenFile() },
    { id: "open-folder", icon: "⌂", label: "Open folder…", shortcut: "⌘⇧O", run: () => void pickAndOpenFolder() },
    { id: "search", icon: "⌕", label: "Search across vault", run: () => layout.pickPanel("search") },
    { id: "preferences", icon: "⚙", label: "Open preferences", run: () => openPreferencesOverlay() },
    { id: "export", icon: "⇪", label: "Export…", run: () => openExportOverlay() },
  ];
}

function openCommandPalette(): void {
  layout.openOverlay((host) =>
    commandPaletteUi.mount(host, buildPaletteCommands(), { onClose: () => layout.closeOverlay() }),
  );
}

/** Boots the app: restores persisted UI state *before* the first paint (no flash of default widths/theme), then wires the rest of the chrome. */
async function boot(): Promise<void> {
  const persisted = await appstate.load();

  // Preferences §9 "Auto" resolves against the OS preference at boot, same
  // as any other theme pick, then keeps watching for OS changes for as
  // long as the mode stays "auto".
  const bootTheme = resolveThemeMode(persisted.prefs.themeMode);
  initTheme(bootTheme);
  if (persisted.prefs.themeMode === "auto") {
    watchAutoTheme((t) => {
      setTheme(t);
      appstate.update({ theme: t });
      void onThemeChanged();
    });
  }
  document.documentElement.dataset.readingWidth = persisted.prefs.readingWidth;

  layout.init({
    initial: {
      sidebarOpen: persisted.sidebarOpen,
      outlineOpen: persisted.outlineOpen,
      sidebarWidth: persisted.sidebarWidth,
      outlineWidth: persisted.outlineWidth,
      layout: persisted.layout,
      activePanel:
        persisted.activePanel === "outline" ? "outline" : persisted.activePanel === "search" ? "search" : "files",
    },
    onChange: onLayoutChange,
    renderWelcomeOverlay: (host) => {
      welcomeUi.mount(host, welcomeRecents(), {
        onOpenFolder: (path) => {
          layout.closeOverlay();
          void openFolder(path);
        },
        onOpenFile: (path) => {
          layout.closeOverlay();
          void openFile(path);
        },
      });
    },
    // Finding 2: the welcome screen's Shortcuts column listed ⌘⇧O/⌘⇧L
    // without either being wired to anything. Both are one-liners into
    // functions that already exist — the folder-picker flow welcome.ts's
    // own button uses, and the titlebar's own theme-toggle button (click()
    // dispatch reuses its two existing listeners — theme.ts's flip and the
    // persist+re-render one registered below — instead of duplicating
    // their logic here).
    onOpenFolderShortcut: () => {
      void pickAndOpenFolder();
    },
    onToggleThemeShortcut: () => {
      document.getElementById("theme-toggle")?.click();
    },
    onCommandPaletteShortcut: () => openCommandPalette(),
  });
  initTitlebar({
    onOpenCommandPalette: () => openCommandPalette(),
    onOpenPreferences: () => openPreferencesOverlay(),
  });
  initRail({ onOpenExport: () => openExportOverlay() });
  wireDragDrop();

  // Registered after initTheme()'s own #theme-toggle listener (which flips
  // the theme state), so getTheme() here already reflects the new theme.
  // A manual theme-toggle click is an explicit Light/Dark pick, so it also
  // breaks out of Auto mode if that was active (matches most apps' own
  // convention: any deliberate override wins over automatic OS-following).
  document.getElementById("theme-toggle")?.addEventListener("click", () => {
    unwatchAutoTheme();
    const resolved = getTheme();
    appstate.update({ theme: resolved });
    appstate.updatePrefs({ themeMode: resolved });
    void onThemeChanged();
  });

  paintChrome();
  renderStatusbar(); // paints app-level facts (sanitized/CommonMark/KaTeX) even before any tab is open

  // Reveal #app now that theme/widths/chrome all reflect restored state —
  // chrome.css starts it at opacity:0 specifically so this is the first
  // frame the user ever sees (no flash of CSS defaults beforehand).
  document.getElementById("app")?.classList.add("booted");
}

window.addEventListener("beforeunload", () => appstate.flush());

void boot();
