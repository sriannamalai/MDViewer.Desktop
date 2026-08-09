pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            crate::commands::render_document,
            crate::commands::parse_document,
            crate::commands::read_document,
            crate::commands::read_dir_tree,
            crate::commands::library_version,
            crate::uistate::load_ui_state,
            crate::uistate::save_ui_state,
        ])
        .run(tauri::generate_context!())
        .expect("error while running MarkDownViewer");
}
