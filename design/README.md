# Handoff: MDViewer.Desktop UI — "MarkDownViewer"

## Overview
A cross-platform, read-only Markdown viewer desktop app. The defining constraint: **the app looks pixel-identical on macOS, Windows and Linux**, achieved with a frameless window and fully custom-drawn chrome (titlebar, window controls, every panel). Two reading layouts (Workbench and Reader), light and dark themes, resizable/collapsible side panels, tabs, search, command palette, preferences and export.

## About the design files
`reference/MarkdownViewer.dc.html` (open in a browser; keep `support.js` beside it) is a **design reference built in HTML** — an interactive prototype showing intended look and behavior, not production code. The task is to **recreate this design in Rust** using the repo's chosen stack (e.g. Tauri + webview, Slint, egui/iced — implementer's choice; Tauri is the most direct fit since the prototype is HTML/CSS). All measurements below are CSS px at 1× scale.

## Fidelity
**High-fidelity.** Colors, typography, spacing and interactions are final. Recreate pixel-perfectly per this spec and `TOKENS.md`. Token names below refer to `TOKENS.md`.

## Window
- Frameless; app draws its own titlebar and min/max/close controls on every OS (a Preferences toggle "Window chrome: Unified/Native" exists; Unified is default and the designed state).
- Default 1440×900, minimum 1180×680. Corner radius 12 (where the OS compositor allows), 1px `line` border, drop shadow.
- Desk/background color behind the window in the prototype is presentation-only.

## Screens / Views

### 1. Titlebar (44px, `panel` bg, 1px `line` bottom border)
3-column grid `1fr auto 1fr`, padding 0 12–14px, gap 16. The whole bar is the drag region (except interactive children).
- **Left**: app icon (22×22 tile, radius 6, charcoal gradient `#2a2d34→#17181c` 150deg, inset 1px white @6% ring) carrying the bracket mark (`assets/icon.svg`); wordmark 12.5px/600: "MarkDown" in `text` + "Viewer" in `text3`/500; then platform hint 11.5px JetBrains Mono `text3`.
- **Center**: search pill 420×28, `panel2` bg, 1px `line` border (hover: `accentLine`), radius 7 — glyph + "Search files and headings" 12px `text3` + `⌘K` keycap (mono 10.5px, 1px `line` border, radius 4, padding 1×5). Click opens the command palette.
- **Right**: layout toggle (glyph + "Workbench"/"Reader" label, 26px tall, radius 6, hover `panel2`), theme toggle ☾/☀ (26×26), settings ⚙ (26×26), 1px divider, then min/max/close as 26×26 hover-`panel2` buttons — close hovers `#c1502e` with white glyph.

### 2. Activity rail (48px wide, `panel` bg, 1px `line` right border)
34×34 radius-8 icon buttons, 8px top padding, 2px gap: Files ▤, Search ⌕, Outline ☰; spacer; Export ⇪, Home ⌂ at bottom. Active button: `accentSoft` bg + `accent` icon; inactive `text3`, hover `panel2`. Clicking the active icon toggles the sidebar closed/open; clicking another switches panel and opens it.

### 3. Sidebar (default 268px, min 190, max 460, `panel` bg, 1px `line` right border)
Header 38px: uppercase panel title (10.5/600/.09em `text3`) left; meta count (mono 11 `text3`) + collapse button ⇤ (22×22, radius 5) right; 1px `line2` bottom border. Content by panel:
- **Explorer**: tree rows 12.5px, padding 5×8, radius 6, hover `panel2`; disclosure carets 9px `text3`; folders with 📁-style glyph; markdown files badged "M" (mono 10px `accent`), plain files "T" (`text3`); 14px indent per level. Active file: `accentSoft` bg, `accent` text, weight 500. Below the tree, a "Recent" section (uppercase label; rows of path + relative-time in mono, hover brightens).
- **Search**: query field 30px `panel2` with `accentLine` border and mono text + caret; filter chips (Aa, .*, Whole word) 10.5px pills — active chip `accentSoft`/`accent`, inactive 1px `line` border `text3`; result count line 11px `text3`; result cards padding 6×10 radius 7 (selected `accentSoft`, hover `panel2`) with filename + `L<line>` (mono) header and a mono 11px snippet where the match substring is highlighted `accentSoft`/`accent`.
- **Outline**: document title 11px `text3`, then the same outline tree as §6.

