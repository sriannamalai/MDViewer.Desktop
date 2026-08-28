//! Tauri commands the frontend `invoke()`s. Thin glue over `ffi`,
//! `docmodel`, and the filesystem — no business logic lives here beyond
//! marshaling errors to `String` (the `Result<T, String>` boundary Tauri's
//! IPC expects) and building the plain-data response shapes.

use std::path::Path;
use std::time::UNIX_EPOCH;

use serde::Serialize;

use crate::docmodel::{self, DocModel};
use crate::ffi;

/// Design-token -> library `--md-*` variable mapping shipped by
/// `render_document`.
///
/// Verified against the library's own theme definitions
/// (`markdownviewer/theme/theme.go`, `Light()`/`Dark()` `Vars` maps) rather
/// than assumed: the library defines exactly `--md-bg`, `--md-fg`,
/// `--md-accent`, `--md-code-bg`, `--md-border`, `--md-quote-fg` as
/// overridable custom properties (`render/html/page.go`'s
/// `emitThemeOverrides` accepts any key matching `--[a-zA-Z0-9_-]+`, but
/// only keys the base stylesheet actually consumes have visible effect —
/// wrong keys are silently dropped). This module overrides two of them per
/// theme, sourcing the values from `design/TOKENS.md`:
///
/// | Design token         | Library var       | light               | dark                 |
/// |-----------------------|--------------------|----------------------|-----------------------|
/// | `bg` (window/content)  | `--md-bg`          | `#f7f6f3`            | `#131418`             |
/// | `code` (code block bg) | `--md-code-bg`     | `#f4f2ee`            | `#1e2126`              |
///
/// (`--md-fg`/`--md-accent`/`--md-border`/`--md-quote-fg` are left at the
/// library's own defaults for v1 — not part of this task's scope.)
fn theme_overrides(theme: &str) -> std::collections::BTreeMap<String, String> {
    let mut overrides = std::collections::BTreeMap::new();
    match theme {
        "dark" => {
            overrides.insert("--md-bg".into(), "#131418".into());
            overrides.insert("--md-code-bg".into(), "#1e2126".into());
        }
        _ => {
            overrides.insert("--md-bg".into(), "#f7f6f3".into());
            overrides.insert("--md-code-bg".into(), "#f4f2ee".into());
        }
    }
    overrides
}

/// Preferences panel toggles (design §9) that affect how a document is
/// rendered — plumbed straight into `ffi::RenderOptions`. Defaults
/// (`#[serde(default)]`) match the library's own so older frontend builds
/// (or a stale persisted-state blob missing the `prefs` object) invoking
/// this command without the field still render exactly as before.
#[derive(Debug, Clone, serde::Deserialize)]
#[serde(default)]
pub struct RenderPrefs {
    pub mermaid: bool,
    pub math: bool,
    pub allow_raw_html: bool,
    /// "sans" (library default, omitted) or "serif" — anything else is
    /// treated as "sans".
    pub prose_typeface: String,
}

impl Default for RenderPrefs {
    fn default() -> Self {
        RenderPrefs { mermaid: true, math: true, allow_raw_html: false, prose_typeface: String::new() }
    }
}

/// CSS appended after the library's base stylesheet (`extraCss`) to swap
/// the prose typeface to the bundled serif font — `!important` because it
/// must win over the base stylesheet's own font-family rule regardless of
/// that rule's selector specificity.
fn typeface_extra_css(prose_typeface: &str) -> Option<String> {
    if prose_typeface == "serif" {
        Some("body.markdown-body{font-family:'Source Serif 4',Georgia,serif !important;}".to_string())
    } else {
        None
    }
}

