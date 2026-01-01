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
mod project_config;
mod community;
mod local_model;
mod intelligence_router;
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

/// Smart RAG detection: Check if user query is code-related
fn should_use_rag(text: &str) -> bool {
    let code_keywords = [
        // Chinese keywords
        "代码", "文件", "函数", "类", "接口", "模块", "实现", "逻辑",
        "如何工作", "在哪", "在哪里", "bug", "错误", "项目", "这个项目",
        "怎么", "如何", "为什么", "哪里",
        // English keywords
        "code", "file", "function", "class", "interface", "module",
        "implementation", "logic", "how does", "where is", "locate",
        "bug", "error", "project", "this project",
        "what", "how", "why", "where",
    ];

    code_keywords.iter().any(|kw| text.contains(kw))
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
    println!("[AI Chat] Received {} messages", messages.len());

    // Ensure all messages have unique IDs
    // Sanitize messages
    ai_utils::sanitize_messages(&mut messages);
    println!("[AI Chat] After sanitize: {} messages", messages.len());

    if let Some(root) = project_root {
        let root_clone = root.clone();

        // 1. Detect @codebase query or smart RAG trigger
        let mut codebase_query = None;
        if let Some(last_msg) = messages.iter().filter(|m| m.role == "user").last() {
             match &last_msg.content {
                core_traits::ai::Content::Text(text) => {
                     let lower_text = text.to_lowercase();
                    // Priority 1: Explicit @codebase trigger
                    if lower_text.contains("@codebase") {
                        if let Ok(re) = regex::Regex::new("(?i)@codebase") {
                            let temp = re.replace_all(text, "").to_string();
                            let final_query = temp.trim().to_string();
                            codebase_query = Some(if final_query.is_empty() { "overview of the project structure and main logic".to_string() } else { final_query });
                        }
                    }
                    // Priority 2: Smart RAG detection (if enabled in settings)
                    // Note: For now we enable by default, can be controlled via provider_config in future
                    else if should_use_rag(&lower_text) {
                        println!("[AI Chat] Smart RAG triggered for query: {}", text);
                        codebase_query = Some(text.to_string());
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
                    // Priority 1: Explicit @codebase trigger
                    if lower_text.contains("@codebase") {
                        if let Ok(re) = regex::Regex::new("(?i)@codebase") {
                            let temp = re.replace_all(&combined_text, "").to_string();
                            let final_query = temp.trim().to_string();
                            codebase_query = Some(if final_query.is_empty() { "overview of the project structure and main logic".to_string() } else { final_query });
                        }
                    }
                    // Priority 2: Smart RAG detection
                    else if should_use_rag(&lower_text) {
                        println!("[AI Chat] Smart RAG triggered for query: {}", combined_text);
                        codebase_query = Some(combined_text);
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
                 println!("[AI Chat] Parallel RAG: Starting context build for query: {}", query);

                 // Note: initialization check is implicit in retrieve_context logic in Commercial impl
                 // or skipped in Community impl.

                 // Add timeout to prevent blocking indefinitely
                 let retrieve_future = rag_service.retrieve_context(&query, &root_for_rag);
                 let timeout_duration = std::time::Duration::from_secs(30);

                 match tokio::time::timeout(timeout_duration, retrieve_future).await {
                    Ok(Ok(rag_result)) => {
                        println!("[AI Chat] RAG context built successfully with {} references", rag_result.references.len());
                        let _ = app_handle.emit(&format!("{}_references", event_id_for_rag), &rag_result.references);
                        let _ = app_handle.emit("codebase-references", rag_result.references);
                        Some(rag_result.context)
                    },
                    Ok(Err(e)) => {
                         eprintln!("[AI Chat] RAG failed: {}", e);
                         None
                    },
                    Err(_) => {
                         eprintln!("[AI Chat] RAG timeout after 30s - index may not be initialized. Try running /index command first.");
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

        println!("[AI Chat] Before retain: {} messages", messages.len());
        messages.retain(|m| m.role != "system");
        println!("[AI Chat] After retain: {} messages", messages.len());
        
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

    // 验证至少有一条用户消息
    let has_user_message = messages.iter().any(|m| m.role == "user");
    if !has_user_message {
        eprintln!("[AI Chat] ERROR: No user messages in request!");
        return Err("No user message to process".to_string());
    }

    println!("[AI Chat] Final messages to send: {}", messages.len());
    for (i, msg) in messages.iter().enumerate() {
        let content_info = match &msg.content {
            core_traits::ai::Content::Text(s) => format!("Text({} chars)", s.len()),
            core_traits::ai::Content::Parts(p) => format!("Parts({} items)", p.len()),
        };
        println!("[AI Chat]   [{}] role={}, content={}", i, msg.role, content_info);
    }

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
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            greet,
            ai_chat,
            ai_completion,
            create_window,
            file_walker::get_all_file_paths,
            file_walker::get_all_file_paths_parallel,
            file_walker::get_directory_metadata,
            terminal::create_pty,
            terminal::write_pty,
            terminal::resize_pty,
            terminal::kill_pty,
            search::search_in_files,
            git::get_git_statuses,
            git::get_git_statuses_incremental,
            git::get_git_statuses_pattern,
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
            commands::core_wrappers::agent_batch_read,
            commands::core_wrappers::agent_scan_directory,
            commands::prompt_commands::list_prompts,
            commands::prompt_commands::get_prompt,
            commands::prompt_commands::update_prompt,
            commands::prompt_commands::render_prompt_template,
            commands::agent_commands::launch_agent,
            commands::agent_commands::list_running_agents,
            commands::agent_commands::approve_agent_action,
            performance::detect_gpu_info,
            performance::is_on_battery,
            performance::get_display_refresh_rate,
            project_config::load_project_config,
            project_config::save_project_config,
            project_config::parse_project_config,
            project_config::project_config_exists,
            project_config::delete_project_config,
            local_model::get_local_model_config,
            local_model::validate_local_model,
            local_model::get_system_info,
            local_model::local_model_chat,
            local_model::test_tool_parse,
            local_model::get_download_status,
            local_model::start_download,
            local_model::cancel_download
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}