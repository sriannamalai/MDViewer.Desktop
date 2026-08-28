# AGENTS.md — MDViewer.Desktop

Persistent project memory for agents. Update whenever architecture,
status, or roadmap materially changes.

## What this project is
A cross-platform (macOS/Windows/Linux) read-only Markdown viewer desktop
app: a **Tauri 2** shell (Rust backend + a small vanilla-TS/Vite frontend,
no framework) over `libmdviewer`, the C-ABI build of the
[MarkDownViewer](https://github.com/sriannamalai/markdownviewer) Go
library. Frameless window with fully custom-drawn chrome so the app looks
pixel-identical on every OS. 19 commits, version `0.1.0`, still pre-v1.

## The sibling repos (the bigger picture)
- **`~/Developer/OpenSource/MarkDownViewer`** — the rendering engine this
  app embeds. Consumed here via the **C ABI** (`libmdviewer`), vendored
  per-platform under `vendor/libmdviewer/` and currently **pinned at
  v0.11.0** (see `scripts/fetch-libmdviewer.sh` and `vendor/checksums.txt`,
  now covering all six desktop targets including windows-arm64). This app
  uses six ABI symbols (`mdv_render`, `mdv_parse`, `mdv_asset`, `mdv_free`,
  `mdv_version`, all via `mdv_render`'s options JSON growing `mermaid`/
  `math`/`allowRawHTML`/`fragment`/`extraCss` support for the Preferences
  and Export sheet screens) — it does **not** consume the native render
  tree (`mdv_render_tree*`), by design (see "Architectural specialization"
  below). v0.11.0's library-side changes (CRLF highlighting fix, footnote
  `DefID`/`FootnoteByIndex`, `mermaid-bridge.js`) are render-tree/native-host
  primitives this app has no use for — its HTML output already highlights
  CRLF fences and renders live interactive `mermaid.js` diagrams.
- **`~/Developer/OpenSource/MDViewer.Mobile`** — the Flutter sibling app,
  same design identity (`design/TOKENS.md` here is byte-identical to that
  repo's copy — keep them in sync), same rendering engine, different
  platform and a more advanced (native render-tree) reader. Useful as a
  reference for how a design decision or FFI quirk was resolved there.

## Architectural specialization (finalized cross-repo decision)
**Desktop is the HTML/webview rendering flagship by design and is NOT
pursuing the native render tree.** This was evaluated and finalized
as part of a cross-repo rendering-engine synchronization effort and is
deliberately kept, not a gap to close:
- Tauri's entire UI — including today's document viewer — already runs
  inside a system webview (`WKWebView`/`WebView2`/WebKitGTK). There are
  no OS-native widgets to gain by switching to `mdv_render_tree*`:
  building DOM nodes from the JSON tree via `createElement` would still
  execute in the same browser engine `innerHTML` does today, and naive
  node-by-node construction is often *slower* than the browser's own
  native HTML parser without added virtualization work.
- Desktop's HTML pipeline is already a complete, working showcase of the
  library's HTML surface — real interactive `mermaid.js` and KaTeX
  rendering, code-block headers, theming, and (as of this pass) a strict
  per-document Content-Security-Policy — unlike Mobile's native path,
  which still lacks native Mermaid support.
- Mobile, by contrast, paints native widgets directly via Flutter's own
  Skia/Impeller pipeline with virtualized scrolling, while its webview
  fallback embeds a full heavyweight platform WebView per document — so
  native is the genuinely faster, lighter choice there, justifying its
  default status on that platform.
- Practical implication: do not re-litigate "Desktop adopts the native
  render tree" without a new, concrete reason (e.g. a design change that
  drops the webview-based design spec entirely). Item 5 under "Next
  items" below is intentionally the lowest priority for this reason.

## Architecture
- **`src-tauri/`** (Rust): `main.rs`/`lib.rs` (app entry, Tauri builder),
  `app.rs` (window/app setup), `ffi.rs` (safe Rust wrapper over the C ABI —
  the trust/ownership boundary with `libmdviewer`), `docmodel.rs` (document
  state), `commands.rs` (Tauri `#[command]`s the frontend invokes — render,
  parse, filesystem, state), `uistate.rs` (persisted UI state: theme,
  layout, panel widths, open tabs, etc.).
