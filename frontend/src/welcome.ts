// Welcome / empty state — design/README.md §11.
//
// Shown filling #main whenever there are no open tabs. Distinct from the
// prototype's overlay-over-a-doc version of this screen (reachable there
// via the rail's Home button with a veil + Esc-to-dismiss) — that overlay
// system is Task 7's "overlay (none/palette/settings/export/welcome)"
// state, not this task's. Here it's just the natural content of an empty
// #main.

import { open } from "@tauri-apps/plugin-dialog";

export interface RecentEntry {
  label: string;
  path: string;
  when: string;
}

export interface WelcomeCallbacks {
  onOpenFolder(path: string): void;
  onOpenFile(path: string): void;
}

const ICON_SVG = `<svg viewBox="0 0 24 24" width="38" height="38">
  <path d="M8.6 7.6 L5.6 12 L8.6 16.4" fill="none" stroke="#e2714a" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" opacity="0.22"></path>
  <path d="M15.4 7.6 L18.4 12 L15.4 16.4" fill="none" stroke="#e2714a" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" opacity="0.22"></path>
  <path d="M7.3 6.3 L3.8 12 L7.3 17.7" fill="none" stroke="#e2714a" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" opacity="0.45"></path>
  <path d="M16.7 6.3 L20.2 12 L16.7 17.7" fill="none" stroke="#e2714a" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" opacity="0.45"></path>
  <path d="M8.8 16 L8.8 8.8 L12 12.4 L15.2 8.8 L15.2 16" fill="none" stroke="url(#mdvWelcomeG)" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"></path>
  <defs>
    <linearGradient id="mdvWelcomeG" x1="8.8" y1="8.8" x2="15.2" y2="16" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#ffb27d"></stop>
      <stop offset="100%" stop-color="#e2714a"></stop>
    </linearGradient>
  </defs>
</svg>`;

const SHORTCUTS: [string, string][] = [
  ["Command palette", "⌘K"],
  ["Open folder", "⌘⇧O"],
  ["Toggle theme", "⌘⇧L"],
];

const FILE_FILTERS = [{ name: "Markdown", extensions: ["md", "markdown", "txt"] }];

export function mount(container: HTMLElement, recents: RecentEntry[], cb: WelcomeCallbacks): void {
  container.innerHTML = "";

  const card = document.createElement("div");
  card.className = "welcome-card";

  const icon = document.createElement("div");
  icon.className = "welcome-icon";
  icon.innerHTML = ICON_SVG; // static, module-local markup — not user/doc content
  card.appendChild(icon);

  const title = document.createElement("div");
  title.className = "welcome-title";
  title.textContent = "Nothing open yet";
  card.appendChild(title);

  const body = document.createElement("div");
  body.className = "welcome-body";
  body.textContent =
    "Drop a Markdown file anywhere in this window, or open a folder to browse a whole vault. " +
    "Rendering happens locally — no file ever leaves your machine.";
  card.appendChild(body);

  const actions = document.createElement("div");
  actions.className = "welcome-actions";

  const openFolderBtn = document.createElement("span");
  openFolderBtn.className = "welcome-btn welcome-btn-primary";
  openFolderBtn.textContent = "Open folder…";
  openFolderBtn.addEventListener("click", () => {
    void open({ directory: true, multiple: false }).then((picked) => {
      if (typeof picked === "string") cb.onOpenFolder(picked);
    });
  });

  const openFileBtn = document.createElement("span");
  openFileBtn.className = "welcome-btn welcome-btn-outline";
  openFileBtn.textContent = "Open file…";
  openFileBtn.addEventListener("click", () => {
    void open({ multiple: false, filters: FILE_FILTERS }).then((picked) => {
      if (typeof picked === "string") cb.onOpenFile(picked);
    });
  });

  actions.append(openFolderBtn, openFileBtn);
  card.appendChild(actions);

  const footer = document.createElement("div");
  footer.className = "welcome-footer";
  footer.append(buildRecentColumn(recents, cb), buildShortcutsColumn());
  card.appendChild(footer);

  container.appendChild(card);
}

function buildRecentColumn(recents: RecentEntry[], cb: WelcomeCallbacks): HTMLElement {
  const col = document.createElement("div");
  col.className = "welcome-col";

  const label = document.createElement("div");
  label.className = "sidebar-section-label";
  label.textContent = "Recent";
  col.appendChild(label);

  if (recents.length === 0) {
    const empty = document.createElement("div");
    empty.className = "sidebar-recent-empty";
    empty.textContent = "No recent files yet.";
    col.appendChild(empty);
    return col;
  }

  for (const entry of recents) {
    const row = document.createElement("div");
    row.className = "welcome-recent-row";
    row.addEventListener("click", () => cb.onOpenFile(entry.path));
    const name = document.createElement("span");
    name.className = "name";
    name.textContent = entry.label;
    const path = document.createElement("span");
    path.className = "path";
    path.textContent = entry.path;
    row.append(name, path);
    col.appendChild(row);
  }
  return col;
}

function buildShortcutsColumn(): HTMLElement {
  const col = document.createElement("div");
  col.className = "welcome-col";

  const label = document.createElement("div");
  label.className = "sidebar-section-label";
  label.textContent = "Shortcuts";
  col.appendChild(label);

  for (const [text, key] of SHORTCUTS) {
    const row = document.createElement("div");
    row.className = "shortcut-row";
    const t = document.createElement("span");
    t.textContent = text;
    const k = document.createElement("span");
    k.className = "shortcut-key";
    k.textContent = key;
    row.append(t, k);
    col.appendChild(row);
  }
  return col;
}
