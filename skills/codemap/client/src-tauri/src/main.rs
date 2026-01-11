// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod storage;
mod codemap_v2;
mod codemap_meta;
mod executor;
mod code_browser;

use commands::*;
use executor::*;
use code_browser::*;

fn main() {
    tauri::Builder::default()
        .manage(CodeBrowserState::default())
        .invoke_handler(tauri::generate_handler![
            save_codemap,
            list_codemaps,
            load_codemap,
            delete_codemap,
            update_codemap_meta,
            export_codemap,
            import_codemap,
            get_project_structure,
            read_file_content,
            generate_codemap_with_pi,
            execute_command,
            check_tmux,
            get_project_root,
            set_root_dir,
            list_dir,
            read_file,
            get_root_dir
        ])
        .setup(|_app| {
            // Storage will be initialized per project directory
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}