- **`frontend/src/`** (TypeScript, no framework, Vite-built): `main.ts`
  (bootstrap), `titlebar.ts`, `rail.ts` (activity rail), `explorer.ts`
  (file tree), `search.ts` (full-text search panel), `tabs.ts`,
  `toolbar.ts`, `outline.ts` (scrollspy outline), `statusbar.ts`,
  `viewer.ts` (the sandboxed `<iframe>` viewer consuming rendered HTML),
  `welcome.ts`, `commandpalette.ts`, `preferences.ts`, `exportsheet.ts`,
  `appstate.ts`, `ipc.ts` (Tauri command bridge), `theme.ts`, `layout.ts`
  (also the shared overlay host every one of the four overlay modules
  renders into), `tokens.css`/`chrome.css`.
- Rendering path: Rust reads a file → calls `libmdviewer` via `ffi.rs` →
  HTML string → sent to frontend → loaded into a **sandboxed**
  `<iframe sandbox="allow-scripts">` with a strict per-document
  Content-Security-Policy injected on load (`viewer.ts`) blocking remote
  image/font/connect requests; external links are intercepted and opened
  via `tauri-plugin-opener` instead of silently failing.
- Design spec lives in `design/` — `design/README.md` is the exhaustive
  per-screen/per-component spec (titlebar, activity rail, sidebar,
  resize handles, tabs, doc toolbar, content area, status bar, outline,
  command palette, preferences, export sheet, welcome state) and
  `design/TOKENS.md` has the color/typography/spacing tokens. **Treat
  these as normative** — "only these colors may be used," per the file.
  `design/reference/MarkdownViewer.dc.html` is the interactive HTML
  prototype (source of truth for exact look, keep `support.js` beside it).

## Finished so far
Chronologically (see `git log --oneline`):
1. Tauri 2 scaffold — frameless window, Vite frontend boot.
2. Chrome shell — tokens, fonts, titlebar, activity rail, window controls.
3. Safe Rust FFI layer over pinned `libmdviewer` v0.5.0 (supply-chain
   pinned/verified).
4. Document model + render/parse/fs/state Tauri commands over the FFI.
5. Explorer, tabs, welcome screen, sandboxed document viewer.
6. Outline with scrollspy, doc toolbar, status bar, source view toggle.
7. Panel resize/collapse, Workbench↔Reader layout switch, theme
   persistence, keyboard shortcuts (⌘K/⌘B/⌘J).
8. Fixes: main-column growth, boot-flash guard, active-tab preservation on
   background-tab close, minimal window-control capability grants,
   missing-path surfacing from directory reads.
9. `libmdviewer` framework embedded directly into the macOS `.app` bundle
   (Frameworks dir, `@executable_path` rpath) — bundle runs standalone.
