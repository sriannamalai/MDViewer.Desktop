// Command palette — design/README.md §8 ("⌘K or search pill").
//
// Stateless-ish renderer like tabs.ts/explorer.ts, but owns its own
// transient UI state (query text, highlighted row index) since that state
// is local to one overlay session and never persisted — main.ts just
// supplies the command list once per open and a callback to run one.

export interface PaletteCommand {
  id: string;
  /** Single glyph/short label shown in the icon column (design: 16px icon). */
  icon: string;
  label: string;
  /** Rendered as a keycap on the right, e.g. "⌘⇧L" — omit for commands with no bound shortcut. */
  shortcut?: string;
  run(): void;
}

let host: HTMLElement | null = null;
let commands: PaletteCommand[] = [];
let filtered: PaletteCommand[] = [];
let activeIndex = 0;
let onClose: () => void = () => {};

function normalize(s: string): string {
  return s.toLowerCase();
}

/** Simple substring filter over label — palette lists are short (a dozen commands), so fuzzy scoring isn't worth the complexity. */
function filterCommands(query: string): PaletteCommand[] {
  const q = normalize(query.trim());
  if (!q) return commands;
  return commands.filter((c) => normalize(c.label).includes(q));
}

function runActive(): void {
  const cmd = filtered[activeIndex];
  if (!cmd) return;
  onClose();
  cmd.run();
}

function paint(): void {
  if (!host) return;
  host.innerHTML = "";

  const panel = document.createElement("div");
  panel.className = "palette-panel";
  panel.addEventListener("click", (ev) => ev.stopPropagation());

  const queryRow = document.createElement("div");
  queryRow.className = "palette-query-row";
  const glyph = document.createElement("span");
  glyph.className = "palette-query-glyph";
  glyph.textContent = "⌘";
  const input = document.createElement("input");
  input.type = "text";
  input.className = "palette-query-input";
  input.placeholder = "Type a command…";
  input.autocomplete = "off";
  input.spellcheck = false;
  queryRow.append(glyph, input);

  const list = document.createElement("div");
  list.className = "palette-list";
  const sectionLabel = document.createElement("div");
  sectionLabel.className = "palette-section-label";
  sectionLabel.textContent = "Commands";
  list.appendChild(sectionLabel);

  const rowsHost = document.createElement("div");
  list.appendChild(rowsHost);

  function paintRows(): void {
    rowsHost.innerHTML = "";
    if (filtered.length === 0) {
      const empty = document.createElement("div");
      empty.className = "palette-empty";
      empty.textContent = "No matching commands.";
      rowsHost.appendChild(empty);
      return;
    }
    filtered.forEach((cmd, i) => {
      const row = document.createElement("div");
      row.className = "palette-row" + (i === activeIndex ? " active" : "");
      row.addEventListener("mouseenter", () => {
        activeIndex = i;
        paintRows();
      });
      row.addEventListener("click", () => {
        activeIndex = i;
        runActive();
      });

      const rowIcon = document.createElement("span");
      rowIcon.className = "palette-row-icon";
      rowIcon.textContent = cmd.icon;

      const rowLabel = document.createElement("span");
      rowLabel.className = "palette-row-label";
      rowLabel.textContent = cmd.label;

      row.append(rowIcon, rowLabel);
      if (cmd.shortcut) {
        const key = document.createElement("span");
        key.className = "palette-row-key";
        key.textContent = cmd.shortcut;
        row.appendChild(key);
      }
      rowsHost.appendChild(row);
    });
  }
  paintRows();

  const footer = document.createElement("div");
  footer.className = "palette-footer";
  for (const text of ["↑↓ navigate", "↵ run", "esc dismiss"]) {
    const span = document.createElement("span");
    span.textContent = text;
    footer.appendChild(span);
  }

  input.addEventListener("input", () => {
    filtered = filterCommands(input.value);
    activeIndex = 0;
    paintRows();
  });
  input.addEventListener("keydown", (ev) => {
    if (ev.key === "ArrowDown") {
      ev.preventDefault();
      activeIndex = Math.min(activeIndex + 1, filtered.length - 1);
      paintRows();
    } else if (ev.key === "ArrowUp") {
      ev.preventDefault();
      activeIndex = Math.max(activeIndex - 1, 0);
      paintRows();
    } else if (ev.key === "Enter") {
      ev.preventDefault();
      runActive();
    }
    // Escape is handled by layout.ts's own overlay-dismissal keydown listener.
  });

  panel.append(queryRow, list, footer);
  host.appendChild(panel);
  input.focus();
}

/** Mounts the palette into `host` (the shared overlay content element) with `cmds` as the full, unfiltered command list. */
export function mount(container: HTMLElement, cmds: PaletteCommand[], cb: { onClose(): void }): void {
  host = container;
  commands = cmds;
  filtered = cmds;
  activeIndex = 0;
  onClose = cb.onClose;
  paint();
}