### 4. Resize handles (both sidebar seams)
5px hit area straddling the seam, `col-resize` cursor. Idle invisible; hover or drag shows a 2px `accent` bar. Drag resizes within min/max (width transitions suppressed while dragging); dragging ≥46px past the minimum collapses the panel; double-click resets to default width. Collapsed panels animate to 0 width (0.22s ease per TOKENS) and their handle disappears.

### 5. Main column
- **Tab strip** (38px, `panel` bg, 1px `line` bottom border): tabs min-width 150, padding 0 14, 1px `line` right borders; "M" badge + filename 12.5px + ✕. Active tab: `bg` fill, `text`/500, 2px `accent` inset top edge; inactive `text3` on `panel`. Trailing "+" button (34px wide).
- **Doc toolbar** (36px, `bg`, 1px `line2` bottom border, padding 0 20): breadcrumb `Repo / path / file.md` mono 11.5 `text3`; right side: doc stats ("207 lines · 7.82 KB") 11px `text3`, divider, then "Outline", "Source"/"Rendered", "Export" text buttons (11.5px, padding 3×8, radius 5, hover `panel2`; toggled state `accentSoft`+`accent` for Source, `panel2`+`text` for Outline-visible).
- **Content scroll area**: prose column centered, `width:100%`, padding `44px 10% 120px` (Workbench) / `72px 10% 140px` (Reader) — **side margins are always 10% of the content viewport at any window/panel size**; padding change animates 0.22s.
- **Status bar** (26px, `panel` bg, 1px `line` top border, mono 11px `text3`, gaps 14): left `● sanitized` (dot `ok`), "CommonMark + GFM", "KaTeX · mermaid embedded"; right: current section name, "UTF-8", "LF".

### 6. Outline column (right; default 236px, min 180, max 400, `bg`, 1px `line` left border)
Padding 22×20. "On this page" uppercase label + collapse ⇥ button. Outline items 12.5px, padding 4×10 radius 6, indent 13px per heading level; H1 weight 500 `text2`, deeper levels `text2`/`text3`; active section: `accent` text, weight 600, `accentSoft` fill. Footer (top-border `line2`, 26px above): Words / Read time / Modified rows — label `text3` 11.5px left, mono value `text2` right, 7px gaps. Scrolls internally when taller than the window.

### 7. Rendered markdown (the product itself — see prototype for exact look)
Typography per TOKENS. Specific elements:
- Badge row under H1: joined key/value pills, mono 10.5px — key cell `panel2`/`text2`, value cell `accent`/white, radius 4, 1px `line` border.
- Code blocks: header row (language uppercase mono 10.5 `text3` + "Copy" affordance 11px) with 1px `line2` underline, body 14×16 padding, radius 8, `code` bg, 1px `line` border; syntax colors per TOKENS.
- Tables: radius-8 1px-`line` wrapper; header row `panel2` with uppercase 11px/600 `text3` cells; 9×14 cell padding; first column `text`/500 nowrap, others `text2`; `line2` row separators.
- Callouts: radius 8, 13×16 padding, icon + uppercase 12px/600 title + 14px/1.65 body; warning = `accent`/`accentSoft` with ⚠, note = `note`/`noteSoft` with ⓘ.
- Inline code per TOKENS; links `accent`, underline on hover; lists 20px indent, 7px item gap.
- Math and mermaid render from embedded (offline) KaTeX/mermaid, displayed inside `code`-bg radius-8 blocks with a small mono caption.
- **Source view** (toolbar toggle): raw markdown as `pre-wrap` mono 13px/1.8 `text2`, no chrome.

### 8. Command palette (⌘K or search pill)
Veil `rgba(10,11,12,.45)` + 2px blur over the window, click to dismiss, 0.14s fade. Panel 560px wide, 110px from top, `panel` bg, 1px `line` border, radius 12, shadow `0 30px 70px rgba(0,0,0,.4)`, fade+rise 0.16s. Query row (accent glyph, 15px text, accent caret, `line2` underline); "Commands" section label; rows 9×12 radius 8 (icon 16px, label 13.5, right-aligned keycap) — selected row `accentSoft` with `accent` icon. Footer bar `panel2`: "↑↓ navigate · ↵ run · esc dismiss" 11px `text3`.