#[tauri::command]
pub fn render_document(markdown: String, theme: String, prefs: Option<RenderPrefs>) -> Result<String, String> {
    let overrides = theme_overrides(&theme);
    let prefs = prefs.unwrap_or_default();
    // `code_header` is always on: design/README.md §7 specifies code blocks
    // with a header row (uppercase language + Copy affordance), which the
    // library renders itself since v0.8.
    let opts = ffi::RenderOptions {
        theme,
        source_map: true,
        code_header: true,
        theme_overrides: overrides,
        mermaid: prefs.mermaid,
        math: prefs.math,
        allow_raw_html: prefs.allow_raw_html,
        extra_css: typeface_extra_css(&prefs.prose_typeface),
        ..Default::default()
    };
    ffi::render(&markdown, &opts).map_err(|e| e.to_string())
}

/// Export sheet (design §10) — same render path as `render_document`, but
/// with `fragment` controllable ("Self-contained HTML" needs the full
/// page; "HTML fragment" needs body-only markup so a host page's own
/// styles apply) and always full fidelity (math/mermaid/raw-HTML follow
/// the same live preferences the on-screen preview used, via `prefs`, so
/// an exported file matches what the user was actually looking at).
#[tauri::command]
pub fn export_document(
    markdown: String,
    theme: String,
    fragment: bool,
    prefs: Option<RenderPrefs>,
) -> Result<String, String> {
    let overrides = theme_overrides(&theme);
    let prefs = prefs.unwrap_or_default();
    let opts = ffi::RenderOptions {
        theme,
        source_map: false,
        code_header: true,
        theme_overrides: overrides,
        mermaid: prefs.mermaid,
        math: prefs.math,
        allow_raw_html: prefs.allow_raw_html,
        fragment,
        extra_css: typeface_extra_css(&prefs.prose_typeface),
    };
    ffi::render(&markdown, &opts).map_err(|e| e.to_string())
}

/// Writes `contents` verbatim to `path` — the export sheet's "Export"
/// button, after the user picks a destination via the native save dialog
/// on the frontend. A thin wrapper (no format-specific logic here) since
/// `export_document`/the print-to-PDF flow already produced final bytes.
#[tauri::command]
pub fn write_export_file(path: String, contents: String) -> Result<(), String> {
    std::fs::write(&path, contents).map_err(|e| format!("{path}: {e}"))
}

#[tauri::command]
pub fn parse_document(markdown: String) -> Result<DocModel, String> {
    let ast = ffi::parse(&markdown).map_err(|e| e.to_string())?;
    docmodel::analyze(&ast).map_err(|e| e.to_string())
}

#[derive(Debug, Clone, Serialize)]
pub struct DocFile {
    pub content: String,
    pub lines: u32,
    pub bytes: u64,
    pub modified_ms: u64,
}

#[tauri::command]
pub fn read_document(path: String) -> Result<DocFile, String> {
    let content = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let metadata = std::fs::metadata(&path).map_err(|e| e.to_string())?;
    let modified_ms = metadata
        .modified()
        .map_err(|e| e.to_string())?
        .duration_since(UNIX_EPOCH)
        .map_err(|e| e.to_string())?
        .as_millis() as u64;
    Ok(DocFile {
        lines: content.lines().count() as u32,
        bytes: metadata.len(),
        content,
        modified_ms,
    })
}

#[derive(Debug, Clone, Serialize)]
pub struct TreeNode {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub is_markdown: bool,
    pub children: Vec<TreeNode>,
}

/// `.md`/`.markdown`, case-insensitive.
fn is_markdown_file(name: &str) -> bool {
    let lower = name.to_ascii_lowercase();
    lower.ends_with(".md") || lower.ends_with(".markdown")
}

/// `name` is a dotfile/dot-directory (`.git`, `.DS_Store`, ...) — skipped
/// entirely from the tree.
fn is_dotfile(name: &str) -> bool {
    name.starts_with('.')
}

#[tauri::command]
pub fn read_dir_tree(path: String, depth: u8) -> Result<TreeNode, String> {
    // `build_tree` itself uses `Path::is_dir()`, which is false for a
    // missing path just as much as for a regular file — left unguarded,
    // a nonexistent/unreadable root would silently come back as a valid
    // empty-leaf TreeNode instead of an error. Stat the root explicitly
    // first so a bad path surfaces as `Err` (with the path in the
    // message) rather than a misleading success. Entries discovered by
    // the recursion below the root came from `read_dir`, so they're
    // known to exist and don't need this check repeated.
    std::fs::symlink_metadata(&path).map_err(|e| format!("{path}: {e}"))?;
    build_tree(Path::new(&path), depth).map_err(|e| e.to_string())
}

