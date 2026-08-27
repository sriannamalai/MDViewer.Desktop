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
  v0.8.1** (see `scripts/fetch-libmdviewer.sh` and `vendor/checksums.txt`).
  That repo is already at v0.10.1 with a native render tree — this app
  does **not** consume the render tree yet; it renders HTML from the FFI
  into a sandboxed webview. Bumping the pin is a deliberate future step,
  not automatic.
- **`~/Developer/OpenSource/MDViewer.Mobile`** — the Flutter sibling app,
  same design identity (`design/TOKENS.md` here is byte-identical to that
  repo's copy — keep them in sync), same rendering engine, different
  platform and a more advanced (native render-tree) reader. Useful as a
  reference for how a design decision or FFI quirk was resolved there.

## Architecture
- **`src-tauri/`** (Rust): `main.rs`/`lib.rs` (app entry, Tauri builder),
  `app.rs` (window/app setup), `ffi.rs` (safe Rust wrapper over the C ABI —
  the trust/ownership boundary with `libmdviewer`), `docmodel.rs` (document
  state), `commands.rs` (Tauri `#[command]`s the frontend invokes — render,
  parse, filesystem, state), `uistate.rs` (persisted UI state: theme,
  layout, panel widths, open tabs, etc.).
- **`frontend/src/`** (TypeScript, no framework, Vite-built): `main.ts`
  (bootstrap), `titlebar.ts`, `rail.ts` (activity rail), `explorer.ts`
  (file tree), `tabs.ts`, `toolbar.ts`, `outline.ts` (scrollspy outline),
  `statusbar.ts`, `viewer.ts` (the sandboxed `<iframe>` viewer consuming
  rendered HTML), `welcome.ts`, `appstate.ts`, `ipc.ts` (Tauri command
  bridge), `theme.ts`, `layout.ts`, `tokens.css`/`chrome.css`.
- Rendering path: Rust reads a file → calls `libmdviewer` via `ffi.rs` →
  HTML string → sent to frontend → loaded into a **sandboxed**
  `<iframe sandbox="allow-scripts">` (not a full trust boundary against
  network requests a document's own HTML makes — see Known limitations).
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

Not yet built (present in the design spec but no commit history found
implementing them yet): command palette (⌘K), preferences panel (⚙),
export sheet (⇪ → PDF/HTML), and full-text search panel — check current
frontend source before assuming absence, since this file may lag reality.

## Known limitations (v1, per README)
- **Bundle target pinned to darwin-arm64** — `vendor/libmdviewer/` only
  vendors the arm64 dylib by default; multi-target bundling (fetch+package
  per-arch in CI) is deferred CI work.
- **Release binary embeds the dev vendor rpath** — harmless (bundle also
  resolves via `@executable_path/../Frameworks`) but not cleaned up.
- **Mermaid/math rendering inside the packaged `.app` bundle** has not had
  a dedicated visual verification pass yet (dev-mode rendering and bundle
  launch/linkage have been verified separately).
- **External links/images in documents load network content** — the
  sandboxed iframe doesn't block outbound requests a document's own HTML
  makes. v2 will intercept/gate this; for now, treat opened documents as
  trusted-ish disk content, not network-sandboxed.

## Next items (proposed, not yet planned in detail)
Roughly in priority order based on the design spec vs. what's built and the
README's own v1→v2 notes:
1. Command palette, preferences panel, export sheet, full-text search —
   the remaining designed screens (verify against current `frontend/src`
   before starting, in case they've since landed).
2. Multi-arch bundling (Windows/Linux/x86_64 macOS) in CI, replacing the
   darwin-arm64-only pin.
3. Visual verification pass on the packaged `.app`'s mermaid/KaTeX
   rendering before any release tag.
4. v2: network request gating/interception inside the document iframe
   sandbox (the external-links/images limitation above).
5. Track the core library toward v0.10.x/native-render-tree adoption —
   evaluate whether switching from HTML+iframe to the render tree (as
   Mobile now does) is worth it here too, once the design supports a
   non-webview rendering path (currently the design spec assumes HTML/CSS
   in a webview, so this would be a bigger architectural shift).

## Build & run
```bash
scripts/fetch-libmdviewer.sh      # fetch + checksum-verify the vendored lib
cargo tauri dev                   # dev server + hot reload
cargo tauri build                 # release .app bundle
```
Prerequisites: Rust (stable), `npm`, `tauri-cli` (`cargo install tauri-cli --version "^2"`).
Frontend-only build check: `cd frontend && npm run build` (runs `tsc --noEmit` then `vite build`).
