// Panel layout state machine — design/README.md §4 (resize handles),
// "Interactions & behavior" and "State management". Single source of
// truth for {sidebarOpen, outlineOpen, sidebarWidth, outlineWidth, layout,
// activePanel}. Replaces rail.ts's and titlebar.ts's own ad-hoc
// open/close/reader booleans (Tasks 1-6) — this is now the one place that
// decides whether a panel is open, how wide it is, and whether reader mode
// is active; everything else (rail.ts, titlebar.ts, outline.ts's own
// collapse button, toolbar.ts's Outline toggle, main.ts's keyboard
// shortcuts) just calls into it.
//
// DOM ownership: this module reaches directly into #sidebar/#outline (and
// their fixed-width inner mounts, #sidebar-inner/#outline-inner-wrap), the
// two resize-handle elements, the rail's Files/Outline buttons, the
// titlebar's layout toggle, and the welcome-overlay veil — the same
// "grab it by id and own its DOM state" pattern rail.ts used to use for
// #sidebar alone. Sidebar/outline *content* (Explorer, the outline tree)
// is still rendered by explorer.ts/outline.ts into the fixed-width inner
// mounts; this module never touches their innerHTML.

export type LayoutMode = "workbench" | "reader";
export type RailPanel = "files" | "outline";

export interface LayoutState {
  sidebarOpen: boolean;
  outlineOpen: boolean;
  sidebarWidth: number;
  outlineWidth: number;
  layout: LayoutMode;
  activePanel: RailPanel;
}

export const SIDEBAR_MIN = 190;
export const SIDEBAR_MAX = 460;
export const SIDEBAR_DEFAULT = 268;
export const OUTLINE_MIN = 180;
export const OUTLINE_MAX = 400;
export const OUTLINE_DEFAULT = 236;

/** Design §4: "dragging ≥46px past the minimum collapses the panel." */
const COLLAPSE_SLOP = 46;

const IS_MAC = /Mac|iPhone|iPad|iPod/.test(navigator.platform);

export interface InitOptions {
  /** Persisted values to seed the state machine with (appstate.load()'s result) — applied before the first paint(). */
  initial: Partial<LayoutState>;
  /** Called after every state mutation — main.ts forwards the relevant fields into appstate.update(). */
  onChange(state: LayoutState): void;
  /** Renders the welcome-overlay's content into `host` — main.ts owns Recent data + open callbacks; this module only owns show/hide + veil/Esc dismissal. */
  renderWelcomeOverlay(host: HTMLElement): void;
}

interface Elements {
  sidebar: HTMLElement;
  sidebarInner: HTMLElement;
  outline: HTMLElement;
  outlineInner: HTMLElement;
  sidebarHandle: HTMLElement;
  outlineHandle: HTMLElement;
  /**
   * `#rail-outline` is intentionally *not* tracked here — the controller
   * ruled it inert for v1 (design §3's sidebar-hosted outline panel isn't
   * built, and §2's "only one icon lights up" contract must hold with
   * only Files as a real toggle). It keeps its own static "coming in v2"
   * title in index.html, same as Search/Export; the outline *column*
   * stays reachable via the doc toolbar's Outline button and ⌘J.
   */
  railFiles: HTMLElement | null;
  layoutGlyph: HTMLElement | null;
  layoutLabel: HTMLElement | null;
  overlay: HTMLElement | null;
  overlayContent: HTMLElement | null;
}

let el: Elements;
let onChange: (state: LayoutState) => void = () => {};
let renderWelcomeOverlay: (host: HTMLElement) => void = () => {};

let state: LayoutState = {
  sidebarOpen: true,
  outlineOpen: true,
  sidebarWidth: SIDEBAR_DEFAULT,
  outlineWidth: OUTLINE_DEFAULT,
  layout: "workbench",
  activePanel: "files",
};

let dragging: "sidebar" | "outline" | null = null;
let overlayOpen = false;

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function requireEl(id: string): HTMLElement {
  const found = document.getElementById(id);
  if (!found) throw new Error(`layout.ts: #${id} not found — index.html shell changed?`);
  return found;
}

/**
 * Reader mode collapses both panels without touching their underlying
 * open/closed booleans (design "Interactions & behavior": "Returning
 * restores each panel's previous open/closed state and widths") — so the
 * *visible* open state is always `stored-open && layout !== 'reader'`.
 */
function effectiveSidebarOpen(): boolean {
  return state.sidebarOpen && state.layout !== "reader";
}
function effectiveOutlineOpen(): boolean {
  return state.outlineOpen && state.layout !== "reader";
}

export function isSidebarOpen(): boolean {
  return effectiveSidebarOpen();
}
export function isOutlineOpen(): boolean {
  return effectiveOutlineOpen();
}