/// Builds one `TreeNode` for `path`. `depth` is the number of further
/// levels still allowed to descend: at `depth == 0` the node itself is
/// still returned (name/path/is_dir/is_markdown), but directories report
/// no children — the recursion stops before listing them.
///
/// Symlinked directories are followed as if they were real subtrees;
/// `depth` bounds the recursion so a symlink cycle can't hang, but a
/// cycle within the depth limit can still duplicate the same content
/// under different paths.
fn build_tree(path: &Path, depth: u8) -> std::io::Result<TreeNode> {
    let name = path
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_else(|| path.to_string_lossy().into_owned());
    let is_dir = path.is_dir();
    let is_markdown = !is_dir && is_markdown_file(&name);

    let mut children = Vec::new();
    if is_dir && depth > 0 {
        let mut dirs = Vec::new();
        let mut files = Vec::new();
        for entry in std::fs::read_dir(path)? {
            let entry = entry?;
            let entry_name = entry.file_name().to_string_lossy().into_owned();
            if is_dotfile(&entry_name) {
                continue;
            }
            if entry.path().is_dir() {
                dirs.push(entry.path());
            } else {
                files.push(entry.path());
            }
        }
        let by_name = |a: &std::path::PathBuf, b: &std::path::PathBuf| {
            let an = a.file_name().unwrap_or_default().to_string_lossy().to_lowercase();
            let bn = b.file_name().unwrap_or_default().to_string_lossy().to_lowercase();
            an.cmp(&bn)
        };
        dirs.sort_by(by_name);
        files.sort_by(by_name);

        for child_path in dirs.into_iter().chain(files) {
            children.push(build_tree(&child_path, depth - 1)?);
        }
    }

    Ok(TreeNode { name, path: path.to_string_lossy().into_owned(), is_dir, is_markdown, children })
}

#[tauri::command]
pub fn library_version() -> String {
    ffi::version()
}

// ------------------------------------------------------------- Full-text search
// design/README.md §3 ("Search" sidebar panel) — a plain, dependency-light
// grep over the open folder's markdown/text files. Deliberately not
// index-backed (v1 scope): each search re-walks the tree and re-reads
// every candidate file, which is fine for the vault sizes this app
// targets and keeps the feature's whole footprint to this one command.

#[derive(Debug, Clone, Serialize)]
pub struct SearchMatch {
    pub path: String,
    pub line: u32,
    pub snippet: String,
    /// Char offsets (not byte offsets) into `snippet` bounding the match,
    /// for the frontend to highlight without re-running the regex itself.
    pub match_start: u32,
    pub match_end: u32,
}

#[derive(Debug, Clone, Serialize)]
pub struct SearchResult {
    pub matches: Vec<SearchMatch>,
    pub files_matched: u32,
    /// True if `matches` was cut short by `MAX_MATCHES` — lets the panel
    /// show "200+ results" instead of implying an exhaustive count.
    pub truncated: bool,
}

const MAX_MATCHES: usize = 200;

/// ".md"/".markdown"/".txt", case-insensitive — same candidate set the
/// Explorer's own file-open dialog offers (main.ts's `FILE_FILTERS`).
fn is_searchable_file(name: &str) -> bool {
    let lower = name.to_ascii_lowercase();
    lower.ends_with(".md") || lower.ends_with(".markdown") || lower.ends_with(".txt")
}

fn collect_searchable_files(dir: &Path, out: &mut Vec<std::path::PathBuf>) {
    let Ok(entries) = std::fs::read_dir(dir) else { return };
    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().into_owned();
        if is_dotfile(&name) {
            continue;
        }
        let path = entry.path();
        if path.is_dir() {
            collect_searchable_files(&path, out);
        } else if is_searchable_file(&name) {
            out.push(path);
        }
    }
}

