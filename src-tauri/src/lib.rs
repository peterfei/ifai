use tauri::{Emitter, Manager};
#[cfg(feature = "commercial")]
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
mod core_traits;
mod community;
#[cfg(feature = "commercial")]
mod commercial;

use terminal::TerminalManager;
use lsp::LspManager;
use agent_system::Supervisor;
use std::sync::Arc;
use crate::core_traits::ai::{Message, Content, ContentPart};

pub struct AppState {
    pub ai_service: Arc<dyn core_traits::ai::AIService>,
    pub rag_service: Arc<dyn core_traits::rag::RagService>,
    pub agent_service: Arc<dyn core_traits::agent::AgentService>,
}

#[tauri::command]
fn greet(name: &str) -> String {
    println!( ">>> RUST GREET CALLED WITH: {}", name);
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
async fn ai_chat(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    provider_config: core_traits::ai::AIProviderConfig,
    mut messages: Vec<core_traits::ai::Message>,
    event_id: String,
    enable_tools: Option<bool>,
    project_root: Option<String>,
) -> Result<(), String> {
    println!("[AI Chat] Entry - project_root: {:?}, event_id: {}", project_root, event_id);

    // Ensure all messages have unique IDs
    // Sanitize messages
    ai_utils::sanitize_messages(&mut messages);

    if let Some(root) = project_root {
        let root_clone = root.clone();
        
        // 1. Detect @codebase query
        let mut codebase_query = None;
        if let Some(last_msg) = messages.iter().filter(|m| m.role == "user").last() {
             match &last_msg.content {
                core_traits::ai::Content::Text(text) => {
                     let lower_text = text.to_lowercase();
                    if lower_text.contains("@codebase") {
                        if let Ok(re) = regex::Regex::new("(?i)@codebase") {
                            let temp = re.replace_all(text, "").to_string();
                            let final_query = temp.trim().to_string();
                            codebase_query = Some(if final_query.is_empty() { "overview of the project structure and main logic".to_string() } else { final_query });
                        }
                    }
                }
                core_traits::ai::Content::Parts(parts) => {
                    let combined_text = parts.iter()
                        .filter_map(|p| match p {
                            core_traits::ai::ContentPart::Text { text, .. } => Some(text.clone()),
                            _ => None,
                        })
                        .collect::<Vec<_>>()
                        .join(" ");
                    let lower_text = combined_text.to_lowercase();
                    if lower_text.contains("@codebase") {
                        if let Ok(re) = regex::Regex::new("(?i)@codebase") {
                            let temp = re.replace_all(&combined_text, "").to_string();
                            let final_query = temp.trim().to_string();
                            codebase_query = Some(if final_query.is_empty() { "overview of the project structure and main logic".to_string() } else { final_query });
                        }
                    }
                }
            };
        }

        // 2. RAG Context Building (Parallel)
        let app_handle = app.clone();
        let rag_service = state.rag_service.clone();
        let event_id_for_rag = event_id.clone();
        let root_for_rag = root.clone();
        
        // Clone messages for summarization to avoid move
        let mut messages_for_summarize = messages.clone();
        
        // Define futures for parallel execution
        let rag_task = async move {
            if let Some(query) = codebase_query {
                 println!("[AI Chat] Parallel RAG: Starting context build...");
                 
                 // Note: initialization check is implicit in retrieve_context logic in Commercial impl
                 // or skipped in Community impl.
                 
                 match rag_service.retrieve_context(&query, &root_for_rag).await {
                    Ok(rag_result) => {
                        let _ = app_handle.emit(&format!("{}_references", event_id_for_rag), &rag_result.references);
                        let _ = app_handle.emit("codebase-references", rag_result.references);
                        Some(rag_result.context)
                    },
                    Err(e) => {
                         eprintln!("[AI Chat] RAG failed: {}", e);
                         None
                    }
                 }
            } else {
                None
            }
        };

        // For now, simple summarization without auto_summarize if it's too complex to port
        // But we ported conversation/mod.rs so we can try.
        let provider_clone = provider_config.clone();
        let app_handle_summ = app.clone();
        let event_id_summ = event_id.clone();
        
        let summarize_task = async move {
            if let Err(e) = conversation::auto_summarize(&app_handle_summ, &event_id_summ, &root_clone, &provider_clone, &mut messages_for_summarize).await {
                eprintln!("[AI Chat] Parallel Summarize: Error: {}", e);
            }
            messages_for_summarize
        };

        // Execute tasks in parallel
        let (rag_context, updated_messages): (Option<String>, Vec<_>) = tokio::join!(rag_task, summarize_task);
        
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
                final_system_prompt.push_str("\n\nProject Context:\n");
                final_system_prompt.push_str(&truncated_context);
             }
        }

        // Extract existing summary if present (from auto_summarize)
        let mut summary_message = None;
        for msg in &messages {
            if msg.role == "system" {
                match &msg.content {
                    core_traits::ai::Content::Text(text) => {
                        if text.contains("## CONVERSATION SUMMARY") {
                            summary_message = Some(msg.clone());
                            break;
                        }
                    },
                    _ => {}
                }
            }
        }

        messages.retain(|m| m.role != "system");
        
        // Insert Main System Prompt
        messages.insert(0, core_traits::ai::Message {
            role: "system".to_string(),
            content: core_traits::ai::Content::Text(final_system_prompt),
            tool_calls: None,
            tool_call_id: None,
        });

        // Re-insert Summary if found
        if let Some(summary) = summary_message {
            // Insert after the main system prompt
            if messages.len() > 0 {
                messages.insert(1, summary);
            } else {
                messages.push(summary);
            }
        }
    }

    ai_utils::sanitize_messages(&mut messages);
    
    // Callback wrapper for Tauri events
    let app_handle_for_stream = app.clone();
    let event_id_clone = event_id.clone();
    
    state.ai_service.stream_chat(
        &provider_config, 
        messages, 
        &event_id, 
        Box::new(move |chunk| {
             let _ = app_handle_for_stream.emit(&event_id_clone, chunk);
        })
    ).await
}

