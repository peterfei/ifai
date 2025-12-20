use tauri::{Emitter, Manager};
use ifainew_core;

mod file_walker;
mod terminal;
mod search;
mod git;
mod lsp;
mod prompt_manager;
mod agent_system;
mod conversation;
mod ai_utils;
mod commands;
mod performance;
use terminal::TerminalManager;
use lsp::LspManager;
use agent_system::Supervisor;

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    println!(">>> RUST GREET CALLED WITH: {}", name);
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
async fn ai_chat(
    app: tauri::AppHandle,
    state: tauri::State<'_, ifainew_core::RagState>,
    provider_config: ifainew_core::ai::AIProviderConfig,
    mut messages: Vec<ifainew_core::ai::Message>,
    event_id: String,
    enable_tools: Option<bool>,
    project_root: Option<String>,
) -> Result<(), String> {
    println!("[AI Chat] Entry - project_root: {:?}, event_id: {}", project_root, event_id);

    if let Some(root) = project_root {
        let root_clone = root.clone();
        let provider_clone = provider_config.clone();
        
        // 1. Detect @codebase query
        let mut codebase_query = None;
        if let Some(last_msg) = messages.iter().filter(|m| m.role == "user").last() {
            // Extract text from either Content::Text or Content::Parts
            let text_content = match &last_msg.content {
                ifainew_core::ai::Content::Text(text) => Some(text.clone()),
                ifainew_core::ai::Content::Parts(parts) => {
                    let combined_text = parts.iter()
                        .filter_map(|p| match p {
                            ifainew_core::ai::ContentPart::Text { text, .. } => Some(text.clone()),
                            _ => None,
                        })
                        .collect::<Vec<_>>()
                        .join(" ");
                    Some(combined_text)
                }
            };

            if let Some(text) = text_content {
                let lower_text = text.to_lowercase();
                if lower_text.contains("@codebase") {
                    if let Ok(re) = regex::Regex::new("(?i)@codebase") {
                        let temp = re.replace_all(&text, "").to_string();
                        let final_query = temp.trim().to_string();
                        codebase_query = Some(if final_query.is_empty() { "overview of the project structure and main logic".to_string() } else { final_query });
                    }
                }
            }
        }

        // 2. Parallel Tasks: RAG Context Building & Auto Summarization
        let app_handle = app.clone();
        let rag_state = state.clone();
        let root_for_rag = root.clone();
        let event_id_for_rag = event_id.clone();
        
        // Clone messages for summarization to avoid move
        let mut messages_for_summarize = messages.clone();

        let rag_task = async move {
            if let Some(query) = codebase_query {
                println!("[AI Chat] Parallel RAG: Starting context build...");
                
                // Ensure RAG is initialized (Non-blocking check)
                let is_initialized = {
                    let guard = rag_state.index.lock().unwrap();
                    guard.is_some()
                };

                if !is_initialized {
                    println!("[AI Chat] Parallel RAG: Index NOT initialized. Starting background init...");
                    let app_clone = app_handle.clone();
                    let root_clone = root_for_rag.clone();
                    let event_id_clone = event_id_for_rag.clone();

                    // Notify frontend that indexing is starting
                    let _ = app_handle.emit(&format!("{}_status", event_id_for_rag), "Indexing project codebase... (This may take a moment)");

                    // Spawn init in background, DO NOT await here
                    tokio::spawn(async move {
                        // Re-acquire state from app handle to avoid lifetime issues in spawn
                        let state_in_spawn = app_clone.state::<ifainew_core::RagState>();
                        match ifainew_core::rag::init_rag_index(app_clone.clone(), state_in_spawn, root_clone).await {
                            Ok(_) => {
                                println!("[AI Chat] Background RAG init successful.");
                                let _ = app_clone.emit(&format!("{}_status", event_id_clone), "Indexing complete. Future queries will have full context.");
                            },
                            Err(e) => eprintln!("[AI Chat] Background RAG init failed: {}", e),
                        }
                    });

                    // Return None immediately so the chat can proceed without context
                    return None;
                }

                match ifainew_core::rag::build_context(rag_state, query, root_for_rag).await {
                    Ok(rag_result) => {
                        let _ = app_handle.emit(&format!("{}_references", event_id_for_rag), &rag_result.references);
                        let _ = app_handle.emit("codebase-references", rag_result.references);
                        Some(rag_result.context)
                    },
                    Err(e) => {
                        eprintln!("[AI Chat] Parallel RAG: Search failed: {}", e);
                        None
                    }
                }
            } else {
                None
            }
        };

        let summarize_task = async move {
            if let Err(e) = conversation::auto_summarize(&root_clone, &provider_clone, &mut messages_for_summarize).await {
                eprintln!("[AI Chat] Parallel Summarize: Error: {}", e);
            }
            messages_for_summarize
        };

        // Execute tasks in parallel
        let (rag_context, updated_messages) = tokio::join!(rag_task, summarize_task);
        
        // Update messages with summarized version
        messages = updated_messages;

        // 3. Assemble Final System Prompt
        let mut final_system_prompt = prompt_manager::get_main_system_prompt(&root);
        if let Some(context) = rag_context {
            if !context.is_empty() {
                let truncated_context = if context.len() > 12000 {
                    format!("{}... [Context Truncated]", &context[..12000])
                } else {
                    context
                };
                println!("[AI Chat] Parallel RAG: Context injected ({} chars)", truncated_context.len());
                final_system_prompt.push_str("\n\nProject Context (Use this to answer codebase questions):\n");
                final_system_prompt.push_str(&truncated_context);
            }
        }

        // 4. Update System Message (Deduplication)
        messages.retain(|m| m.role != "system");
        messages.insert(0, ifainew_core::ai::Message {
            role: "system".to_string(),
            content: ifainew_core::ai::Content::Text(final_system_prompt),
            tool_calls: None,
            tool_call_id: None,
        });
    }
        
    ai_utils::sanitize_messages(&mut messages);
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
                        tauri::WindowEvent::CloseRequested { .. } => {
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
            commands::agent_commands::list_running_agents,
            commands::agent_commands::approve_agent_action,
            performance::detect_gpu_info,
            performance::is_on_battery,
            performance::get_display_refresh_rate
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