fn build_matcher(query: &str, case_sensitive: bool, whole_word: bool, regex_mode: bool) -> Result<regex::Regex, String> {
    let pattern = if regex_mode { query.to_string() } else { regex::escape(query) };
    let pattern = if whole_word { format!(r"\b(?:{pattern})\b") } else { pattern };
    regex::RegexBuilder::new(&pattern)
        .case_insensitive(!case_sensitive)
        .build()
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn search_workspace(
    root: String,
    query: String,
    case_sensitive: bool,
    whole_word: bool,
    regex_mode: bool,
) -> Result<SearchResult, String> {
    if query.is_empty() {
        return Ok(SearchResult { matches: Vec::new(), files_matched: 0, truncated: false });
    }
    let matcher = build_matcher(&query, case_sensitive, whole_word, regex_mode)?;

    let mut files = Vec::new();
    collect_searchable_files(Path::new(&root), &mut files);
    files.sort();

    let mut matches = Vec::new();
    let mut files_matched = 0u32;
    let mut truncated = false;
    'files: for file in files {
        let Ok(content) = std::fs::read_to_string(&file) else { continue };
        let mut file_had_match = false;
        for (i, line) in content.lines().enumerate() {
            let Some(m) = matcher.find(line) else { continue };
            file_had_match = true;
            matches.push(SearchMatch {
                path: file.to_string_lossy().into_owned(),
                line: (i + 1) as u32,
                snippet: line.to_string(),
                match_start: line[..m.start()].chars().count() as u32,
                match_end: line[..m.end()].chars().count() as u32,
            });
            if matches.len() >= MAX_MATCHES {
                truncated = true;
                if file_had_match {
                    files_matched += 1;
                }
                break 'files;
            }
        }
        if file_had_match {
            files_matched += 1;
        }
    }

    Ok(SearchResult { matches, files_matched, truncated })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn render_document_dark_theme_applies_design_token_overrides() {
        let html = render_document("# T\n".into(), "dark".into(), None).unwrap();
        // Guards against silently-dropped override keys: assert the
        // overridden *value* actually landed in the output, not just that
        // the call succeeded.
        assert!(html.contains("#131418"), "missing dark bg override: {html}");
        assert!(html.contains("#1e2126"), "missing dark code-bg override: {html}");
    }

    #[test]
    fn render_document_light_theme_applies_design_token_overrides() {
        let html = render_document("# T\n".into(), "light".into(), None).unwrap();
        assert!(html.contains("#f7f6f3"), "missing light bg override: {html}");
        assert!(html.contains("#f4f2ee"), "missing light code-bg override: {html}");
    }

    #[test]
    fn render_document_emits_code_block_header() {
        // design/README.md §7: code blocks carry a header row (language +
        // Copy affordance). Rendered by the library since v0.8; this app
        // requests it unconditionally.
        let html = render_document("```go\nfmt.Println(1)\n```\n".into(), "light".into(), None).unwrap();
        assert!(html.contains("md-code-header"), "missing code header: {html}");
        assert!(html.contains("md-code-lang"), "missing language label: {html}");
        assert!(html.contains("md-code-copy"), "missing Copy affordance: {html}");
    }

    #[test]
    fn render_document_disables_mermaid_and_math_via_prefs() {
        let prefs = RenderPrefs { mermaid: false, math: false, ..Default::default() };
        let html = render_document("# T\n\n$x$\n".into(), "light".into(), Some(prefs)).unwrap();
        // With math disabled the library falls back to a plain code shape
        // instead of a KaTeX span — assert the KaTeX runtime itself isn't
        // embedded rather than asserting on inner markup we don't own.
        assert!(!html.contains("katex.render"), "expected KaTeX to be skipped: {html}");
    }

    #[test]
    fn render_document_serif_typeface_appends_extra_css() {
        let prefs = RenderPrefs { prose_typeface: "serif".into(), ..Default::default() };
        let html = render_document("# T\n".into(), "light".into(), Some(prefs)).unwrap();
        assert!(html.contains("Source Serif 4"), "missing serif typeface override: {html}");
    }

    /// Visual-verification proxy for the packaged `.app`'s Mermaid/KaTeX
    /// rendering (AGENTS.md known limitation): this test runs the exact
    /// same `render_document` → `ffi::render` → packaged-`libmdviewer`
    /// path the .app's iframe consumes, with a document exercising both
    /// engines together (a prior pixel-level pass only checked dev-mode
    /// rendering and bundle launch/linkage separately). It can't replace
    /// an actual eyeballed screenshot of the bundled app, but it does
    /// confirm both engines' script/init markup survive being combined in
    /// one render pass — the thing most likely to break if either
    /// changed independently.
    #[test]
    fn render_document_combines_mermaid_and_katex_without_clobbering_either() {
        let markdown = "# Diagram + math\n\n```mermaid\ngraph TD; A-->B;\n```\n\nInline $x^2$ and:\n\n$$\ny = x^2\n$$\n";
        let html = render_document(markdown.into(), "light".into(), None).unwrap();

        assert!(html.contains("class=\"mermaid\"") || html.contains("graph TD"), "mermaid block missing: {html}");
        assert!(html.contains("mermaid.initialize"), "mermaid runtime not wired: {html}");
        assert!(html.contains("katex.render"), "KaTeX runtime not wired: {html}");
        assert!(html.contains("class=\"math"), "math node missing: {html}");
        // Both engines' inline <script> bundles must appear intact and in
        // document order, not truncated/interleaved by the other's output.
        let mermaid_idx = html.find("mermaid.initialize").unwrap();
        let katex_idx = html.find("katex.render").unwrap();
        assert!(mermaid_idx < katex_idx, "expected mermaid init before katex render in document order");
    }

    #[test]
    fn export_document_fragment_omits_html_wrapper() {
        let full = export_document("# T\n".into(), "light".into(), false, None).unwrap();
        let fragment = export_document("# T\n".into(), "light".into(), true, None).unwrap();
        assert!(full.contains("<html"), "expected a full page: {full}");
        assert!(!fragment.contains("<html"), "expected body-only markup: {fragment}");
        assert!(fragment.contains("<h1"), "expected the heading to still render: {fragment}");
    }

    #[test]
    fn write_export_file_round_trips_contents() {
        let dir = std::env::temp_dir().join(format!(
            "mdviewer-commands-export-test-{}",
            std::time::SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos()
        ));
        std::fs::create_dir_all(&dir).unwrap();
        let file = dir.join("out.html");

        write_export_file(file.to_string_lossy().into_owned(), "<p>hi</p>".into()).unwrap();

        assert_eq!(std::fs::read_to_string(&file).unwrap(), "<p>hi</p>");
    }

    #[test]
    fn search_workspace_finds_matches_across_files_case_insensitively() {
        let dir = std::env::temp_dir().join(format!(
            "mdviewer-commands-search-test-{}",
            std::time::SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos()
        ));
        std::fs::create_dir_all(dir.join("sub")).unwrap();
        std::fs::write(dir.join("a.md"), "first line\nsecond RESOLVER line\n").unwrap();
        std::fs::write(dir.join("sub").join("b.md"), "a resolver reference\n").unwrap();
        std::fs::write(dir.join("skip.png"), "resolver").unwrap();

        let result = search_workspace(dir.to_string_lossy().into_owned(), "resolver".into(), false, false, false).unwrap();

        assert_eq!(result.files_matched, 2);
        assert_eq!(result.matches.len(), 2);
        assert!(!result.truncated);
        let a_match = result.matches.iter().find(|m| m.path.ends_with("a.md")).unwrap();
        assert_eq!(a_match.line, 2);
    }

    #[test]
    fn search_workspace_case_sensitive_excludes_different_case() {
        let dir = std::env::temp_dir().join(format!(
            "mdviewer-commands-search-cs-test-{}",
            std::time::SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos()
        ));
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join("a.md"), "Resolver\n").unwrap();

        let result = search_workspace(dir.to_string_lossy().into_owned(), "resolver".into(), true, false, false).unwrap();

        assert_eq!(result.matches.len(), 0);
    }

    #[test]
    fn search_workspace_whole_word_excludes_substring_matches() {
        let dir = std::env::temp_dir().join(format!(
            "mdviewer-commands-search-ww-test-{}",
            std::time::SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos()
        ));
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join("a.md"), "prerender rendering render\n").unwrap();

        let result = search_workspace(dir.to_string_lossy().into_owned(), "render".into(), false, true, false).unwrap();

        assert_eq!(result.matches.len(), 1, "expected only the standalone word to match: {:?}", result.matches);
    }

    #[test]
    fn parse_document_returns_doc_model() {
        let model = parse_document("# Head\n\nsome text\n".into()).unwrap();
        assert_eq!(model.outline.len(), 1);
        assert_eq!(model.outline[0].text, "Head");
        assert!(model.words > 0);
        assert_eq!(model.read_minutes, 1);
    }

    #[test]
    fn library_version_matches_ffi() {
        assert_eq!(library_version(), ffi::version());
    }

    #[test]
    fn read_document_reports_content_lines_and_size() {
        let dir = std::env::temp_dir().join(format!(
            "mdviewer-commands-test-{}",
            std::time::SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir_all(&dir).unwrap();
        let file = dir.join("doc.md");
        std::fs::write(&file, "line one\nline two\n").unwrap();

        let doc = read_document(file.to_string_lossy().into_owned()).unwrap();

        assert_eq!(doc.content, "line one\nline two\n");
        assert_eq!(doc.lines, 2);
        assert_eq!(doc.bytes, 18);
        assert!(doc.modified_ms > 0);
    }

    #[test]
    fn read_dir_tree_orders_dirs_before_files_alphabetically_and_skips_dotfiles() {
        let dir = std::env::temp_dir().join(format!(
            "mdviewer-commands-tree-test-{}",
            std::time::SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir_all(dir.join("zeta")).unwrap();
        std::fs::create_dir_all(dir.join("alpha")).unwrap();
        std::fs::write(dir.join("beta.md"), "# hi\n").unwrap();
        std::fs::write(dir.join("gamma.txt"), "hi\n").unwrap();
        std::fs::write(dir.join(".hidden.md"), "# hi\n").unwrap();
        std::fs::create_dir_all(dir.join(".git")).unwrap();

        let tree = build_tree(&dir, 6).unwrap();

        assert!(tree.is_dir);
        let names: Vec<&str> = tree.children.iter().map(|c| c.name.as_str()).collect();
        assert_eq!(names, vec!["alpha", "zeta", "beta.md", "gamma.txt"]);

        let beta = tree.children.iter().find(|c| c.name == "beta.md").unwrap();
        assert!(beta.is_markdown);
        let gamma = tree.children.iter().find(|c| c.name == "gamma.txt").unwrap();
        assert!(!gamma.is_markdown);
    }

    #[test]
    fn read_dir_tree_depth_zero_returns_node_without_descending() {
        let dir = std::env::temp_dir().join(format!(
            "mdviewer-commands-depth0-test-{}",
            std::time::SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir_all(dir.join("child")).unwrap();

        let tree = build_tree(&dir, 0).unwrap();

        assert!(tree.is_dir);
        assert!(tree.children.is_empty());
    }

    #[test]
    fn read_dir_tree_nonexistent_root_is_an_error_not_an_empty_leaf() {
        let missing = std::env::temp_dir().join(format!(
            "mdviewer-commands-missing-test-{}",
            std::time::SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        assert!(!missing.exists());

        let path_str = missing.to_string_lossy().into_owned();
        let err = read_dir_tree(path_str.clone(), 6).unwrap_err();

        assert!(err.contains(&path_str), "error should name the bad path: {err}");
    }
}
