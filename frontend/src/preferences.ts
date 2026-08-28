// Preferences panel — design/README.md §9.
//
// Stateless renderer driven entirely by the current appstate.Prefs plus a
// callback for each row; main.ts re-renders the live document whenever a
// rendering-relevant pref changes (renderMathDiagrams/allowRawHtml/
// proseTypeface), and re-applies the reading-width/typeface CSS hook via
// document.documentElement's dataset. Only "Appearance" and "Rendering" /
// "Security" rows are backed by real state — "Window chrome" stays
// Unified-only (this app has no native-chrome mode to switch to) and is
// rendered inert with an explanatory tooltip, matching the "— coming in
// v2" convention used elsewhere (titlebar search pill, rail Search/Export
// before this task).

import type { Prefs, ProseTypeface, ReadingWidth, ThemeMode } from "./appstate";

export type PrefsTab = "appearance" | "reading" | "rendering" | "security";

export interface PreferencesCallbacks {
  onThemeMode(mode: ThemeMode): void;
  onReadingWidth(width: ReadingWidth): void;
  onProseTypeface(typeface: ProseTypeface): void;
  onRenderMathDiagrams(on: boolean): void;
  onAllowRawHtml(on: boolean): void;
  onClose(): void;
}

const TABS: { id: PrefsTab; label: string }[] = [
  { id: "appearance", label: "Appearance" },
  { id: "reading", label: "Reading" },
  { id: "rendering", label: "Rendering" },
  { id: "security", label: "Security" },
];

let activeTab: PrefsTab = "appearance";

function segmented<T extends string>(options: { value: T; label: string }[], active: T, onPick: (v: T) => void): HTMLElement {
  const track = document.createElement("div");
  track.className = "prefs-segmented";
  for (const opt of options) {
    const seg = document.createElement("span");
    seg.className = "prefs-segment" + (opt.value === active ? " active" : "");
    seg.textContent = opt.label;
    seg.addEventListener("click", () => onPick(opt.value));
    track.appendChild(seg);
  }
  return track;
}

function toggle(on: boolean, onToggle: () => void, disabled = false): HTMLElement {
  const track = document.createElement("div");
  track.className = "prefs-toggle" + (on ? " on" : "") + (disabled ? " disabled" : "");
  const knob = document.createElement("div");
  knob.className = "prefs-toggle-knob";
  track.appendChild(knob);
  if (!disabled) track.addEventListener("click", onToggle);
  return track;
}

function row(label: string, hint: string, control: HTMLElement, inert = false): HTMLElement {
  const r = document.createElement("div");
  r.className = "prefs-row" + (inert ? " inert" : "");
  const left = document.createElement("div");
  left.className = "prefs-row-text";
  const labelEl = document.createElement("div");
  labelEl.className = "prefs-row-label";
  labelEl.textContent = label;
  const hintEl = document.createElement("div");
  hintEl.className = "prefs-row-hint";
  hintEl.textContent = hint;
  left.append(labelEl, hintEl);
  r.append(left, control);
  return r;
}

function paint(host: HTMLElement, prefs: Prefs, cb: PreferencesCallbacks): void {
  host.innerHTML = "";

  const panel = document.createElement("div");
  panel.className = "prefs-panel";
  panel.addEventListener("click", (ev) => ev.stopPropagation());

  const header = document.createElement("div");
  header.className = "prefs-header";
  const title = document.createElement("span");
  title.className = "prefs-title";
  title.textContent = "Preferences";
  const close = document.createElement("span");
  close.className = "prefs-close";
  close.textContent = "✕";
  close.addEventListener("click", () => cb.onClose());
  header.append(title, close);

  const tabRow = document.createElement("div");
  tabRow.className = "prefs-tabs";
  for (const tab of TABS) {
    const el = document.createElement("span");
    el.className = "prefs-tab" + (tab.id === activeTab ? " active" : "");
    el.textContent = tab.label;
    el.addEventListener("click", () => {
      activeTab = tab.id;
      paint(host, prefs, cb);
    });
    tabRow.appendChild(el);
  }

  const body = document.createElement("div");
  body.className = "prefs-body";

  if (activeTab === "appearance") {
    body.append(
      row(
        "Theme",
        "Follows the OS by default; identical palette on every platform.",
        segmented(
          [
            { value: "light" as ThemeMode, label: "Light" },
            { value: "dark" as ThemeMode, label: "Dark" },
            { value: "auto" as ThemeMode, label: "Auto" },
          ],
          prefs.themeMode,
          cb.onThemeMode,
        ),
      ),
      row(
        "Window chrome",
        "MarkDownViewer draws its own titlebar so macOS, Windows and Linux look the same. Native mode isn't available yet.",
        segmented([{ value: "unified", label: "Unified" }, { value: "native", label: "Native" }], "unified", () => {}),
        true,
      ),
    );
  } else if (activeTab === "reading") {
    body.append(
      row(
        "Reading width",
        "Measure of the prose column.",
        segmented(
          [
            { value: "narrow" as ReadingWidth, label: "Narrow" },
            { value: "medium" as ReadingWidth, label: "Medium" },
            { value: "wide" as ReadingWidth, label: "Wide" },
          ],
          prefs.readingWidth,
          cb.onReadingWidth,
        ),
      ),
      row(
        "Prose typeface",
        "Headings always set in Source Serif 4.",
        segmented(
          [
            { value: "sans" as ProseTypeface, label: "Sans" },
            { value: "serif" as ProseTypeface, label: "Serif" },
          ],
          prefs.proseTypeface,
          cb.onProseTypeface,
        ),
      ),
    );
  } else if (activeTab === "rendering") {
    body.append(
      row(
        "Render math and diagrams",
        "KaTeX and mermaid run from embedded copies — no network access.",
        toggle(prefs.renderMathDiagrams, () => cb.onRenderMathDiagrams(!prefs.renderMathDiagrams)),
      ),
    );
  } else {
    body.append(
      row(
        "Allow raw HTML",
        "Disables sanitization. Only enable for documents you fully trust.",
        toggle(prefs.allowRawHtml, () => cb.onAllowRawHtml(!prefs.allowRawHtml)),
      ),
    );
  }

  panel.append(header, tabRow, body);
  host.appendChild(panel);
}

/** Mounts the preferences overlay into `host`, resetting to the Appearance tab on every fresh open. */
export function mount(host: HTMLElement, prefs: Prefs, cb: PreferencesCallbacks): void {
  activeTab = "appearance";
  paint(host, prefs, cb);
}

/** Re-paints in place (current tab preserved) after a pref changes elsewhere — main.ts calls this after each callback so the toggled control reflects the new value immediately. */
export function refresh(host: HTMLElement, prefs: Prefs, cb: PreferencesCallbacks): void {
  paint(host, prefs, cb);
}
