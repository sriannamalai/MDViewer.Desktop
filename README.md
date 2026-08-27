# MDViewer.Desktop
Cross-platform Desktop Application written in Rust for viewing MarkDown files using the modern MarkDownViewer built by Sri.

## Design

The complete UI design for this app lives in [`design/`](design/):

- [`design/README.md`](design/README.md) — full design specification: every screen, component, measurement, interaction and state
- [`design/TOKENS.md`](design/TOKENS.md) — color tokens (light + dark), typography and spacing scales
- [`design/assets/`](design/assets/) — app icon SVGs
- [`design/reference/`](design/reference/) — the interactive HTML design prototype (open `MarkdownViewer.dc.html` in a browser)

The design targets a **frameless window with a custom-drawn titlebar** so the app looks identical on macOS, Windows and Linux. Implementation agents: start with `design/README.md`.

## Build

The app is a Tauri 2 shell (Rust + a small TypeScript frontend) over
[`libmdviewer`](vendor/libmdviewer/darwin-arm64/README.md), a prebuilt C-shared
library pinned at **v0.10.0** and vendored per-platform under `vendor/libmdviewer/`.

### Prerequisites

- Rust (stable) and `npm`
- `tauri-cli`: `cargo install tauri-cli --version "^2"`

### Fetch the vendored library

```
scripts/fetch-libmdviewer.sh
```

Downloads the pinned `libmdviewer` release for the host platform, verifies it
against `vendor/checksums.txt`, and (on macOS) rewrites the dylib's install
name to `@rpath/libmdviewer.dylib`. Re-run for a different target by passing
it explicitly, e.g. `scripts/fetch-libmdviewer.sh darwin-amd64`.

### Develop

```
cargo tauri dev
```

Runs the frontend dev server and the Tauri shell with hot reload. `build.rs`
links `libmdviewer` from `vendor/libmdviewer/<target>/` and adds an rpath to
that directory for dev/test binaries.

### Release build

```
cargo tauri build
```

Produces `src-tauri/target/release/bundle/macos/MarkDownViewer.app`, with
`libmdviewer.dylib` copied into `Contents/Frameworks` and resolved via the
`@executable_path/../Frameworks` rpath — the bundle runs standalone, no
separately installed library required.

## Known limitations (v1)

- **Bundle target is pinned to darwin-arm64.** `vendor/libmdviewer/` only
  vendors the arm64 dylib by default; building the `.app` on another
  target would embed the wrong-arch library. Multi-target bundling
  (fetching + packaging per-arch in CI) is deferred to CI work.
- **The release binary embeds the dev vendor rpath.** It's harmless (the
  bundle also resolves `libmdviewer` via `@executable_path/../Frameworks`
  and runs standalone), but cleaning the stale rpath out of the release
  binary itself is deferred.
- **Visual verification of the built `.app` bundle's mermaid/math
  rendering is on the pre-release checklist, not yet done for v1.**
  Rendering has been verified in the dev app (`cargo tauri dev`); the
  built bundle's launch and library linkage have been verified, but a
  visual pass on mermaid/KaTeX specifically inside the packaged `.app`
  still needs to happen before release.
- **External links and images inside documents load network content.**
  The sandboxed viewer (`<iframe sandbox="allow-scripts">`) doesn't block
  outbound requests a document's own HTML makes — e.g. a remote image or
  a tracking pixel. v2 will intercept/gate this; for v1, treat opened
  documents as trusted-ish content from disk, not fully sandboxed from
  the network.
