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

/** Renders `markdown` to sanitized, self-contained HTML themed for `theme`. */
export function renderDocument(markdown: string, theme: ThemeName): Promise<string> {
  return invoke<string>("render_document", { markdown, theme });
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