### 9. Preferences (⚙)
660px panel, 70px from top, same surface treatment. Title row "Preferences" (Source Serif 4 18/600) + ✕. Tab row: Appearance / Reading / Rendering / Security — active tab 2px `accent` underline. Rows: label 13.5 + hint 12 `text3` left, control right, `line2` separators, 15px vertical padding. Controls: segmented pills (`panel2` track, 1px `line` border, radius 7, 2px inner padding; active segment `panel` fill, small shadow, `text`; 12px labels) and toggles (38×22 radius-12 track — on `accent`, off `line` — 18px white knob). Designed rows: Theme (Light/Dark/Auto), Window chrome (Unified/Native), Reading width (Narrow/Medium/Wide), Prose typeface (Sans/Serif), Render math and diagrams (on), Allow raw HTML (off, security hint).

### 10. Export sheet (⇪ or toolbar)
900px panel, 60px from top. Header "Export README.md" + ✕. Left rail 280px (1px `line` right border): Format cards (PDF / Self-contained HTML / HTML fragment — radius 8, 1px border; selected `accentLine` border + `accentSoft` fill; title 13 + sub 11.5 `text3`), Options checklist (15px radius-4 boxes, checked `accent` with white ✓), then Cancel (outline) / Export (filled `accent`) buttons. Right: `bg` preview area with a white paper mock (light-theme render, page number footer).

### 11. Welcome / empty state (⌂)
720px panel, 90px from top, padding 52×56. App icon at 38px; "Nothing open yet" Source Serif 4 30/700; body 14.5 `text2` max-width 440 ("Drop a Markdown file anywhere in this window… Rendering happens locally — no file ever leaves your machine."); buttons "Open folder…" (filled `accent`) + "Open file…" (outlined); footer split in two columns over a `line2` top border: Recent (name + mono path rows) and Shortcuts (label + keycap rows).

## Interactions & behavior
- **Layout toggle**: Workbench ⇄ Reader. Reader collapses both side panels (0.22s) and widens prose (10% margins hold; vertical padding grows). Returning restores each panel's previous open/closed state and widths.
- **Panel state**: sidebar and outline are independently collapsible (header ⇤/⇥ buttons, rail click, toolbar "Outline" button) and resizable (§4). Persist widths + open state + theme + layout across sessions.
- **Keyboard**: ⌘K palette · ⌘B sidebar · ⌘J outline · Esc closes overlays. (⌘ = Ctrl on Windows/Linux.)
- **Tabs**: click to switch; ✕ closes; + opens file picker. Active doc drives breadcrumb, stats, outline and status bar.
- **Overlays**: veil click or Esc dismisses; content click doesn't propagate.
- **Hovers**: chrome buttons fill `panel2`; list rows fill `panel2`; close button fills `#c1502e`; resize handles show accent bar; link underline on hover. No hover scaling anywhere.
- **Outline**: click scrolls to heading; active section tracks scroll position (scrollspy) and shows in the status bar.

## State management
`theme` (light/dark) · `layout` (workbench/reader) · `sidebarOpen`, `outlineOpen` · `sidebarWidth`, `outlineWidth` · `activePanel` (files/search/outline) · `openTabs[]` + `activeTab` · `sourceView` (per tab) · `overlay` (none/palette/settings/export/welcome) · per-doc scroll position + active heading. File tree, search results and doc stats come from the host filesystem + renderer.

## Design tokens
See [`TOKENS.md`](TOKENS.md) — complete light/dark color tables, type scale, spacing, radii, motion.

## Assets
- `assets/icon.svg` — the bracket mark, transparent (titlebar, about, inline use)
- `assets/icon-tile.svg` — mark on its charcoal gradient tile (app icon; export to .icns/.ico/.png at 16–1024)
- Fonts: IBM Plex Sans (400/450/500/600), Source Serif 4 (400/600/700), JetBrains Mono (400/500) — all OFL/Google Fonts; **bundle them with the app**, never load from network.
- Icon glyphs in chrome are drawn (SVG paths/unicode in the prototype); use a consistent 1.7–2.2 stroke icon set in implementation.

## Screenshots
`screenshots/` — reference captures (the prototype is the source of truth):
01 workbench light (README) · 02 Design.md doc (tables/diagram/math) · 03 workbench dark · 04 reader dark (panels collapsed) · 05 command palette · 06 preferences · 07 export sheet · 08 welcome state.

## Files
- `reference/MarkdownViewer.dc.html` — the full interactive prototype (all screens, both themes, all overlays reachable)
- `reference/support.js` — runtime the prototype needs (keep beside the HTML; not part of the design)