function paint(): void {
  const sbOpen = effectiveSidebarOpen();
  const olOpen = effectiveOutlineOpen();

  el.sidebar.classList.toggle("dragging", dragging === "sidebar");
  el.outline.classList.toggle("dragging", dragging === "outline");

  el.sidebar.style.width = sbOpen ? `${state.sidebarWidth}px` : "0px";
  el.outline.style.width = olOpen ? `${state.outlineWidth}px` : "0px";
  el.sidebar.dataset.collapsed = sbOpen ? "false" : "true";
  el.outline.dataset.collapsed = olOpen ? "false" : "true";

  // The inner mount always tracks the *stored* width, not the effective
  // (possibly-zero) one — collapsing must clip/slide the fixed-width
  // content away, never reflow/squish it mid-animation (design §4).
  el.sidebarInner.style.width = `${state.sidebarWidth}px`;
  el.outlineInner.style.width = `${state.outlineWidth}px`;

  // Handles disappear entirely while their panel is collapsed (design §4:
  // "their handle disappears") and show the accent bar while a drag on
  // *that* handle is in progress.
  el.sidebarHandle.classList.toggle("hidden", !sbOpen);
  el.outlineHandle.classList.toggle("hidden", !olOpen);
  el.sidebarHandle.classList.toggle("dragging", dragging === "sidebar");
  el.outlineHandle.classList.toggle("dragging", dragging === "outline");

  el.railFiles?.classList.toggle("active", sbOpen);

  const reader = state.layout === "reader";
  document.documentElement.dataset.layout = state.layout;
  if (el.layoutGlyph) el.layoutGlyph.textContent = reader ? "▭" : "▥";
  if (el.layoutLabel) el.layoutLabel.textContent = reader ? "Reader" : "Workbench";

  if (el.overlay) el.overlay.classList.toggle("hidden", !overlayOpen);
}

function commit(patch: Partial<LayoutState>): void {
  state = { ...state, ...patch };
  paint();
  onChange(state);
}

export function getState(): LayoutState {
  return { ...state };
}

// ---------------------------------------------------------- Panel open/close

export function setSidebarOpen(open: boolean): void {
  commit({ sidebarOpen: open });
}
export function setOutlineOpen(open: boolean): void {
  commit({ outlineOpen: open });
}

/**
 * Rail Files icon click (design §2) — the only live rail-panel toggle in
 * v1 (Outline is ruled inert; see the `railFiles` field's doc comment
 * above). Clicking it while the sidebar is already open+active closes it;
 * otherwise opens it. Always returns to Workbench — picking it while in
 * Reader exits reader mode (matches design/reference's `pick()`).
 */
export function pickFilesPanel(): void {
  const openNow = effectiveSidebarOpen();
  const wasActive = state.activePanel === "files";
  const nextOpen = !(openNow && wasActive);
  commit({ activePanel: "files", layout: "workbench", sidebarOpen: nextOpen });
}

/** Doc toolbar's "Outline" button — also forces Workbench (design/reference's `toggleOutline`), so it doubles as "leave reader and show the outline". */
export function toggleOutline(): void {
  commit({ outlineOpen: !effectiveOutlineOpen(), layout: "workbench" });
}

// ------------------------------------------------------------- Reader mode

export function toggleReaderMode(): void {
  commit({ layout: state.layout === "reader" ? "workbench" : "reader" });
}

export function setReaderMode(reader: boolean): void {
  commit({ layout: reader ? "reader" : "workbench" });
}

// ------------------------------------------------------ Resize / collapse

export function resetSidebarWidth(): void {
  commit({ sidebarWidth: SIDEBAR_DEFAULT, sidebarOpen: true });
}
export function resetOutlineWidth(): void {
  commit({ outlineWidth: OUTLINE_DEFAULT, outlineOpen: true });
}

/**
 * Drag lifecycle for a resize handle (design §4), mirroring
 * design/reference/MarkdownViewer.dc.html's `startDrag` exactly: live
 * width follows the cursor within [min, max]; dragging past `min -
 * COLLAPSE_SLOP` collapses the panel instead of clamping to `min`.
 */
export function startDrag(which: "sidebar" | "outline", ev: MouseEvent): void {
  ev.preventDefault();
  const startX = ev.clientX;
  const isSidebar = which === "sidebar";
  const min = isSidebar ? SIDEBAR_MIN : OUTLINE_MIN;
  const max = isSidebar ? SIDEBAR_MAX : OUTLINE_MAX;
  const startWidth = isSidebar ? state.sidebarWidth : state.outlineWidth;

  dragging = which;
  commit(isSidebar ? { sidebarOpen: true } : { outlineOpen: true });

  const move = (e2: MouseEvent): void => {
    // Sidebar grows to the right of its handle (delta = pointer - start);
    // outline grows to the left of its handle (delta = start - pointer) —
    // same asymmetry as design/reference.
    const delta = isSidebar ? e2.clientX - startX : startX - e2.clientX;
    const raw = startWidth + delta;
    if (raw < min - COLLAPSE_SLOP) {
      commit(isSidebar ? { sidebarOpen: false } : { outlineOpen: false });
      return;
    }
    const width = clamp(raw, min, max);
    commit(isSidebar ? { sidebarWidth: width, sidebarOpen: true } : { outlineWidth: width, outlineOpen: true });
  };
  const up = (): void => {
    dragging = null;
    window.removeEventListener("mousemove", move);
    window.removeEventListener("mouseup", up);
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
    paint();
  };
  window.addEventListener("mousemove", move);
  window.addEventListener("mouseup", up);
  document.body.style.cursor = "col-resize";
  document.body.style.userSelect = "none";
}

