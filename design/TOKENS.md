# MDViewer.Desktop — design tokens

All values are defined as CSS custom properties in the reference prototype and should map to a theme struct/resource in the Rust implementation. **Only these colors may be used.**

## Color — light theme

| Token | Value | Use |
|---|---|---|
| `bg` | `#f7f6f3` | Window/content background |
| `panel` | `#ffffff` | Titlebar, sidebar, tab strip, status bar, overlay surfaces |
| `panel2` | `#f1efeb` | Hover fills, search field, segmented controls |
| `line` | `#e3dfd8` | Primary borders/separators |
| `line2` | `#eeebe5` | Subtle inner separators |
| `text` | `#1b1b1e` | Primary text |
| `text2` | `#6c6960` | Secondary text |
| `text3` | `#96928a` | Tertiary/labels/meta |
| `accent` | `#c1502e` | Brand accent: active states, links, primary buttons |
| `accentSoft` | `rgba(193,80,46,.10)` | Active-item fills |
| `accentLine` | `rgba(193,80,46,.35)` | Focused borders |
| `code` | `#f4f2ee` | Code block background |
| `ok` | `#2f7a4f` | Status-bar "sanitized" dot |
| `note` | `#2f6bbf` | Info callouts |
| `noteSoft` | `rgba(47,107,191,.09)` | Info callout fill |
| syntax `kw / str / com / fn / num` | `#9b2c6f / #2f7a4f / #9a958c / #2f6bbf / #a35a09` | Code highlighting |

## Color — dark theme

| Token | Value |
|---|---|
| `bg` | `#131418` |
| `panel` | `#1a1c21` |
| `panel2` | `#212429` |
| `line` | `#2c3037` |
| `line2` | `#23262b` |
| `text` | `#e9e7e2` |
| `text2` | `#9b988f` |
| `text3` | `#75726b` |
| `accent` | `#e97a52` |
| `accentSoft` | `rgba(233,122,82,.13)` |
| `accentLine` | `rgba(233,122,82,.4)` |
| `code` | `#1e2126` |
| `ok` | `#86d5a1` |
| `note` | `#83b4f0` |
| `noteSoft` | `rgba(131,180,240,.10)` |
| syntax `kw / str / com / fn / num` | `#e08bc0 / #86d5a1 / #6e6b65 / #83b4f0 / #e0a45e` |

Desk (behind the window, prototype only): `#0e0f11`. Window shadow: `0 40px 90px rgba(0,0,0,.55)` light / `.7` dark.

## Typography

| Role | Font | Size / weight | Notes |
|---|---|---|---|
| UI text | IBM Plex Sans | 12.5px / 400–600 | Everything chrome: tabs, sidebar, buttons |
| UI labels | IBM Plex Sans | 10.5px / 600 | UPPERCASE, letter-spacing .09em, `text3` |
| UI meta/mono | JetBrains Mono | 10.5–11.5px / 400–500 | Breadcrumbs, shortcuts, stats, file badges |
| Prose body | IBM Plex Sans | 14.5px / 400, line-height 1.72 | Rendered markdown paragraphs, lists |
| Prose H1 | Source Serif 4 | 34px / 700, ls −.02em, lh 1.15 | |
| Prose H2 | Source Serif 4 | 22px / 600, ls −.01em | 1px bottom border `line`, padding-bottom 7px, margin 42/12 |
| Prose H3 | Source Serif 4 | 17px / 600 | margin 28/8 |
| Code | JetBrains Mono | 12.5px, lh 1.65 | inline: `code` bg, 1px `line2` border, radius 4, padding 1×5 |

## Spacing & geometry

- Radii: window 12 · overlays 12 · code blocks/tables/callouts 8 · buttons/rows 6–8 · search pill 7 · badges 4–5
- Bar heights: titlebar 44 · sidebar/tab headers 38 · doc toolbar 36 · status bar 26
- Panel widths: activity rail 48 · sidebar 268 (min 190, max 460) · outline 236 (min 180, max 400)
- Window: min 1180×680, default 1440×900
- Content padding: workbench `44px 10% 120px` · reader `72px 10% 140px` (side margins are always 10% of the content viewport)
- Motion: panel collapse/resize & content reflow `0.22s cubic-bezier(.2,.7,.3,1)`; overlays fade+rise `0.16s` (`translateY(6px) scale(.985)` → none); veil fade `0.14s`; suppress width transitions while dragging a resize handle
