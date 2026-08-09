//! Persisted, opaque UI-state JSON blob. The frontend owns the schema; this
//! module only reads/writes a single file, `ui-state.json`, inside the
//! Tauri app-config directory.

use std::io;
use std::path::Path;

use tauri::Manager;

const FILE_NAME: &str = "ui-state.json";

/// Default blob handed back when no state has been saved yet.
const EMPTY_STATE: &str = "{}";

/// Writes `json` verbatim to `dir/ui-state.json`, creating `dir` (and any
/// missing ancestors) first.
pub fn save_to(dir: &Path, json: &str) -> io::Result<()> {
    std::fs::create_dir_all(dir)?;
    std::fs::write(dir.join(FILE_NAME), json)
}

/// Reads the blob from `dir/ui-state.json`. A missing file is not an error
/// — first launch has no saved state yet — and yields `"{}"`.
pub fn load_from(dir: &Path) -> io::Result<String> {
    match std::fs::read_to_string(dir.join(FILE_NAME)) {
        Ok(contents) => Ok(contents),
        Err(e) if e.kind() == io::ErrorKind::NotFound => Ok(EMPTY_STATE.to_string()),
        Err(e) => Err(e),
    }
}

#[tauri::command]
pub fn load_ui_state(app: tauri::AppHandle) -> Result<String, String> {
    let dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    load_from(&dir).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn save_ui_state(app: tauri::AppHandle, json: String) -> Result<(), String> {
    let dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    save_to(&dir, &json).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    /// A fresh, never-before-used scratch directory per test (no shared
    /// fixture, no cleanup dependency between tests).
    fn scratch_dir(tag: &str) -> std::path::PathBuf {
        let nanos = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos();
        std::env::temp_dir().join(format!("mdviewer-uistate-test-{tag}-{nanos}"))
    }

    #[test]
    fn load_from_missing_file_returns_empty_object() {
        let dir = scratch_dir("missing");
        // Deliberately never created.
        assert_eq!(load_from(&dir).unwrap(), "{}");
    }

    #[test]
    fn save_then_load_round_trips_exact_json() {
        let dir = scratch_dir("roundtrip");
        let payload = r#"{"sidebarWidth":268,"theme":"dark"}"#;

        save_to(&dir, payload).unwrap();
        let loaded = load_from(&dir).unwrap();

        assert_eq!(loaded, payload);
    }

    #[test]
    fn save_creates_missing_ancestor_directories() {
        let dir = scratch_dir("nested").join("a").join("b").join("c");
        assert!(!dir.exists());

        save_to(&dir, "{}").unwrap();

        assert!(dir.join(FILE_NAME).exists());
    }

    #[test]
    fn save_overwrites_previous_contents() {
        let dir = scratch_dir("overwrite");
        save_to(&dir, r#"{"a":1}"#).unwrap();
        save_to(&dir, r#"{"a":2}"#).unwrap();

        assert_eq!(load_from(&dir).unwrap(), r#"{"a":2}"#);
    }
}
