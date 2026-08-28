pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        // Explicit, gated escape hatch for external links inside the
        // sandboxed document iframe (see viewer.ts's postMessage bridge) —
        // the iframe sandbox itself has no allow-top-navigation/allow-popups,
        // so this is the only way an external link can ever be opened, and
        // only in response to a real click the user made.
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            crate::commands::render_document,
            crate::commands::export_document,
            crate::commands::write_export_file,
            crate::commands::parse_document,
            crate::commands::read_document,
            crate::commands::read_dir_tree,
            crate::commands::search_workspace,
            crate::commands::library_version,
            crate::uistate::load_ui_state,
            crate::uistate::save_ui_state,
        ])
        .run(tauri::generate_context!())
        .expect("error while running MarkDownViewer");
}
