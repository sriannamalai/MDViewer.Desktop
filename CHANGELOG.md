# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
This project has not yet tagged a `v1.0.0` release, so everything below is
grouped under `[Unreleased]`; see `AGENTS.md` for the current pinned
`libmdviewer` version and architectural decisions.

## [Unreleased]

### Added

- **Tauri 2 scaffold** — frameless window, custom-drawn chrome, Vite
  (vanilla TypeScript, no framework) frontend boot.
- **Chrome shell** — design tokens, bundled fonts (IBM Plex Sans, Source
  Serif 4, JetBrains Mono), titlebar, activity rail, window controls.
- **Safe Rust FFI layer** over `libmdviewer` (originally pinned at
  v0.5.0), with `mdv_render`/`mdv_parse`/`mdv_asset`/`mdv_free`/
  `mdv_version` wrapped behind an owned-memory, panic-safe boundary.
- **Document model + core commands** — `render_document`,
  `parse_document`, `read_document`, `read_dir_tree`, `library_version`,
  and persisted `load_ui_state`/`save_ui_state` UI-state commands.
- **Explorer, tabs, welcome screen, and the sandboxed document viewer** —
  markdown/plain files opened into tabs, rendered HTML loaded into a
  sandboxed `<iframe sandbox="allow-scripts">`, with a raw source-view
  toggle.
- **Outline with scrollspy**, doc toolbar (breadcrumb, stats, Outline/
  Source toggles), status bar, and a `data-md-line`-driven active-section
  tracker shared between the outline and status bar.
- **Panel resize/collapse, Workbench ↔ Reader layout, theme persistence,
  and keyboard shortcuts** (⌘K, ⌘B, ⌘J) — a single layout state machine
  now owns sidebar/outline open state, widths, and reader-mode padding.
- **`libmdviewer` embedded directly into the macOS `.app` bundle**
  (Frameworks dir, `@executable_path` rpath) so release builds run
  standalone without a separately-installed library.
- **Library-rendered code-block headers** (language label + Copy
  affordance) once `libmdviewer` began emitting them itself (v0.8).
- **Drag-and-drop file opening**, honest welcome-screen affordances
  (Recent list, wired ⌘⇧O/⌘⇧L shortcuts), and inline open-error
  surfacing for a moved/deleted file or folder.
- **Command palette (⌘K / titlebar search pill)** — theme, sidebar,
  outline, and layout toggles; source-view toggle; open file/folder;
  jump to Search; open Preferences; open the export sheet.
- **Preferences panel (⚙)** — Theme (Light/Dark/Auto, OS-following via
  `prefers-color-scheme`), Reading width (Narrow/Medium/Wide), Prose
  typeface (Sans/Serif, via the library's `extraCss` render option),
  Render math and diagrams, and Allow raw HTML (the last two wired to
  new `mermaid`/`math`/`allowRawHTML` render options). Window chrome
  stays Unified-only (no native-chrome mode exists yet) and is shown
  inert with an explanatory hint.
- **Full-text search panel** — a new `search_workspace` command greps
  every markdown/text file under the open folder (case-sensitivity,
  whole-word, and regex toggles), with results that open the file and
  scroll to the matching line.
- **Export sheet** — Self-contained HTML and HTML fragment export (a new
  `export_document`/`write_export_file` command pair plus the native
  save dialog); PDF export via a hidden print-only iframe and the
  system print dialog ("Save as PDF" everywhere Tauri targets).
- **Network gating for the document iframe (v2 item)** — a restrictive
  Content-Security-Policy is now injected into every rendered document,
  blocking remote image/font/connect requests by default (only
  `data:`/`blob:` embedded assets are allowed); external links are
  intercepted and opened explicitly through the OS's default browser
  (`tauri-plugin-opener`) instead of silently failing inside the
  sandboxed frame.
- **CI and release pipeline** — cross-platform build/test workflow and a
  release workflow mirroring `MarkDownViewer`'s matrix/package/checksum/
  upload strategy, covering macOS (arm64 + x86_64), Windows (x64 + arm64)
  and Linux (x64 + arm64).

### Changed

- Bumped the pinned `libmdviewer` from v0.5.0 → v0.8.1 → v0.10.0 →
  v0.11.0 as the core library shipped new releases; v0.10.0 added the
  native render tree, which this app deliberately does not consume (see
  AGENTS.md's "Architectural specialization" note) — it stays on the
  HTML/webview pipeline by design. v0.11.0's library-side changes (CRLF
  highlighting fix, footnote jump-to-definition primitive, a Mermaid
  offscreen-render asset) are render-tree/native-host primitives this
  app has no use for. Enabled the previously-gated `windows-arm64`
  release job now that the core library publishes that native artifact.

### Fixed

- Null-guarded empty FFI success payloads in the Rust call helper.
- Surfaced missing paths from `read_dir_tree` as an error instead of an
  empty leaf node.
- Minimal window-control capability grants (only the exact Tauri
  permissions the titlebar's buttons use).
- Preserved the active document across a background tab close, and
  coerced malformed scrollspy postMessage payloads instead of trusting
  them.
- Main-column growth, boot-flash guard (restored UI state now paints
  before the first frame), and effective-state (reader-mode-aware)
  keyboard shortcuts.
- Open-error surfacing for a Recent/Explorer entry whose target file or
  folder has since moved or been deleted.

### Known limitations

See `AGENTS.md`'s "Known limitations" section — currently: darwin-arm64
is the only macOS target vendored by default outside of CI (multi-arch
bundling now happens in the release workflow), and the release binary
still embeds the dev vendor rpath alongside the bundle-relative one
(harmless, not yet cleaned up).
