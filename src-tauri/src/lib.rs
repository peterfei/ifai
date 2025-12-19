use tauri::{Emitter, Manager};
use ifainew_core;

mod file_walker;
mod terminal;
mod search;
mod git;
mod lsp;
mod prompt_manager;
mod agent_system;
mod commands;
use terminal::TerminalManager;
use lsp::LspManager;
use agent_system::Supervisor;

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
async fn ai_chat(
    app: tauri::AppHandle,
    provider_config: ifainew_core::ai::AIProviderConfig,
    mut messages: Vec<ifainew_core::ai::Message>,
    event_id: String,
    enable_tools: Option<bool>,
    project_root: Option<String>,
) -> Result<(), String> {
    // =============================================================================
    // Prompt Ecosystem Integration
    // =============================================================================
    if let Some(root) = &project_root {
        let system_content = prompt_manager::get_main_system_prompt(root);
        // Prepend system message with correct enum type and fields
        messages.insert(0, ifainew_core::ai::Message {
            role: "system".to_string(),
            content: ifainew_core::ai::Content::Text(system_content),
            tool_calls: None,
            tool_call_id: None,
        });
    }

    // =============================================================================
    // Message Sanitization Logic (Single Source of Truth)
    // =============================================================================
    // Fix: "An assistant message with 'tool_calls' must be followed by tool messages
    //       responding to each 'tool_call_id'"
    //
    // OpenAI/DeepSeek API Requirements:
    // 1. Every tool_call in an assistant message MUST have a corresponding tool response
    // 2. Tool messages must reference a valid tool_call_id
    // 3. Assistant messages with empty tool_calls should have the field removed
    //
    // This is the authoritative sanitization - frontend no longer does this.
    // =============================================================================

    let mut i = 0;
    while i < messages.len() {
        // Only process assistant messages that have tool_calls
        if messages[i].role == "assistant" && messages[i].tool_calls.as_ref().map_or(false, |tc| !tc.is_empty()) {
            let tool_calls = messages[i].tool_calls.clone().unwrap();
            let mut completed_ids = std::collections::HashSet::new();

            // Scan forward to find all tool response messages
            let mut j = i + 1;
            while j < messages.len() && messages[j].role == "tool" {
                if let Some(id) = &messages[j].tool_call_id {
                    completed_ids.insert(id.clone());
                }
                j += 1;
            }

            // Filter to keep only tool_calls that have responses
            let filtered_calls: Vec<_> = tool_calls.into_iter()
                .filter(|tc| completed_ids.contains(&tc.id))
                .collect();

            if filtered_calls.is_empty() {
                // No completed calls - remove tool_calls field entirely
                // The assistant message will be kept if it has text content
                messages[i].tool_calls = None;
            } else {
                // Update with only completed calls
                messages[i].tool_calls = Some(filtered_calls);
            }
        }
        i += 1;
    }
    // =============================================================================

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
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .manage(TerminalManager::new())
        .manage(LspManager::new())
        .manage(Supervisor::new())
                .on_window_event(|window, event| {
                    match event {
                        tauri::WindowEvent::CloseRequested { api, .. } => {
                            if window.label() == "main" {
                                window.app_handle().exit(0);
                            }
                        }
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
            ifainew_core::agent::agent_list_dir,
            commands::prompt_commands::list_prompts,
            commands::prompt_commands::get_prompt,
            commands::prompt_commands::update_prompt,
            commands::prompt_commands::render_prompt_template,
            commands::agent_commands::launch_agent,
            commands::agent_commands::list_running_agents
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
