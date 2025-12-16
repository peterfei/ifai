mod ai;
mod file_walker;
mod terminal;
mod search;
mod git;
mod lsp;
mod rag; // Added rag module
mod agent; // Added agent module
use ai::Message;
use ai::AIProviderConfig; // Import new AI types
use terminal::TerminalManager;
use lsp::LspManager;
use rag::RagState; // Added RagState

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
async fn ai_chat(
    app: tauri::AppHandle,
    provider_config: ai::AIProviderConfig,
    messages: Vec<ai::Message>,
    event_id: String,
    enable_tools: Option<bool>,
) -> Result<(), String> {
    ai::stream_chat(app, provider_config, messages, event_id, enable_tools.unwrap_or(true)).await
}

#[tauri::command]
async fn ai_completion(
    provider_config: ai::AIProviderConfig,
    messages: Vec<ai::Message>, // Updated to use ai::Message
) -> Result<String, String> {
    ai::complete_code(provider_config, messages).await
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
            ai_completion,
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
            rag::init_rag_index, 
            rag::search_semantic,
            rag::search_hybrid,
            rag::build_context,
            agent::agent_write_file, // Added commands
            agent::agent_read_file,
            agent::agent_list_dir
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