// ------------------------------------------------- Overlay (welcome-over-doc)

/** Rail Home button (design §2/§11) — shows the welcome content as a dismissible veil over whatever's already open, without touching main.ts's document store. */
export function openWelcomeOverlay(): void {
  if (!el.overlayContent) return;
  renderWelcomeOverlay(el.overlayContent);
  overlayOpen = true;
  paint();
}

export function closeOverlay(): void {
  if (!overlayOpen) return;
  overlayOpen = false;
  paint();
}

export function isOverlayOpen(): boolean {
  return overlayOpen;
}

// --------------------------------------------------------------- Keyboard

function isPrimaryModifier(ev: KeyboardEvent): boolean {
  return IS_MAC ? ev.metaKey : ev.ctrlKey;
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable;
}

function onKeydown(ev: KeyboardEvent): void {
  if (ev.key === "Escape") {
    if (overlayOpen) {
      ev.preventDefault();
      closeOverlay();
    }
    return;
  }
  if (isTypingTarget(ev.target)) return;
  const key = ev.key.toLowerCase();
  if (isPrimaryModifier(ev) && key === "b") {
    ev.preventDefault();
    // Toggle the *effective* (reader-mode-aware) state, not the raw stored
    // boolean: in reader mode with sidebarOpen stored true (so effectively
    // hidden), the first ⌘B must exit reader AND show the panel, not just
    // flip the boolean to false and leave it hidden.
    commit({ sidebarOpen: !effectiveSidebarOpen(), layout: "workbench" });
  } else if (isPrimaryModifier(ev) && key === "j") {
    ev.preventDefault();
    commit({ outlineOpen: !effectiveOutlineOpen(), layout: "workbench" });
  }
}

// ----------------------------------------------------------------- Wiring

export function init(opts: InitOptions): void {
  el = {
    sidebar: requireEl("sidebar"),
    sidebarInner: requireEl("sidebar-inner"),
    outline: requireEl("outline"),
    outlineInner: requireEl("outline-inner-wrap"),
    sidebarHandle: requireEl("sidebar-handle"),
    outlineHandle: requireEl("outline-handle"),
    railFiles: document.getElementById("rail-files"),
    layoutGlyph: document.getElementById("layout-glyph"),
    layoutLabel: document.getElementById("layout-label"),
    overlay: document.getElementById("overlay"),
    overlayContent: document.getElementById("overlay-content"),
  };

  onChange = opts.onChange;
  renderWelcomeOverlay = opts.renderWelcomeOverlay;

  state = {
    sidebarOpen: opts.initial.sidebarOpen ?? state.sidebarOpen,
    outlineOpen: opts.initial.outlineOpen ?? state.outlineOpen,
    sidebarWidth: clamp(opts.initial.sidebarWidth ?? state.sidebarWidth, SIDEBAR_MIN, SIDEBAR_MAX),
    outlineWidth: clamp(opts.initial.outlineWidth ?? state.outlineWidth, OUTLINE_MIN, OUTLINE_MAX),
    layout: opts.initial.layout ?? state.layout,
    activePanel: opts.initial.activePanel ?? state.activePanel,
  };

  el.sidebarHandle.addEventListener("mousedown", (ev) => startDrag("sidebar", ev));
  el.sidebarHandle.addEventListener("dblclick", () => resetSidebarWidth());
  el.outlineHandle.addEventListener("mousedown", (ev) => startDrag("outline", ev));
  el.outlineHandle.addEventListener("dblclick", () => resetOutlineWidth());

  // Rail Outline is inert for v1 (controller ruling) — no click wiring, no
  // "active" paint; the right-hand outline column stays reachable via the
  // doc toolbar's Outline button (toggleOutline()) and ⌘J.
  el.railFiles?.addEventListener("click", () => pickFilesPanel());
  document.getElementById("layout-toggle")?.addEventListener("click", () => toggleReaderMode());

  el.overlay?.addEventListener("click", (ev) => {
    if (ev.target === el.overlay) closeOverlay();
  });

  window.addEventListener("keydown", onKeydown);

  // Boot restore, no flash: apply the persisted widths/collapse/layout
  // with transitions forcibly off for one frame, so relaunching with a
  // non-default width never visibly animates in from the CSS default.
  el.sidebar.classList.add("dragging");
  el.outline.classList.add("dragging");
  paint();
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      el.sidebar.classList.remove("dragging");
      el.outline.classList.remove("dragging");
    });
  });
}
