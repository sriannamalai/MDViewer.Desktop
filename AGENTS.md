# AGENTS.md — MDViewer.Desktop

Persistent project memory for agents. Update whenever architecture,
status, or roadmap materially changes.

## What this project is
A cross-platform (macOS/Windows/Linux) read-only Markdown viewer desktop
app: a **Tauri 2** shell (Rust backend + a small vanilla-TS/Vite frontend,
no framework) over `libmdviewer`, the C-ABI build of the
[MarkDownViewer](https://github.com/sriannamalai/markdownviewer) Go
library. Frameless window with fully custom-drawn chrome so the app looks
pixel-identical on every OS. 21 commits, version `0.2.0`, still pre-v1.

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

### Engine version sync checklist
Run this on every core library release (MarkDownViewer's own `AGENTS.md`
keeps the authoritative copy of this list — update both if it changes):
1. Check the library's `CHANGELOG.md` for the new `v<ver>` tag and what
   changed (new ABI symbols, options-JSON fields, breaking changes).
2. Bump the pinned version in `scripts/fetch-libmdviewer.sh` /
   `vendor/checksums.txt`, re-run the fetch script, and verify checksums
   against the release's published `SHA256SUMS`.
3. Confirm the ABI symbols this app uses are unchanged/append-only; if a
   new options-JSON field is relevant to Preferences/Export, wire it in.
4. Run `cargo test` and the frontend build (`cd frontend && npm run
   build`) to confirm the new pin doesn't regress anything.
5. Update this file's "Finished so far" section with what actually
   shipped on the Desktop side, and confirm the sibling repos' `AGENTS.md`
   files were updated too (Mobile's submodule pin + its own checklist;
   the library's "Finished so far").
Current pinned version: C ABI `libmdviewer` **v0.11.0**, HTML/webview
rendering only (no native render tree, by design — see above).

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
18. **Export sheet's "Options" checklist wired to the render pipeline**
    (`commands.rs`'s new `export_document` parameter, `ExportOptions`) —
    "Include heading anchors" maps straight to the library's own
    `headingAnchors` option (new `RenderOptions::heading_anchors` field in
    `ffi.rs`); "Print theme (light)" overrides the theme used for that
    export only, independent of the app's live theme; "Page numbers"
    appends a `@media print` `@page` margin-box CSS counter ("Page X of
    Y" — CSS Paged Media Level 3, Chromium 131+/Safari 18.2+); "Table of
    contents" builds a linked TOC from the document's heading outline
    (`docmodel::OutlineItem` grew an `anchor_id` field, sourced from the
    AST's `anchorId`) and splices it into the rendered output, forcing
    heading anchors on for that export regardless of the other toggle's
    state so its links always resolve.
19. **Release binary no longer embeds the dev vendor rpath** — `build.rs`
    now gates the `vendor/libmdviewer/<target>/` rpath (macOS/Linux) behind
    `PROFILE=debug` (cargo sets this for both `cargo build`/`cargo tauri
    dev` and `cargo test`, but not `--release`), so a `--release` binary's
    Mach-O/ELF only carries the relocatable `@executable_path/../Frameworks`
    (macOS) / `$ORIGIN` (Linux) rpath it actually needs once packaged.
    Verified with `otool -l` on a `cargo build --release` binary: the local
    vendor path is gone, the Frameworks rpath remains, and dev/test builds
    are unaffected (still resolve straight from the vendor dir).
20. **Project-wide `cargo fmt` pass**, plus a new `fmt` CI job
    (`.github/workflows/ci.yml`) running `cargo fmt --manifest-path
    src-tauri/Cargo.toml --check`. The pass was formatting-only (default
    rustfmt config, no `rustfmt.toml` needed — the default width/style
    didn't fight the existing manual formatting choices badly enough to
    warrant one); `cargo build`/`cargo test`/`cargo clippy` and the
    frontend build were all re-verified green afterward.
21. **Tagged and shipped `v0.2.0`** — bundles items 18–20 above (export
    Options checklist, the dev-rpath release fix, and the `cargo fmt`/CI
    pass). See `CHANGELOG.md` for the user-facing summary.
22. **Fixed Windows releases not launching at all** — `tauri.windows
    .conf.json`'s `bundle.resources` used a bare relative-path string
    (`"../vendor/libmdviewer/windows-amd64/libmdviewer.dll"`), which
    NSIS packaged by literally preserving the `../` traversal as an
    `_up_\vendor\...\` subfolder instead of placing the DLL next to
    `mdviewer-desktop.exe` — so every installed release immediately
    failed with "libmdviewer.dll was not found". Fixed by remapping the
    resource to a flat destination filename. Found and confirmed fixed
    via an actual install + launch on a real Windows 11 arm64 VM
    (Parallels on the dev machine) — the release pipeline had only ever
    verified that packaging *completed*, never that the installed app
    actually *ran*. Both windows-amd64 and windows-arm64 shared this
    bug (the arm64 job just does a string substitution on the same
    file), so this was a release-blocking regression on Windows since
    Windows support was first added, not something new to `v0.2.0`.
23. **Dropped `appimage` from Linux's `bundle.targets`**
    `v0.2.0` end-to-end for the first time surfaced `linuxdeploy`
    (Tauri's AppImage bundler, itself an AppImage) failing with `failed
    to run linuxdeploy` on both Linux release runners
    (`ubuntu-latest`/`ubuntu-24.04-arm`). Tried both documented
    workarounds — installing `libfuse2`/`libfuse2t64` and setting
    `APPIMAGE_EXTRACT_AND_RUN=1` — neither fixed it (a still-open
    upstream issue: Ubuntu 24.04 dropped `libfuse2`, and other projects
    hitting the same failure report the env var doesn't reliably
    propagate through Tauri's linuxdeploy invocation either).
    `tauri.conf.json`'s `bundle.targets` now lists `deb` only for
    Linux; `.deb` bundles without invoking `linuxdeploy` at all and
    covers the Debian/Ubuntu majority of the desktop Linux audience.
## Known limitations (v1, per README)
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
  page numbers / table of contents, per design §10) is wired into the
  render pipeline as of item 18 below (`commands.rs`'s `ExportOptions`).
  "Page numbers" relies on CSS Paged Media Level 3 margin-box support
  (Chromium 131+/Safari 18.2+, shipped late 2024) — an older bundled
  webview just omits the footer rather than erroring. PDF export still
  goes through the OS print dialog rather than programmatic PDF
  generation (no headless-rendering dependency pulled in for v1).
  Researched programmatic PDF export (issue #7): the native APIs exist
  (`WKWebView.createPDFWithConfiguration` on macOS 11+, confirmed working
  end-to-end against a standalone proof-of-concept using this project's
  own transitively-pinned `objc2`/`objc2-web-kit`/`block2` versions;
  `ICoreWebView2_7::PrintToPdf` on Windows; WebKitGTK's print-to-file path
  is still unresolved upstream as of `tauri-apps/wry#1317`, an open draft
  PR) but wiring it in isn't safe yet: this app's exported HTML renders
  Mermaid diagrams client-side via `mermaid.initialize({startOnLoad:true})`
  asynchronously *after* the page finishes loading, so the only cheap
  readiness signal (`WKWebView.isLoading` going `false`) fires before
  Mermaid has necessarily finished — a naive hidden-webview capture would
  race Mermaid and risk shipping PDFs with blank diagrams. A real fix
  needs a readiness signal injected into the exported HTML plus
  `WKWebView.evaluateJavaScript` polling, which is more new native surface
  than this pass could verify without GUI-automation tooling to confirm a
  real Mermaid document renders correctly in the output.
- **Linux release builds ship `.deb` only, not `.AppImage`** —
  `linuxdeploy` fails to run on the GitHub-hosted Linux release
  runners (see item 23 above, a still-open upstream Tauri/AppImage
  issue on Ubuntu 24.04); revisit once that bundler issue clears.

## Next items (proposed, not yet planned in detail)
1. A real pixel-level Mermaid/KaTeX visual pass on the packaged `.app`
   (macOS) and `.deb` (Linux) is still outstanding — **windows-arm64 is
   now done**: after fixing item 22's launch bug, a real Mermaid
   diagram (flowchart with a decision branch) and both inline and
   block KaTeX math were confirmed rendering correctly, with the
   app's own styling, on an actual Windows 11 arm64 VM (Parallels on
   the dev machine) — see issue #5's GitHub comment for the verified
   build and what was checked.
2. Programmatic PDF export (issue #7, macOS first): inject a
   Mermaid-rendering-complete signal into the exported HTML and poll it
   via `WKWebView.evaluateJavaScript` before calling `createPDF`, so the
   capture can't race the diagram rendering it needs to wait on — see
   "Known limitations" above for what was already validated.
3. Track the core library toward native-render-tree adoption for
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
