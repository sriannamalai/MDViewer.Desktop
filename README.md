# MDViewer.Desktop

Cross-platform Desktop Application written in Rust for viewing MarkDown files using the modern MarkDownViewer built by Sri.

## Design

The complete UI design for this app lives in [`design/`](design/):

- [`design/README.md`](design/README.md) — full design specification: every screen, component, measurement, interaction and state
- [`design/TOKENS.md`](design/TOKENS.md) — color tokens (light + dark), typography and spacing scales
- [`design/assets/`](design/assets/) — app icon SVGs
- [`design/reference/`](design/reference/) — the interactive HTML design prototype (open `MarkdownViewer.dc.html` in a browser)

The design targets a **frameless window with a custom-drawn titlebar** so the app looks identical on macOS, Windows and Linux. Implementation agents: start with `design/README.md`.
