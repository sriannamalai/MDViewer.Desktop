// Typed wrappers over every Tauri command the Rust side exposes
// (src-tauri/src/commands.rs, src-tauri/src/uistate.rs). Shapes mirror the
// Rust structs field-for-field — see the doc comment on each type for the
// source of truth.

import { invoke } from "@tauri-apps/api/core";

/** commands.rs `DocFile` — the raw content + metadata of a file on disk. */
export interface DocFile {
  content: string;
  lines: number;
  bytes: number;
  modified_ms: number;
}

/** commands.rs `TreeNode` — one node (file or directory) of a directory tree. */
export interface TreeNode {
  name: string;
  path: string;
  is_dir: boolean;
  is_markdown: boolean;
  children: TreeNode[];
}

/** docmodel.rs `OutlineItem` — one heading in a document's outline. */
export interface OutlineItem {
  level: number;
  text: string;
  line: number;
}

/** docmodel.rs `DocModel` — the analyzed shape of a parsed document. */
export interface DocModel {
  outline: OutlineItem[];
  words: number;
  read_minutes: number;
}

export type ThemeName = "light" | "dark";

/** commands.rs `RenderPrefs` — preferences panel toggles (design §9) that affect rendering. Unlike top-level command arguments (which Tauri camelCases automatically), these are plain serde struct fields with no rename attribute, so the wire format matches Rust's own snake_case field names verbatim — same convention as `DocFile.modified_ms`/`TreeNode.is_dir` below. */
export interface RenderPrefs {
  mermaid: boolean;
  math: boolean;
  allow_raw_html: boolean;
  prose_typeface: string;
}

/** Renders `markdown` to sanitized, self-contained HTML themed for `theme`, honoring the live Preferences toggles in `prefs` (omit for library defaults). */
export function renderDocument(markdown: string, theme: ThemeName, prefs?: RenderPrefs): Promise<string> {
  return invoke<string>("render_document", { markdown, theme, prefs: prefs ?? null });
}

/** Export sheet (design §10) — same render path as renderDocument, with `fragment` selecting body-only markup instead of a full self-contained page. */
export function exportDocument(markdown: string, theme: ThemeName, fragment: boolean, prefs?: RenderPrefs): Promise<string> {
  return invoke<string>("export_document", { markdown, theme, fragment, prefs: prefs ?? null });
}

/** Writes `contents` verbatim to `path` — the export sheet's "Export" button, after a native save-dialog pick. */
export function writeExportFile(path: string, contents: string): Promise<void> {
  return invoke<void>("write_export_file", { path, contents });
}

/** commands.rs `SearchMatch`/`SearchResult` — one full-text search hit and its containing result set. */
export interface SearchMatch {
  path: string;
  line: number;
  snippet: string;
  match_start: number;
  match_end: number;
}
export interface SearchResult {
  matches: SearchMatch[];
  files_matched: number;
  truncated: boolean;
}

/** Full-text search (design §3 "Search" sidebar panel) over every markdown/text file under `root`. */
export function searchWorkspace(
  root: string,
  query: string,
  caseSensitive: boolean,
  wholeWord: boolean,
  regexMode: boolean,
): Promise<SearchResult> {
  return invoke<SearchResult>("search_workspace", { root, query, caseSensitive, wholeWord, regexMode });
}

/** Parses `markdown` and returns its outline, word count and read time. */
export function parseDocument(markdown: string): Promise<DocModel> {
  return invoke<DocModel>("parse_document", { markdown });
}

/** Reads a file from disk, returning its content plus line/byte/mtime metadata. */
export function readDocument(path: string): Promise<DocFile> {
  return invoke<DocFile>("read_document", { path });
}

/** Reads the directory tree rooted at `path`, descending up to `depth` levels. */
export function readDirTree(path: string, depth: number): Promise<TreeNode> {
  return invoke<TreeNode>("read_dir_tree", { path, depth });
}

/** Returns the linked libmdviewer library's version string. */
export function libraryVersion(): Promise<string> {
  return invoke<string>("library_version");
}

/** Loads the persisted UI-state JSON blob (`"{}"` on first launch). */
export function loadUiState(): Promise<string> {
  return invoke<string>("load_ui_state");
}

/** Persists `json` verbatim as the UI-state blob. */
export function saveUiState(json: string): Promise<void> {
  return invoke<void>("save_ui_state", { json });
}
