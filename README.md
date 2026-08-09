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
library pinned at **v0.5.0** and vendored per-platform under `vendor/libmdviewer/`.

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
