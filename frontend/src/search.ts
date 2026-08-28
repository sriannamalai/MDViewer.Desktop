// Full-text search sidebar panel — design/README.md §3 ("Search").
//
// Renders into the same #sidebar-inner mount explorer.ts uses, toggled by
// layout.ts's `activePanel` state (main.ts decides which of
// explorer.ts/search.ts to paint there, mirroring how it already decides
// between the doc content and welcome.ts). Owns its own transient query/
// filter-chip/results state — none of it is persisted, matching the
// design brief's "State management" list (search isn't in it).

import * as ipc from "./ipc";

export interface SearchCallbacks {
  /** A result row was clicked — main.ts opens the file (if needed) and scrolls to the line. */
  onOpenMatch(path: string, line: number): void;
}

interface QueryState {
  text: string;
  caseSensitive: boolean;
  regex: boolean;
  wholeWord: boolean;
}

let query: QueryState = { text: "", caseSensitive: false, regex: false, wholeWord: false };
let result: ipc.SearchResult | null = null;
let error: string | null = null;
let searchToken = 0;
let root: string | null = null;
let host: HTMLElement | null = null;
let cb: SearchCallbacks = { onOpenMatch: () => {} };

const DEBOUNCE_MS = 150;
let debounceTimer: ReturnType<typeof setTimeout> | null = null;

function fileLabel(path: string): string {
  const norm = path.replace(/\\/g, "/");
  if (root) {
    const normRoot = root.replace(/\\/g, "/").replace(/\/$/, "");
    if (norm.startsWith(`${normRoot}/`)) return norm.slice(normRoot.length + 1);
  }
  const parts = norm.split("/").filter(Boolean);
  return parts[parts.length - 1] ?? path;
}

async function runSearch(): Promise<void> {
  const token = ++searchToken;
  if (!root || query.text.trim().length === 0) {
    result = null;
    error = null;
    paint();
    return;
  }
  try {
    const r = await ipc.searchWorkspace(root, query.text, query.caseSensitive, query.wholeWord, query.regex);
    if (token !== searchToken) return; // a newer keystroke's search has already superseded this one
    result = r;
    error = null;
  } catch (err) {
    if (token !== searchToken) return;
    result = null;
    error = err instanceof Error ? err.message : String(err);
  }
  paint();
}

function scheduleSearch(): void {
  if (debounceTimer !== null) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => void runSearch(), DEBOUNCE_MS);
}

function buildChip(label: string, active: boolean, onClick: () => void): HTMLElement {
  const chip = document.createElement("span");
  chip.className = "search-chip" + (active ? " active" : "");
  chip.textContent = label;
  chip.addEventListener("click", onClick);
  return chip;
}

/** Splits `snippet` around [start, end) (char offsets) into plain/highlighted/plain spans. */
function buildSnippet(snippet: string, start: number, end: number): HTMLElement {
  const el = document.createElement("div");
  el.className = "search-result-snippet";
  const chars = Array.from(snippet);
  const before = chars.slice(0, start).join("");
  const match = chars.slice(start, end).join("");
  const after = chars.slice(end).join("");
  if (before) el.appendChild(document.createTextNode(before));
  if (match) {
    const mark = document.createElement("span");
    mark.className = "search-result-match";
    mark.textContent = match;
    el.appendChild(mark);
  }
  if (after) el.appendChild(document.createTextNode(after));
  return el;
}

function paint(): void {
  if (!host) return;
  host.innerHTML = "";

  const header = document.createElement("div");
  header.className = "sidebar-header";
  const title = document.createElement("span");
  title.className = "sidebar-title";
  title.textContent = "Search";
  header.appendChild(title);

  const body = document.createElement("div");
  body.className = "search-body";

  if (!root) {
    const empty = document.createElement("div");
    empty.className = "explorer-empty";
    empty.textContent = "Open a folder to search its files.";
    body.appendChild(empty);
    host.append(header, body);
    return;
  }

  const queryWrap = document.createElement("div");
  queryWrap.className = "search-query-wrap";

  const queryRow = document.createElement("div");
  queryRow.className = "search-query-row";
  const icon = document.createElement("span");
  icon.className = "search-query-icon";
  icon.textContent = "⌕";
  const input = document.createElement("input");
  input.type = "text";
  input.className = "search-query-input";
  input.placeholder = "Search files and headings";
  input.value = query.text;
  input.spellcheck = false;
  input.addEventListener("input", () => {
    query = { ...query, text: input.value };
    scheduleSearch();
  });
  queryRow.append(icon, input);

  const chipRow = document.createElement("div");
  chipRow.className = "search-chip-row";
  chipRow.append(
    buildChip("Aa", query.caseSensitive, () => {
      query = { ...query, caseSensitive: !query.caseSensitive };
      paint();
      void runSearch();
    }),
    buildChip(".*", query.regex, () => {
      query = { ...query, regex: !query.regex };
      paint();
      void runSearch();
    }),
    buildChip("Whole word", query.wholeWord, () => {
      query = { ...query, wholeWord: !query.wholeWord };
      paint();
      void runSearch();
    }),
  );

  queryWrap.append(queryRow, chipRow);
  body.appendChild(queryWrap);

  const resultsWrap = document.createElement("div");
  resultsWrap.className = "search-results-wrap";

  if (error) {
    const errEl = document.createElement("div");
    errEl.className = "search-error";
    errEl.textContent = error;
    resultsWrap.appendChild(errEl);
  } else if (result) {
    const count = document.createElement("div");
    count.className = "search-count";
    const total = result.matches.length;
    count.textContent = query.text.trim()
      ? `${total}${result.truncated ? "+" : ""} result${total === 1 ? "" : "s"} in ${result.files_matched} file${result.files_matched === 1 ? "" : "s"}`
      : "";
    resultsWrap.appendChild(count);

    const list = document.createElement("div");
    list.className = "search-result-list";
    for (const m of result.matches) {
      const card = document.createElement("div");
      card.className = "search-result-card";
      card.addEventListener("click", () => cb.onOpenMatch(m.path, m.line));

      const meta = document.createElement("div");
      meta.className = "search-result-meta";
      const name = document.createElement("span");
      name.className = "search-result-file";
      name.textContent = fileLabel(m.path);
      const lineNo = document.createElement("span");
      lineNo.className = "search-result-line";
      lineNo.textContent = `L${m.line}`;
      meta.append(name, lineNo);

      card.append(meta, buildSnippet(m.snippet, m.match_start, m.match_end));
      list.appendChild(card);
    }
    resultsWrap.appendChild(list);
  }

  body.appendChild(resultsWrap);
  host.append(header, body);
}

/** Renders the panel into `container` (main.ts's `#sidebar-inner`), rooted at `folderPath` (null when no folder is open). */
export function render(container: HTMLElement, folderPath: string | null, callbacks: SearchCallbacks): void {
  host = container;
  cb = callbacks;
  if (root !== folderPath) {
    root = folderPath;
    result = null;
    error = null;
  }
  paint();
}
