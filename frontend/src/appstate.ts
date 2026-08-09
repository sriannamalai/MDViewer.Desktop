// Persisted UI state — design/README.md "State management" + the task-7
// spec's shape: { theme, layout, sidebarOpen, outlineOpen, sidebarWidth,
// outlineWidth, activePanel, recents }. This is the single place that
// talks to ipc.ts's load_ui_state/save_ui_state — layout.ts and main.ts
// read/write through it instead of hitting IPC directly, so debouncing and
// shape validation live in one spot.
//
// Loading is a normal async IPC round trip; `load()` must be awaited
// before layout.ts's `init()` runs so the very first paint already
// reflects the restored theme/widths/open-state instead of flashing
// defaults then snapping to the real values a frame later.

import * as ipc from "./ipc";
import type { ThemeName } from "./ipc";

export type LayoutMode = "workbench" | "reader";
export type PanelName = "files" | "search" | "outline";

export interface RecentEntry {
  path: string;
  /** epoch ms */
  openedAt: number;
}

export interface PersistedState {
  theme: ThemeName;
  layout: LayoutMode;
  sidebarOpen: boolean;
  outlineOpen: boolean;
  sidebarWidth: number;
  outlineWidth: number;
  activePanel: PanelName;
  recents: RecentEntry[];
}

const RECENTS_CAP = 8;
const SAVE_DEBOUNCE_MS = 300;

const DEFAULT_STATE: PersistedState = {
  theme: "light",
  layout: "workbench",
  sidebarOpen: true,
  outlineOpen: true,
  sidebarWidth: 268,
  outlineWidth: 236,
  activePanel: "files",
  recents: [],
};

let state: PersistedState = { ...DEFAULT_STATE };
let saveTimer: ReturnType<typeof setTimeout> | null = null;

function isThemeName(v: unknown): v is ThemeName {
  return v === "light" || v === "dark";
}
function isLayoutMode(v: unknown): v is LayoutMode {
  return v === "workbench" || v === "reader";
}
function isPanelName(v: unknown): v is PanelName {
  return v === "files" || v === "search" || v === "outline";
}
function clampedNumber(v: unknown, fallback: number, min: number, max: number): number {
  return typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback;
}

/**
 * Narrows an arbitrary parsed JSON blob into a valid PersistedState,
 * falling back field-by-field to defaults. Never throws — a corrupt,
 * hand-edited, or older-version blob just loses whichever fields don't
 * check out, rather than blocking boot.
 */
function sanitize(raw: unknown): PersistedState {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const recentsRaw = Array.isArray(r.recents) ? r.recents : [];
  const recents: RecentEntry[] = recentsRaw
    .filter((e): e is Record<string, unknown> => !!e && typeof e === "object")
    .map((e) => ({
      path: typeof e.path === "string" ? e.path : "",
      openedAt: clampedNumber(e.openedAt, 0, 0, Number.MAX_SAFE_INTEGER),
    }))
    .filter((e) => e.path.length > 0)
    .slice(0, RECENTS_CAP);

  return {
    theme: isThemeName(r.theme) ? r.theme : DEFAULT_STATE.theme,
    layout: isLayoutMode(r.layout) ? r.layout : DEFAULT_STATE.layout,
    sidebarOpen: typeof r.sidebarOpen === "boolean" ? r.sidebarOpen : DEFAULT_STATE.sidebarOpen,
    outlineOpen: typeof r.outlineOpen === "boolean" ? r.outlineOpen : DEFAULT_STATE.outlineOpen,
    sidebarWidth: clampedNumber(r.sidebarWidth, DEFAULT_STATE.sidebarWidth, 190, 460),
    outlineWidth: clampedNumber(r.outlineWidth, DEFAULT_STATE.outlineWidth, 180, 400),
    activePanel: isPanelName(r.activePanel) ? r.activePanel : DEFAULT_STATE.activePanel,
    recents,
  };
}

/** Loads persisted state from disk. Must be called (and awaited) before layout.ts's init() so the first paint already reflects it. */
export async function load(): Promise<PersistedState> {
  try {
    const json = await ipc.loadUiState();
    state = sanitize(JSON.parse(json) as unknown);
  } catch (err) {
    console.error("appstate.load: falling back to defaults:", err);
    state = { ...DEFAULT_STATE };
  }
  return state;
}

export function getState(): PersistedState {
  return state;
}

function scheduleSave(): void {
  if (saveTimer !== null) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    void ipc.saveUiState(JSON.stringify(state)).catch((err) => console.error("appstate: save_ui_state failed:", err));
  }, SAVE_DEBOUNCE_MS);
}

/** Merges `patch` into the persisted state and (debounce-)saves it. */
export function update(patch: Partial<PersistedState>): void {
  state = { ...state, ...patch };
  scheduleSave();
}

/** Records a successful file open: moves/pushes `path` to the front of `recents`, capped at 8, newest first. */
export function addRecent(path: string): void {
  const deduped = state.recents.filter((r) => r.path !== path);
  deduped.unshift({ path, openedAt: Date.now() });
  state.recents = deduped.slice(0, RECENTS_CAP);
  scheduleSave();
}

/** Flushes a pending debounced save immediately (e.g. before the window closes). */
export function flush(): void {
  if (saveTimer === null) return;
  clearTimeout(saveTimer);
  saveTimer = null;
  void ipc.saveUiState(JSON.stringify(state)).catch((err) => console.error("appstate: flush save_ui_state failed:", err));
}
