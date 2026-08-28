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

## CI & releases

`.github/workflows/ci.yml` builds the frontend and runs `cargo test`/
`cargo clippy` on macOS/Linux/Windows for every push and pull request.
`.github/workflows/release.yml` builds and packages the app for macOS
(arm64 + x86_64), Linux (amd64 + arm64) and Windows (amd64) on every
published GitHub release, uploading a checksummed zip per target plus an
aggregated `SHA256SUMS`. See `AGENTS.md`'s "Known limitations" for the
current gaps in that pipeline (missing non-darwin checksums, no Windows
ARM64 target yet).

## Known limitations (v1)

- **`vendor/checksums.txt` only has verified entries for darwin-arm64 and
  darwin-amd64.** The release workflow's Linux/Windows jobs need
  `scripts/update-checksums.sh` run (from a machine with network access)
  to populate the rest before they can succeed.
- **No Windows ARM64 target yet.** `libmdviewer` itself doesn't publish a
  windows-arm64 native artifact — this is an upstream dependency, not
  something fixable from this repo alone.
- **The release binary embeds the dev vendor rpath.** It's harmless (the
  bundle also resolves `libmdviewer` via `@executable_path/../Frameworks`
  and runs standalone), but cleaning the stale rpath out of the release
  binary itself is deferred.
- **Mermaid/KaTeX rendering inside the packaged `.app` has been verified
  structurally** (a Rust test renders both together through the exact FFI
  path the bundle uses, and the packaged `.app`/`.dmg` launch
  successfully) **but not with an eyeballed screenshot** — a human (or an
  agent with screen-capture tooling) should still visually confirm a real
  Mermaid+KaTeX document before tagging a release.
- **Export sheet's "Options" checklist is not wired to real toggles yet**
  (heading anchors / print theme / page numbers / table of contents) —
  none of the current render pipeline's options map onto them 1:1.
- **External links and images inside documents** are now gated by a
  Content-Security-Policy injected into every rendered document (only
  embedded `data:`/`blob:` assets load; no remote requests), and external
  links open through the OS's default browser instead of silently
  failing inside the sandbox.