#[tauri::command]
async fn ai_completion(
    state: tauri::State<'_, AppState>,
    provider_config: core_traits::ai::AIProviderConfig,
    messages: Vec<core_traits::ai::Message>,
) -> Result<String, String> {
    println!("[AI Completion] Entry - provider: {}", provider_config.id);
    let response = state.ai_service.chat(&provider_config, messages).await?;
    match response.content {
        core_traits::ai::Content::Text(t) => Ok(t),
        _ => Err("Received non-text content for completion".to_string()),
    }
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
    let mut builder = tauri::Builder::default();
    
    builder = builder.setup(|app| {
        let app_handle = app.handle().clone();
        
        #[cfg(feature = "commercial")]
        let (ai, rag, agent) = {
             let ai = Arc::new(commercial::impls::CommercialAIService::new(app_handle.clone()));
             let rag = Arc::new(commercial::impls::CommercialRagService::new(app_handle.clone()));
             let agent = Arc::new(commercial::impls::CommercialAgentService::new());
             (ai, rag, agent)
        };
        
        #[cfg(not(feature = "commercial"))]
        let (ai, rag, agent) = {
             let ai = Arc::new(community::BasicAIService);
             let rag = Arc::new(community::CommunityRagService);
             let agent = Arc::new(community::CommunityAgentService);
             (
                 ai as Arc<dyn core_traits::ai::AIService>, 
                 rag as Arc<dyn core_traits::rag::RagService>, 
                 agent as Arc<dyn core_traits::agent::AgentService>
             )
        };
        
        app.manage(AppState {
            ai_service: ai,
            rag_service: rag,
            agent_service: agent,
        });
        
        #[cfg(feature = "commercial")]
        {
            app.manage(ifainew_core::RagState::new());
        }
        
        Ok(())
    });

    builder
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
            commands::core_wrappers::init_rag_index,
            commands::core_wrappers::search_semantic,
            commands::core_wrappers::search_hybrid,
            commands::core_wrappers::build_context,
            commands::core_wrappers::agent_write_file,
            commands::core_wrappers::agent_read_file,
            commands::core_wrappers::agent_list_dir,
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