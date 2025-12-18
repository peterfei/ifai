use tauri::Emitter;
use ifainew_core;

mod file_walker;
mod terminal;
mod search;
mod git;
mod lsp;
use terminal::TerminalManager;
use lsp::LspManager;

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
async fn ai_chat(
    app: tauri::AppHandle,
    provider_config: ifainew_core::ai::AIProviderConfig,
    messages: Vec<ifainew_core::ai::Message>,
    event_id: String,
    enable_tools: Option<bool>,
) -> Result<(), String> {
    ifainew_core::ai::stream_chat(app, provider_config, messages, event_id, enable_tools.unwrap_or(true)).await
}

#[tauri::command]
async fn ai_completion(
    provider_config: ifainew_core::ai::AIProviderConfig,
    messages: Vec<ifainew_core::ai::Message>,
) -> Result<String, String> {
    ifainew_core::ai::complete_code(provider_config, messages).await
}

#[tauri::command]
async fn create_window(app: tauri::AppHandle, label: String, title: String, url: String) -> Result<(), String> {
    let window_builder = tauri::WebviewWindowBuilder::new(&app, label, tauri::WebviewUrl::App(url.into()))
        .title(title)
        .inner_size(1000.0, 800.0);
    
    match window_builder.build() {
        Ok(_) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(TerminalManager::new())
        .manage(LspManager::new())
                .on_window_event(|window, event| {
                    match event {
                        tauri::WindowEvent::DragDrop(tauri::DragDropEvent::Drop { paths, .. }) => {
                            let _ = window.emit("tauri://file-drop", paths.clone());
                        }
                        _ => {}
                    }
                })
        .manage(ifainew_core::RagState::new())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            greet,
            ai_chat,
            ai_completion,
            create_window,
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
            ifainew_core::rag::init_rag_index,
            ifainew_core::rag::search_semantic,
            ifainew_core::rag::search_hybrid,
            ifainew_core::rag::build_context,
            ifainew_core::agent::agent_write_file,
            ifainew_core::agent::agent_read_file,
            ifainew_core::agent::agent_list_dir
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