10. Pinned to libmdviewer 0.8.1; library-rendered code-block headers
    (language label + Copy button, via the library's `codeHeader` option).
11. Open-error surfacing, honest welcome-screen affordances, v1
    known-limitations documented in README.
12. Bumped pinned libmdviewer to v0.10.0 (from v0.8.1) — checksums
    re-verified against the release's published `SHA256SUMS`; no Rust or
    frontend code changes needed since the five ABI symbols this app uses
    are unchanged and append-only.
13. **Command palette (⌘K)**, **preferences panel (⚙)**, **export sheet
    (⇪)**, and a **full-text search panel** — the four previously-missing
    v1 screens. Preferences' Theme/Reading-width/Prose-typeface/Render-
    math-diagrams/Allow-raw-HTML rows are real, persisted, and (the last
    three) plumbed into new `render_document`/`export_document` FFI
    options; Window chrome stays Unified-only (inert — no native-chrome
    mode exists). Export sheet does Self-contained HTML/HTML fragment via
    a native save dialog + new `write_export_file` command, and PDF via a
    hidden print-iframe + the OS print dialog. Search is a new
    `search_workspace` Rust command (regex/case/whole-word) grepping the
    open folder's markdown/text files.
14. **v2 network gating for the document iframe** — every rendered
    document now gets a strict Content-Security-Policy (blocks remote
    image/font/connect requests; only embedded `data:`/`blob:` assets are
    allowed) injected before load, closing the external-links/images gap
    noted below. External links are intercepted and opened explicitly via
    `tauri-plugin-opener` instead of silently failing inside the sandbox.
15. **CHANGELOG.md** added (reconstructed from git history) and
    **`.github/workflows/{ci,release}.yml`** added — cross-platform CI
    (frontend build + Rust test/clippy on the three native host targets)
    and a release pipeline mirroring `MarkDownViewer`'s
    matrix/package/checksum/upload/aggregate-SHA256SUMS strategy across
    macOS (arm64 + x86_64 cross-build), Linux (amd64 + arm64), and Windows
    (amd64).
16. **Bumped pinned libmdviewer to v0.11.0** (from v0.10.0) — checksums
    re-verified against the release's published `SHA256SUMS`; no Rust or
    frontend code changes needed since the five ABI symbols this app uses
    are unchanged and append-only. Enabled the previously-gated
    `windows-arm64` release job now that the core library ships that
    native artifact — Rust's MSVC toolchain builds
    `aarch64-pc-windows-msvc` natively on the `windows-11-arm` hosted
    runner without the cgo/mingw toolchain gap the core library's Go
    build hit for the same target.
17. **Tagged and shipped the first real release, `v0.1.0`** — the
    release pipeline had never actually run end-to-end before this, and
    surfaced five bugs in one pass (all now fixed, see `CHANGELOG.md`):
    a missing `npm ci` before `cargo tauri build`; `bundle.icon` only
    listing the macOS `.icns` (breaking Linux/Windows packaging even
    though the full icon set already existed on disk); missing
    `xdg-utils` on the Linux arm64 runner; `tauri.windows.conf.json`'s
    `bundle.resources` hardcoded to the windows-amd64 vendor path
    (breaking the new windows-arm64 job); and a bare `zip -r` in the
    Package step, which doesn't exist on Windows Git Bash. All six
    targets (darwin-arm64/amd64, linux-amd64/arm64, windows-amd64/arm64)
    now build and package successfully.
## Known limitations (v1, per README)
- **Release binary embeds the dev vendor rpath** — harmless (bundle also
  resolves via `@executable_path/../Frameworks`) but not cleaned up.
- **Mermaid/KaTeX combined-render verification is structural, not a
  pixel-level screenshot pass.** A new Rust test
  (`render_document_combines_mermaid_and_katex_without_clobbering_either`
  in `commands.rs`) renders a document exercising both engines together
  through the exact same code path the packaged `.app`'s iframe consumes,
  and the release `.app`/`.dmg` bundle was built and launched successfully
  in this pass — but no screenshot/computer-use tooling was available to
  visually confirm on-screen pixels. A human (or an agent with screen
  capture) should still eyeball a real Mermaid+KaTeX document in the
  packaged app before tagging a release.
- **Export sheet's "Options" checklist** (heading anchors / print theme /
  page numbers / table of contents, per design §10) is not wired to real
  toggles — none of the current render pipeline's options map onto them
  1:1 yet. PDF export goes through the OS print dialog rather than
  programmatic PDF generation (no headless-rendering dependency pulled in
  for v1).
- **No `cargo fmt --check` in CI.** The pre-existing codebase isn't
  rustfmt-clean (verified locally), so adding the check now would fail on
  unrelated code; a project-wide `cargo fmt` pass is a reasonable
  separate follow-up before turning this on.

## Next items (proposed, not yet planned in detail)
1. Wire the export sheet's Options checklist to real render toggles where
   a corresponding library option exists.
2. A real pixel-level Mermaid/KaTeX visual pass on the packaged `.app`
   (see "Known limitations" above), and the same for the newly-enabled
   `windows-arm64` release job (unverified by an actual tagged release
   run as of this pass — the Rust/MSVC toolchain assumption should hold,
   but treat the first real `windows-arm64` release build as a smoke test).
3. Project-wide `cargo fmt` pass, then turn on a `fmt` CI job.
4. Track the core library toward native-render-tree adoption for
   Desktop — **deliberately deprioritized**; see "Architectural
   specialization" above for why this isn't expected to happen absent a
   design change away from the current HTML/webview spec.

## Build & run
```bash
scripts/fetch-libmdviewer.sh      # fetch + checksum-verify the vendored lib
cargo tauri dev                   # dev server + hot reload
cargo tauri build                 # release .app bundle
```
Prerequisites: Rust (stable), `npm`, `tauri-cli` (`cargo install tauri-cli --version "^2"`).
Frontend-only build check: `cd frontend && npm run build` (runs `tsc --noEmit` then `vite build`).
