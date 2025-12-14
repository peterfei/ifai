mod ai;
mod file_walker;
mod terminal;
mod search;
mod git;
mod lsp;
mod rag; // Added rag module
use ai::Message;
use terminal::TerminalManager;
use lsp::LspManager;
use rag::RagState; // Added RagState

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
async fn ai_chat(app: tauri::AppHandle, api_key: String, messages: Vec<Message>, event_id: String) -> Result<(), String> {
    ai::stream_chat(app, api_key, messages, event_id).await
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(TerminalManager::new())
        .manage(LspManager::new())
        .manage(RagState::new()) // Added RagState management
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            greet, 
            ai_chat, 
            ai::ai_completion,
            file_walker::get_all_file_paths,
            terminal::create_pty,
            terminal::write_pty,
            terminal::resize_pty,
            terminal::kill_pty,
            search::search_in_files,
            git::get_git_statuses,
            lsp::start_lsp,
            lsp::send_lsp_message,
            lsp::kill_lsp,
            rag::init_rag_index, // Added command
            rag::search_semantic // Added command
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
