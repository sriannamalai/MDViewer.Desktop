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

#[tauri::command]
pub fn render_document(markdown: String, theme: String) -> Result<String, String> {
    let overrides = theme_overrides(&theme);
    let opts = ffi::RenderOptions { theme, source_map: true, theme_overrides: overrides };
    ffi::render(&markdown, &opts).map_err(|e| e.to_string())
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn render_document_dark_theme_applies_design_token_overrides() {
        let html = render_document("# T\n".into(), "dark".into()).unwrap();
        // Guards against silently-dropped override keys: assert the
        // overridden *value* actually landed in the output, not just that
        // the call succeeded.
        assert!(html.contains("#131418"), "missing dark bg override: {html}");
        assert!(html.contains("#1e2126"), "missing dark code-bg override: {html}");
    }

    #[test]
    fn render_document_light_theme_applies_design_token_overrides() {
        let html = render_document("# T\n".into(), "light".into()).unwrap();
        assert!(html.contains("#f7f6f3"), "missing light bg override: {html}");
        assert!(html.contains("#f4f2ee"), "missing light code-bg override: {html}");
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
