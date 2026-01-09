use tauri::{Emitter, Manager};
use serde_json::json;
#[cfg(feature = "commercial")]
use ifainew_core;

mod file_walker;
mod search;
mod symbol_engine;
mod terminal;
mod git;
mod lsp;
mod prompt_manager;
mod agent_system;
mod conversation;
mod ai_utils;
mod file_cache;
mod commands;
mod performance;
mod core_traits;
mod project_config;
mod community;
mod local_model;
mod intelligence_router;
mod token_counter; // v0.2.6 新增：Token 计数模块
mod openspec; // v0.2.6 新增：OpenSpec 集成

// LLM inference using llama.cpp (GGUF native support)
// Phase 1: placeholder module, Phase 2: actual implementation
#[cfg(feature = "llm-inference")]
pub mod llm_inference;

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

/// 本地工具执行器（兼容社区版和商业版）
pub async fn execute_local_tool(
    tool_name: &str,
    args: &serde_json::Value,
    project_root: &str,
) -> String {
    use crate::commands::core_wrappers;

    println!("[LocalTool] Executing: {} with args: {}", tool_name, args);

    match tool_name {
        "agent_read_file" => {
            let rel_path = args["rel_path"].as_str().unwrap_or("");
            match core_wrappers::agent_read_file(project_root.to_string(), rel_path.to_string()).await {
                Ok(content) => content,
                Err(e) => format!("错误: {}", e)
            }
        }
        "agent_list_dir" => {
            let rel_path = args["rel_path"].as_str().unwrap_or(".");
            match core_wrappers::agent_list_dir(project_root.to_string(), rel_path.to_string()).await {
                Ok(entries) => entries.join("\n"),
                Err(e) => format!("错误: {}", e)
            }
        }
        "agent_write_file" => {
            let rel_path = args["rel_path"].as_str().unwrap_or("");
            let content = args["content"].as_str().unwrap_or("");
            match core_wrappers::agent_write_file(project_root.to_string(), rel_path.to_string(), content.to_string()).await {
                Ok(_) => "文件写入成功".to_string(),
                Err(e) => format!("错误: {}", e)
            }
        }
        "agent_batch_read" => {
            if let Some(paths_array) = args["paths"].as_array() {
                let paths: Vec<String> = paths_array.iter()
                    .filter_map(|v| v.as_str())
                    .map(|s| s.to_string())
                    .collect();
                core_wrappers::agent_batch_read(project_root.to_string(), paths).await
                    .unwrap_or_else(|e| format!("错误: {}", e))
            } else {
                "错误: 缺少 paths 参数".to_string()
            }
        }
        "bash" | "agent_run_shell_command" | "agent_execute_command" => {
            let cmd_str = args["command"].as_str().unwrap_or("");
            let cwd = args["working_dir"]
                .as_str()
                .or_else(|| args["cwd"].as_str())
                .unwrap_or(project_root);
            let timeout_val = args["timeout"]
                .as_u64()
                .or_else(|| args["timeout_ms"].as_u64());
            let env_vars = args.get("env_vars")
                .and_then(|v| v.as_object())
                .map(|obj| {
                    obj.iter()
                        .filter_map(|(k, v)| Some((k.clone(), v.as_str()?.to_string())))
                        .collect::<std::collections::HashMap<String, String>>()
                });

            match commands::bash_commands::execute_bash_command(
                cmd_str.to_string(),
                Some(cwd.to_string()),
                timeout_val,
                env_vars,
            ).await {
                Ok(result) => serde_json::to_string(&result).unwrap_or_default(),
                Err(e) => format!("命令执行失败: {}", e),
            }
        }
        _ => {
            format!("未知的工具: {}", tool_name)
        }
    }
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

    if let Some(ref root) = project_root {
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

        // Insert Main System Prompt
        let mut final_system_prompt = prompt_manager::get_main_system_prompt(&root);
        
        // 注入工具定义兜底：确保模型即便没收到 tools 参数，也能通过提示词学会调用
        final_system_prompt.push_str("\n\n# ADDITIONAL TOOLS AVAILABLE\n");
        final_system_prompt.push_str("You also have access to the following tool. You MUST use it by outputting a standard tool call JSON:\n");
        final_system_prompt.push_str(r#"
- name: bash
  description: Execute a shell command
  parameters: { "command": "string", "working_dir": "string (optional)" }
  example: {"name": "bash", "arguments": {"command": "ls -la"}}
"#);

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

    // 本地模型预处理 - 智能路由决策
    // 先检查是否应该使用本地模型处理
    let preprocess_result = local_model::local_model_preprocess(messages.clone()).await;

    // 检查是否应该使用本地处理
    let should_use_local = match &preprocess_result {
        Ok(result) => {
            println!("[AI Chat] Local Model Preprocess:");
            println!("  - should_use_local: {}", result.should_use_local);
            println!("  - has_tool_calls: {}", result.has_tool_calls);
            println!("  - tool_calls: {:?}", result.tool_calls.iter().map(|t| &t.name).collect::<Vec<_>>());
            println!("  - route_reason: {}", result.route_reason);

            // 如果本地模型解析到工具调用，发送路由事件通知前端
            if result.has_tool_calls {
                let _ = app.emit("local-model-route", json!({
                    "type": "tool-calls-detected",
                    "tool_calls": result.tool_calls,
                    "reason": result.route_reason
                }));
            }

            // 如果本地模型生成了回复，直接返回
            if let Some(ref response) = result.local_response {
                println!("[AI Chat] Using local model response");
                let _ = app.emit(&event_id, json!({
                    "type": "content",
                    "content": response
                }));
                let _ = app.emit(&event_id, json!({"type": "done"}));
                return Ok(());
            }

            // 决定是否使用本地处理
            result.should_use_local && result.has_tool_calls
        }
        Err(e) => {
            eprintln!("[AI Chat] Local model preprocess failed: {}, falling back to cloud", e);
            false
        }
    };

    // 如果本地可以处理工具调用，执行并返回
    if should_use_local {
        println!("[AI Chat] should_use_local is TRUE, checking conditions...");
        println!("[AI Chat] preprocess_result is Ok: {}", preprocess_result.is_ok());
        println!("[AI Chat] project_root: {:?}", project_root);

        if let Ok(result) = preprocess_result {
            println!("[AI Chat] Got preprocess result, {} tool calls", result.tool_calls.len());
            if let Some(ref root) = project_root {
                println!("[AI Chat] Executing {} tool calls locally", result.tool_calls.len());

                let overall_start = std::time::Instant::now();

                // 发送开始事件 - 已注释掉，避免在前端显示调试信息
                // let _ = app.emit(&event_id, json!({
                //     "type": "thinking",
                //     "content": "Executing locally..."
                // }));

                // 执行每个工具调用并收集结果
                let mut all_results = Vec::new();
                for (idx, tool_call) in result.tool_calls.iter().enumerate() {
                    println!("[AI Chat] Executing tool {}/{}: {}", idx + 1, result.tool_calls.len(), tool_call.name);

                    let tool_start = std::time::Instant::now();

                    // 构建参数 JSON
                    let args_json = serde_json::to_string(&tool_call.arguments)
                        .unwrap_or_else(|_| "{}".to_string());
                    let args_value: serde_json::Value = serde_json::from_str(&args_json)
                        .unwrap_or_else(|_| serde_json::json!({}));

                    // 执行工具调用
                    let tool_result = execute_local_tool(&tool_call.name, &args_value, root).await;
                    let elapsed = tool_start.elapsed().as_millis();

                    // 格式化单个工具结果
                    let formatted_result = format!(
                        "[OK] {} ({}ms)\n{}",
                        tool_call.name,
                        elapsed,
                        tool_result
                    );
                    all_results.push(formatted_result);

                    // 发送工具结果事件 - 已注释掉，避免在前端显示调试信息
                    // let _ = app.emit(&event_id, json!({
                    //     "type": "tool-result",
                    //     "tool_name": tool_call.name,
                    //     "result": tool_result,
                    //     "execution_time_ms": elapsed
                    // }));
                }

                let total_elapsed = overall_start.elapsed().as_millis();

                // 组合所有结果 - 工业级格式
                let header = format!("[Local Model] Completed in {}ms\n", total_elapsed);
                let combined_result = format!("{}{}", header, all_results.join("\n\n"));

                // 发送完成事件
                let _ = app.emit(&event_id, json!({
                    "type": "content",
                    "content": combined_result,
                    "metadata": {
                        "source": "local_model",
                        "tool_count": result.tool_calls.len(),
                        "execution_time_ms": total_elapsed
                    }
                }));
                // 发送 done 事件 - 已注释掉，避免在前端显示调试信息
                // let _ = app.emit(&event_id, json!({
                //     "type": "done",
                //     "metadata": {
                //         "source": "local_model"
                //     }
                // }));

                println!("[AI Chat] Local tool execution completed in {}ms", total_elapsed);
                return Ok(());
            } else {
                eprintln!("[AI Chat] No project_root provided, cannot execute local tools");
            }
        } else {
            eprintln!("[AI Chat] Failed to get preprocess result");
        }
    } else {
        println!("[AI Chat] should_use_local is FALSE, falling back to cloud API");
    }

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
    let app_for_finish = app.clone();
    let event_id_for_finish = event_id.clone();
    let project_root_clone = project_root.clone();

    // 使用内部可变性以在 Fn 闭包中修改状态
    let accumulated_reasoning = std::sync::Arc::new(std::sync::Mutex::new(String::new()));
    let accumulated_content = std::sync::Arc::new(std::sync::Mutex::new(String::new()));
    let has_intercepted_tool = std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false));

    // 为云端请求注入 bash 工具定义
    let mut tools = vec![
        serde_json::json!({
            "type": "function",
            "function": {
                "name": "bash",
                "description": "Execute a shell command",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "command": { "type": "string", "description": "The command to execute" },
                        "working_dir": { "type": "string", "description": "Working directory (optional)" }
                    },
                    "required": ["command"]
                }
            }
        })
    ];

    state.ai_service.stream_chat(
        &provider_config,
        messages,
        &event_id,
        Some(tools),
        Box::new(move |chunk| {
             // 调试：打印 chunk 内容
             // println!("[AI Chat] Streaming chunk: {}", chunk);

             // 解析并检查 GLM 特有的 XML 格式
             if let Ok(json_obj) = serde_json::from_str::<serde_json::Value>(&chunk) {
                 let mut current_reasoning = String::new();
                 let mut current_content = String::new();

                 // 处理推理内容 (reasoning_content)
                 if let Some(reasoning) = json_obj["choices"][0]["delta"]["reasoning_content"].as_str() {
                     let mut acc_reasoning = accumulated_reasoning.lock().unwrap();
                     acc_reasoning.push_str(reasoning);
                     current_reasoning = acc_reasoning.clone();
                 } else {
                     current_reasoning = accumulated_reasoning.lock().unwrap().clone();
                 }

                 // 处理正文内容 (content)
                 if let Some(content) = json_obj["choices"][0]["delta"]["content"].as_str() {
                     let mut acc_content = accumulated_content.lock().unwrap();
                     acc_content.push_str(content);
                     current_content = acc_content.clone();
                 } else {
                     current_content = accumulated_content.lock().unwrap().clone();
                 }

                 // 检测 XML 标签并转换
                 let combined = format!("{}{}", current_reasoning, current_content);
                 let already_intercepted = has_intercepted_tool.load(std::sync::atomic::Ordering::SeqCst);

                 if combined.contains("</tool_call>") && !already_intercepted {
                     use regex::Regex;
                     let re_full = Regex::new(r"<tool_call>(.*?)</tool_call>").unwrap();
                     if let Some(caps) = re_full.captures(&combined) {
                         let full_match = caps.get(0).unwrap().as_str();
                         let re_tool = Regex::new(r"<tool_call>([^<]+)").unwrap();
                         let re_key = Regex::new(r"<arg_key>([^<]+)</arg_key>").unwrap();
                         let re_val = Regex::new(r"<arg_value>([^<]+)</arg_value>").unwrap();

                         if let Some(tool_name) = re_tool.captures(full_match).and_then(|c| c.get(1)).map(|m| m.as_str().trim()) {
                             let mut args = serde_json::Map::new();
                             let keys: Vec<_> = re_key.captures_iter(full_match).filter_map(|c| c.get(1)).map(|m| m.as_str()).collect();
                             let vals: Vec<_> = re_val.captures_iter(full_match).filter_map(|c| c.get(1)).map(|m| m.as_str()).collect();
                             for (k, v) in keys.iter().zip(vals.iter()) {
                                 args.insert(k.to_string(), serde_json::json!(v));
                             }

                             if !args.is_empty() {
                                 // 标记已拦截，防止同一次流中重复触发
                                 has_intercepted_tool.store(true, std::sync::atomic::Ordering::SeqCst);
                                 
                                 let cmd_str = args.get("command").and_then(|v| v.as_str()).unwrap_or("");
                                 println!("[AI Chat] INTERCEPTED XML: {} - {}", tool_name, cmd_str);

                                 // 发送标准工具调用事件给前端
                                 let _ = app_handle_for_stream.emit(&event_id_clone, serde_json::json!({
                                     "type": "tool_call",
                                     "tool_call": {
                                         "index": 0,
                                         "id": format!("glm_{}", uuid::Uuid::new_v4()),
                                         "type": "function",
                                         "function": {
                                             "name": tool_name,
                                             "arguments": serde_json::to_string(&args).unwrap_or_default()
                                         }
                                     }
                                 }).to_string());
                             }
                         }
                     }
                 }

                 // 如果已经拦截过工具，或者正在输出 XML 标签，则彻底静默后续所有块
                 // 这样可以防止 AI 在工具调用后输出重复的 XML 或者废话
                 let is_xml_fragment = combined.contains("<tool_call>") || combined.contains("<arg_") || chunk.contains("tool_call");
                 let should_suppress = already_intercepted || is_xml_fragment;
                 
                 if !should_suppress {
                     let _ = app_handle_for_stream.emit(&event_id_clone, chunk.clone());
                 }

                 // 检查 finish_reason
                 if let Some(finish_reason) = json_obj["choices"][0].get("finish_reason").and_then(|v| v.as_str()) {
                     println!("[AI Chat] Detected finish_reason: {}, triggering _finish event", finish_reason);
                     let _ = app_for_finish.emit(&format!("{}_finish", event_id_for_finish), "DONE");
                 }
             }
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
            commands::core_wrappers::agent_delete_file,
            commands::core_wrappers::agent_batch_read,
            commands::core_wrappers::agent_scan_directory,
            commands::prompt_commands::list_prompts,
            commands::prompt_commands::get_prompt,
            commands::prompt_commands::update_prompt,
            commands::prompt_commands::render_prompt_template,
            commands::agent_commands::launch_agent,
            commands::agent_commands::list_running_agents,
            commands::agent_commands::approve_agent_action,
            commands::bash_commands::execute_bash_command,
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
            local_model::cancel_download,
            local_model::local_model_preprocess,
            local_model::local_code_completion,
            file_cache::get_file_cache_stats,
            file_cache::clear_file_cache,
            file_cache::print_file_cache_stats,
            // v0.2.6 新增：Token 计数命令
            token_counter::count_tokens,
            token_counter::count_tokens_batch,
            token_counter::estimate_tokens_cmd,
            // v0.2.6 新增：任务拆解文件存储
            commands::task_commands::save_task_breakdown,
            commands::task_commands::load_task_breakdown,
            commands::task_commands::list_task_breakdowns,
            commands::task_commands::delete_task_breakdown,
            // v0.2.6 新增：OpenSpec 集成
            openspec::detector::detect_openspec_cli,
            commands::proposal_commands::save_proposal,
            commands::proposal_commands::load_proposal,
            commands::proposal_commands::delete_proposal,
            commands::proposal_commands::move_proposal,
            commands::proposal_commands::list_proposals,
            commands::proposal_commands::init_demo_proposal,
            commands::bash_commands::execute_bash_command
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}