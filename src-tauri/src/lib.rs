use tauri::{Emitter, Manager};
use serde_json::json;
#[cfg(feature = "commercial")]
use ifainew_core;
use std::sync::Arc;

mod ai; // v0.3.7 新增：PIVO 任务拆解与自愈引擎
mod file_walker;
mod search;
mod symbol_engine;
mod analysis; // 🏆 PIVO 3.0: 物理感知与符号探测
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
pub mod core_traits; // 公开 core_traits 供 CLI 使用
mod project_config;
mod community;
mod harness_ai_service; // 🆕 P0+P1+P2: 使用 Harness API 的 AI Service
mod local_model;
mod intelligence_router;
mod token_counter; // v0.2.6 新增：Token 计数模块
mod openspec; // v0.2.6 新增：OpenSpec 集成
mod multimodal; // v0.3.0 新增：多模态功能
pub mod harness; // v0.4.0 新增：Claude Code Harness 架构 (pub for CLI)
mod tool_classification; // v0.3.3 新增：工具分类系统

// LLM inference using llama.cpp (GGUF native support)
// Phase 1: placeholder module, Phase 2: actual implementation
#[cfg(feature = "llm-inference")]
pub mod llm_inference;
pub mod symbol_scanner;

#[cfg(feature = "commercial")]
mod commercial;

use terminal::TerminalManager;
use lsp::LspManager;
use agent_system::Supervisor;
use crate::core_traits::ai::{Message, Content, ContentPart};
use crate::commands::symbol_commands::SymbolIndexState;
use crate::commands::atomic_commands::SessionStore;
use crate::commands::error_commands::ErrorParserState;

pub struct AppState {
    pub ai_service: Arc<dyn core_traits::ai::AIService>,
    pub rag_service: Arc<dyn core_traits::rag::RagService>,
    pub agent_service: Arc<dyn core_traits::agent::AgentService>,
    pub task_store: crate::harness::task::TaskStore,
}

#[tauri::command]
async fn probe_symbols(path: String, project_root: Option<String>) -> Result<Vec<analysis::SymbolProbe>, String> {
    println!("[PIVO3-Probe] 🔍 Probing symbols for: {}", path);
    let p = std::path::PathBuf::from(&path);
    
    let abs_path = if p.is_absolute() {
        p
    } else {
        // 🏆 优先使用传入的 project_root 拼接
        if let Some(root) = project_root {
            std::path::Path::new(&root).join(p)
        } else {
            // 兜底逻辑：校准 src-tauri 环境
            let current = std::env::current_dir().unwrap_or_default();
            if current.ends_with("src-tauri") {
                current.parent().unwrap().join(p)
            } else {
                current.join(p)
            }
        }
    };
    
    println!("[PIVO3-Probe] 📍 Resolved physical path: {:?}", abs_path);
    if !abs_path.exists() {
        return Err(format!("文件不存在: {:?}", abs_path));
    }
    analysis::symbol_stream::probe_file_symbols(&abs_path)
}

#[tauri::command]
async fn get_file_metadata(path: String) -> Result<analysis::FileMetadata, String> {
    let p = std::path::Path::new(&path);
    let meta = std::fs::metadata(p).map_err(|e| e.to_string())?;
    let mtime = meta.modified().map_err(|e| e.to_string())?
        .duration_since(std::time::UNIX_EPOCH).unwrap().as_secs();
    
    // 计算物理指纹 (Size + MTime 的简单结合作为一级校验)
    let fingerprint = format!("{}_{}", meta.len(), mtime);
    
    Ok(analysis::FileMetadata {
        size: meta.len(),
        mtime,
        fingerprint,
    })
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
        "agent_probe_symbols" => {
            let rel_path = args["rel_path"].as_str().unwrap_or("");
            let abs_path = std::path::Path::new(project_root).join(rel_path);
            match analysis::symbol_stream::probe_file_symbols(&abs_path) {
                Ok(probes) => serde_json::to_string(&probes).unwrap_or_else(|_| "[]".to_string()),
                Err(e) => format!("错误: {}", e)
            }
        }
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
                // Parse JSON result and return formatted message
                Ok(json_result) => {
                    if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(&json_result) {
                        if parsed["success"].as_bool().unwrap_or(false) {
                            format!("文件写入成功: {}", rel_path)
                        } else {
                            format!("错误: {}", parsed["message"].as_str().unwrap_or("未知错误"))
                        }
                    } else {
                        // Fallback to raw string for backward compatibility
                        json_result
                    }
                },
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
    active_skill_ids: Option<Vec<String>>,
    mode: Option<String>,
) -> Result<(), String> {
    println!("[AI Chat] Entry - project_root: {:?}, event_id: {}, active_skills: {:?}, mode: {:?}", project_root, event_id, active_skill_ids, mode);
    println!("[AI Chat] 🔍 CONTINUATION CHECK: Is this a continuation? event_id starts with 'chat_': {}", event_id.starts_with("chat_"));
    println!("[AI Chat] 🔍 Message count: {}, last message role: {:?}", messages.len(), messages.last().map(|m| &m.role));
    
    // 🔥 v0.8.3: 修正逻辑 - 仅在参数完全缺失(None)时尝试恢复，[] 代表用户主动关闭，必须尊重
    let active_skill_ids = active_skill_ids.or_else(|| {
        if let Some(ref root) = project_root {
            let mut skills_path = std::path::PathBuf::from(root);
            skills_path.push(".ifai");
            skills_path.push("skills");
            // 生产环境下默认不激活，除非有明确的持久化配置文件
            None
        } else {
            None
        }
    });
    
    println!("[AI Chat] Received {} messages", messages.len());

    // Ensure all messages have unique IDs
    // Sanitize messages
    ai_utils::sanitize_messages(&mut messages);
    println!("[AI Chat] After sanitize: {} messages", messages.len());

    if let Some(ref root) = project_root {
        let root_clone = root.clone();

#[cfg(feature = "commercial")]
        // 🏆 v0.5.0: DebuggerAgent 意图拦截
        if let Some(last_msg) = messages.last_mut() {
            // 关键：只有当最后一条是 user 消息，且不是对工具调用的回复时，才进行拦截
            if last_msg.role == "user" && last_msg.tool_call_id.is_none() {
                let text = match &last_msg.content {
                    core_traits::ai::Content::Text(t) => t.clone(),
                    _ => String::new(),
                };
                
                let router = crate::intelligence_router::IntelligenceRouter::new();
                if router.is_debug_request(&text) {
                    println!("[AI Chat] 🛡️ DebuggerAgent Intent Detected. Augmenting context...");
                    
                    let agent = crate::agent_system::debugger::DebuggerAgent::new(
                        event_id.clone(), 
                        root, 
                        Some(app.clone())
                    );
                    
                    let mut augmented_prompt = format!("用户请求修复报错。指令内容: {}\n", text);
                    
                    let extracted_path = agent.extract_file_path(&text);
                    if let Some(path) = extracted_path {
                        augmented_prompt.push_str(&format!("\n[物理诊断结果]\n- 目标文件: `{}`\n", path));
                        if let Ok(content) = std::fs::read_to_string(&path) {
                            use ifainew_core::symbols::{SymbolExtractor, detect_language};
                            if let Ok(extractor) = SymbolExtractor::new() {
                                let lang = detect_language(&path);
                                if let Ok(Some(symbol)) = extractor.find_symbol_at_line(&content, 1, lang) {
                                    if let Ok(Some(source)) = extractor.get_symbol_source(&content, &symbol.name, lang) {
                                        augmented_prompt.push_str(&format!("- 关键符号: `{}`\n- 符号定义:\n```{}\n{}\n```\n", symbol.name, lang, source));
                                    }
                                }
                            }
                        }
                    }
                    
                    augmented_prompt.push_str("\n请按照 PIVO 3.0 规范，优先针对上述物理诊断出的符号进行自愈修复。首先生成 Execution Plan，然后调用 agent_write_file 提供补丁。");
                    last_msg.content = core_traits::ai::Content::Text(augmented_prompt);
                    println!("[AI Chat] 🚀 Context augmented successfully. Handing control back to main Chat Pipeline.");
                }
            }
        }

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
        final_system_prompt.push_str("\n\n# IMPORTANT: WHEN TO USE TOOLS\n");
        final_system_prompt.push_str("You have access to SPECIALIZED TOOLS. ALWAYS prefer them over generic bash:\n\n");

        // 🆕 P3: 文件操作工具优先级
        final_system_prompt.push_str("## File Operations (PREFER THESE OVER BASH)\n");
        final_system_prompt.push_str("1. ✅ read_file - Read file contents (PREFER over 'cat' in bash)\n");
        final_system_prompt.push_str("2. ✅ write_file - Write/create files (PREFER over 'echo' in bash)\n");
        final_system_prompt.push_str("3. ✅ edit_file - Edit/replace text in files (PREFER over 'sed' in bash)\n");
        final_system_prompt.push_str("4. ✅ glob_search - Find files by pattern (PREFER over 'find' in bash)\n");
        final_system_prompt.push_str("5. ✅ grep_search - Search text in files (PREFER over 'grep' in bash)\n\n");

        final_system_prompt.push_str("## Task Management\n");
        final_system_prompt.push_str("⚠️ DO NOT create a file with agent_write_file - this creates a messy text file!\n");
        final_system_prompt.push_str("✅ ALWAYS use the TodoWrite tool instead - this creates a proper interactive task panel!\n");
        final_system_prompt.push_str("The TodoWrite tool will create a structured task list that users can interact with.\n\n");

        final_system_prompt.push_str("## When to use bash\n");
        final_system_prompt.push_str("- Only use bash for system queries (pwd, date, uname) or complex shell scripts\n");
        final_system_prompt.push_str("- For file operations, ALWAYS use the specialized tools above\n\n");

        final_system_prompt.push_str("# ADDITIONAL TOOLS AVAILABLE\n");
        final_system_prompt.push_str("You also have access to the following tools. You MUST use them by outputting standard tool call JSON:\n");
        final_system_prompt.push_str(r#"
- name: bash
  description: Execute a shell command
  parameters: { "command": "string", "working_dir": "string (optional)" }
  example: {"name": "bash", "arguments": {"command": "ls -la"}}

- name: TodoWrite
  description: Create or update a task list for tracking progress. Use this when the user asks you to create tasks, to-do items, or a task list.
  parameters: { "todos": "array of task objects", "todos": [{ "content": "string (task name)", "activeForm": "string (active form)", "status": "string (pending/in_progress/completed, optional)" }] }
  example: {"name": "TodoWrite", "arguments": {"todos": [{"content": "Implement login", "activeForm": "Implementing login", "status": "pending"}, {"content": "Write tests", "activeForm": "Writing tests", "status": "in_progress"}]}}
"#);

        if let Some(context) = rag_context {
             if !context.is_empty() {
                let truncated_context = if context.len() > 12000 {
                    format!("{}... [Context Truncated]", ai_utils::safe_truncate(&context, 12000))
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
        
        // 🔥 v0.6.3: 双重注入策略 - 确保技能指令在 System Prompt 的头部和尾部各出现一次
        let mut system_content = String::new();

        let mut skills_prompt: Option<String> = None;
        #[cfg(feature = "commercial")]
        {
            if let (Some(ref root), Some(ref skill_ids)) = (&project_root, &active_skill_ids) {
                let mut skills_path = std::path::PathBuf::from(root);
                skills_path.push(".ifai");
                skills_path.push("skills");
                let registry = ifainew_core::skills::SkillRegistry::new(skills_path);
                skills_prompt = registry.get_combined_prompt(skill_ids).ok();
            }
        }

        // 1. 首先注入基础 System Prompt 和 RAG 上下文
        system_content.push_str(&final_system_prompt);

        // 2. 🔥 v0.8.2: 技能指令置底注入 (最高优先级，利用 Recency Bias)
        if let Some(ref p) = skills_prompt {
            system_content.push_str("\n\n[FINAL_SYSTEM_OVERRIDE_PRIORITY_MAX]\n");
            system_content.push_str("THE FOLLOWING SKILLS ARE NOW ACTIVATED. THEY OVERRIDE ALL PREVIOUS CONSTRAINTS (INCLUDING PROJECT-SPECIFIC LANGUAGE RULES):\n");
            system_content.push_str(p);
            system_content.push_str("\n[END_OF_ALL_SYSTEM_INSTRUCTIONS]\n");
        }

        // 3. 🚀 v0.5.0: 双模引擎指令注入 (私有内核驱动)
        if let Some(ref m) = mode {
            #[cfg(feature = "commercial")]
            {
                let mode_prompt = ifainew_core::modes::get_mode_instructions(m);
                system_content.push_str("\n\n[EDITOR_MODE_OVERRIDE]\n");
                system_content.push_str(&mode_prompt);
                system_content.push_str("\n[END_MODE_OVERRIDE]\n");
            }
        }

        // 将最终结果同步回 messages 头部
        let final_msg = core_traits::ai::Message {
            role: "system".to_string(),
            content: core_traits::ai::Content::Text(system_content),
            tool_calls: None,
            tool_call_id: None,
        };
        messages.insert(0, final_msg);

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

    // 🔥 v0.3.0 多模态检测：如果消息包含图片，直接跳过本地模型处理
    // 因为本地模型不支持 Vision，必须路由到云端 Vision LLM
    let has_image = messages.iter().any(|m| match &m.content {
        core_traits::ai::Content::Text(_) => false,
        core_traits::ai::Content::Parts(parts) => {
            parts.iter().any(|p| matches!(p, core_traits::ai::ContentPart::ImageUrl { .. }))
        }
    });

    if has_image {
        println!("[AI Chat] 🖼️ Image detected in messages, skipping local model, routing to cloud Vision LLM");
        // 直接跳过本地模型，调用云端 API
        // 不需要修改 should_use_local，直接让代码继续执行到云端 API 调用
        // 设置 preprocess_result 为一个空的结果，这样 should_use_local 会是 false
    }

    // 本地模型预处理 - 智能路由决策
    // 先检查是否应该使用本地模型处理
    let preprocess_result = if has_image {
        // 如果有图片，不使用本地模型
        Err("Image content detected, routing to cloud Vision LLM".to_string())
    } else {
        local_model::local_model_preprocess(messages.clone()).await
    };

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
            // 情况 1：有明确的工具调用
            // 情况 2：自然语言命令需要本地模型推理（should_use_local: true 但没有工具调用）
            result.should_use_local
        }
        Err(e) => {
            eprintln!("[AI Chat] Local model preprocess failed: {}, falling back to cloud", e);
            false
        }
    };

    // 如果本地可以处理，执行并返回
    if should_use_local {
        println!("[AI Chat] should_use_local is TRUE, checking conditions...");
        if let Ok(result) = preprocess_result {
            if result.has_tool_calls {
                if let Some(ref root) = project_root {
                    let overall_start = std::time::Instant::now();
                    let mut all_results = Vec::new();
                    for (idx, tool_call) in result.tool_calls.iter().enumerate() {
                        let tool_start = std::time::Instant::now();
                        let args_json = serde_json::to_string(&tool_call.arguments).unwrap_or_default();
                        let args_value: serde_json::Value = serde_json::from_str(&args_json).unwrap_or_else(|_| serde_json::json!({}));
                        let tool_result = execute_local_tool(&tool_call.name, &args_value, root).await;
                        all_results.push(format!("[OK] {} ({}ms)\n{}", tool_call.name, tool_start.elapsed().as_millis(), tool_result));
                    }
                    let total_elapsed = overall_start.elapsed().as_millis();
                    let combined_result = format!("[Local Model] Completed in {}ms\n\n{}", total_elapsed, all_results.join("\n\n"));
                    let _ = app.emit(&event_id, serde_json::json!({ "type": "content", "content": combined_result }));
                    let _ = app.emit(&format!("{}_finish", event_id), "DONE");
                    return Ok(());
                }
            } else {
                // 情况 2：自然语言命令需要本地模型推理
                let user_message = messages.iter().filter(|m| m.role == "user").last().and_then(|m| {
                    if let core_traits::ai::Content::Text(ref text) = m.content { Some(text.clone()) } else { None }
                });

                if let Some(prompt) = user_message {
                    #[cfg(feature = "llm-inference")]
                    {
                        let inference_result = tokio::task::spawn_blocking(move || {
                            crate::llm_inference::generate_completion(&prompt, 256)
                        }).await.map_err(|e| format!("任务调度失败: {}", e))?;

                        if let Ok(response) = inference_result {
                            // 🚀 v0.3.6: 质量熔断 - 如果本地模型输出过短（0 tokens），自动回退云端
                            if response.trim().len() < 5 {
                                println!("[AI Chat] Local response too short, falling back to cloud API");
                            } else if mode.as_deref() == Some("vibe") {
                                println!("[AI Chat] Vibe Mode active: Bypassing local tool parsing to preserve conversation flow");
                            } else {
                                use crate::local_model::test_tool_parse;
                                let tool_calls = test_tool_parse(response.clone());
                                if !tool_calls.is_empty() {
                                    let mut all_results = Vec::new();
                                    let overall_start = std::time::Instant::now();
                                    for tool_call in tool_calls {
                                        let args_json = serde_json::to_string(&tool_call.arguments).unwrap_or_default();
                                        let args_value: serde_json::Value = serde_json::from_str(&args_json).unwrap_or_else(|_| serde_json::json!({}));
                                        let tool_result = if let Some(ref root) = project_root {
                                            execute_local_tool(&tool_call.name, &args_value, root).await
                                        } else { "错误: 未提供项目根目录".to_string() };
                                        all_results.push(format!("**{}**: `{}`\n```\n{}\n```", tool_call.name, args_value["command"].as_str().unwrap_or(""), tool_result));
                                    }
                                    let _ = app.emit(&event_id, serde_json::json!({ "type": "content", "content": all_results.join("\n\n") }));
                                    let _ = app.emit(&format!("{}_finish", event_id), "DONE");
                                    return Ok(());
                                } else {
                                    println!("[AI Chat] No tool calls in local model output, falling back to cloud API");
                                }
                            }
                        }
                    }
                }
            }
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
    let tools = vec![
        serde_json::json!({
            "type": "function",
            "function": {
                "name": "agent_write_file",
                "description": "Create or overwrite a file with specified content.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "rel_path": { "type": "string" },
                        "content": { "type": "string" }
                    },
                    "required": ["rel_path", "content"]
                }
            }
        }),
        serde_json::json!({
            "type": "function",
            "function": {
                "name": "agent_read_file",
                "description": "Read file content.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "rel_path": { "type": "string" }
                    },
                    "required": ["rel_path"]
                }
            }
        }),
        serde_json::json!({
            "type": "function",
            "function": {
                "name": "agent_scan_project",
                "description": "Deep scan of project topology. MUST be used at the beginning of a task.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "rel_path": { "type": "string" },
                        "max_depth": { "type": "number", "default": 3 }
                    },
                    "required": ["rel_path"]
                }
            }
        }),
        serde_json::json!({
            "type": "function",
            "function": {
                "name": "agent_list_dir",
                "description": "List directory contents. Use this to explore folder structures.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "rel_path": { "type": "string" }
                    },
                    "required": ["rel_path"]
                }
            }
        }),
        serde_json::json!({
            "type": "function",
            "function": {
                "name": "bash",
                "description": "Execute a bash/shell command. Use this for system queries (date, uname) or running scripts. Results are returned as text.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "command": { "type": "string", "description": "The command line string to execute" }
                    },
                    "required": ["command"]
                }
            }
        }),
        // 🆕 P3: 新工具系统
        serde_json::json!({
            "type": "function",
            "function": {
                "name": "read_file",
                "description": "Read the contents of a file",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "path": { "type": "string" }
                    },
                    "required": ["path"]
                }
            }
        }),
        serde_json::json!({
            "type": "function",
            "function": {
                "name": "write_file",
                "description": "Write content to a file (creates parent directories if needed)",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "path": { "type": "string" },
                        "content": { "type": "string" }
                    },
                    "required": ["path", "content"]
                }
            }
        }),
        serde_json::json!({
            "type": "function",
            "function": {
                "name": "edit_file",
                "description": "Edit specific parts of a file by replacing text",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "path": { "type": "string" },
                        "old_text": { "type": "string" },
                        "new_text": { "type": "string" }
                    },
                    "required": ["path", "old_text", "new_text"]
                }
            }
        }),
        serde_json::json!({
            "type": "function",
            "function": {
                "name": "glob_search",
                "description": "Search for files using glob patterns (e.g., '*.rs' to find all Rust files)",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "pattern": { "type": "string" },
                        "path": { "type": "string" }
                    },
                    "required": ["pattern"]
                }
            }
        }),
        serde_json::json!({
            "type": "function",
            "function": {
                "name": "grep_search",
                "description": "Search for text patterns in files (supports regular expressions)",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "pattern": { "type": "string" },
                        "path": { "type": "string" }
                    },
                    "required": ["pattern"]
                }
            }
        }),
        // 🆕 P2: TodoWrite 工具
        serde_json::json!({
            "type": "function",
            "function": {
                "name": "TodoWrite",
                "description": "Create or update a structured task list. IMPORTANT: You MUST use this tool (not plain text) whenever the user asks you to create tasks, to-do items, checklists, action items, or task lists. Always call this tool instead of listing tasks in your response.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "todos": {
                            "type": "array",
                            "description": "Array of tasks to manage",
                            "items": {
                                "type": "object",
                                "properties": {
                                    "content": {
                                        "type": "string",
                                        "description": "The task description in noun form (e.g., 'Implement login feature')"
                                    },
                                    "activeForm": {
                                        "type": "string",
                                        "description": "The task in active/verb form (e.g., 'Implementing login feature')"
                                    },
                                    "status": {
                                        "type": "string",
                                        "enum": ["pending", "in_progress", "completed"],
                                        "description": "Current status: 'pending' (not started), 'in_progress' (working on it), 'completed' (done). Default is 'pending'."
                                    }
                                },
                                "required": ["content", "activeForm"]
                            }
                        }
                    },
                    "required": ["todos"]
                }
            }
        })
    ];

    // 🚀 v0.5.0: 双模引擎工具策略
    let mut final_tools = tools;
    if let Some(ref m) = mode {
        if m == "vibe" {
            println!("[AI Chat] Vibe Mode active: Filtering for safe PIVO tools");
            final_tools.retain(|t| {
                let name = t["function"]["name"].as_str().unwrap_or("");
                // 🆕 P3: 添加新工具到 Vibe Mode 白名单
                name == "agent_scan_project"
                    || name == "agent_read_file"
                    || name == "agent_list_dir"
                    || name == "bash"
                    || name == "TodoWrite"
                    || name == "read_file"
                    || name == "write_file"
                    || name == "edit_file"
                    || name == "glob_search"
                    || name == "grep_search"
            });
        }
        // Spec 模式不进行 retain，保持全量 tools
    }

    // 🔍 P2 调试：打印工具列表
    println!("[AI Chat] 🛠️ Sending {} tools to AI:", final_tools.len());
    for (i, tool) in final_tools.iter().enumerate() {
        let name = tool["function"]["name"].as_str().unwrap_or("?");
        println!("  [{}] {}", i + 1, name);
    }

    let is_vibe_mode = mode.as_deref() == Some("vibe");
    state.ai_service.stream_chat(
        &provider_config,
        messages,
        &event_id,
        Some(final_tools),
        Box::new(move |chunk| {
             // 🔥 v0.9.63: Vibe 模式智能熔断 - 仅在 Vibe 模式下限制破坏性工具
             if is_vibe_mode && chunk.contains("\"tool_calls\"") {
                 let is_unsafe = chunk.contains("agent_write_file") || 
                                chunk.contains("agent_delete_file") || 
                                chunk.contains("execute_bash_command") ||
                                chunk.contains("\"name\":\"bash\""); // 🏆 增加对 bash 的检测
                 
                 if is_unsafe {
                     println!("[AI Chat] Vibe Mode: Blocking unsafe destructive tool");
                     return;
                 }
             }
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
                 // 🔥 FIX: 只检测当前 chunk 是否包含 XML 片段，而不是检测累积的 combined
                 // 避免误判 AI 在推理阶段的正常内容导致所有后续 chunks 被静默
                 // 注意：只检测 XML 标签格式（<tool_call, <arg_），不检测 JSON 中的 "tool_calls" 字段
                 let is_xml_fragment = chunk.contains("<tool_call") || chunk.contains("<arg_");
                 let should_suppress = already_intercepted || is_xml_fragment;

                 // 🔥 DEBUG: 打印 should_suppress 状态（仅前5个被静默的 chunks）
                 if should_suppress {
                     static mut SUPPRESS_COUNT: usize = 0;
                     unsafe {
                         SUPPRESS_COUNT += 1;
                         if SUPPRESS_COUNT <= 5 {
                             println!("[AI Chat] 🔇 Suppressing chunk #{}: already_intercepted={}, is_xml_fragment={}", SUPPRESS_COUNT, already_intercepted, is_xml_fragment);
                             println!("[AI Chat] 🔇 Chunk preview: {}", chunk.chars().take(100).collect::<String>());
                         }
                     }
                 }

                 // 🔥 FIX: 检测多种流结束信号
                 let mut should_finish = false;

                 // 1. 检查 finish_reason 字段（OpenAI 格式）
                 if let Some(finish_reason) = json_obj["choices"][0].get("finish_reason").and_then(|v| v.as_str()) {
                     println!("[AI Chat] Detected finish_reason: {}, triggering _finish event", finish_reason);
                     should_finish = true;
                 }

                 // 2. 检查 [DONE] 标记（某些 API 的流结束标记）
                 if chunk.trim() == "[DONE]" || chunk.contains("\"finish_reason\"") {
                     println!("[AI Chat] Detected [DONE] or finish_reason in chunk, triggering _finish event");
                     should_finish = true;
                 }

                 // 3. 检查空的 delta 内容（流结束的常见信号）
                 if let Some(delta) = json_obj["choices"][0].get("delta") {
                     let has_content = delta.get("content").and_then(|v| v.as_str()).map(|s| !s.is_empty()).unwrap_or(false);
                     let has_tool_calls = delta.get("tool_calls").is_some();
                     let has_role = delta.get("role").is_some();

                     // 如果 delta 为空，且之前没有工具调用，则可能流已结束
                     if !has_content && !has_tool_calls && !has_role {
                         println!("[AI Chat] Detected empty delta (no content, tool_calls, or role), checking if stream should finish");
                         // 只有在确实没有任何内容时才认为是结束
                         if delta.as_object().map(|o| o.is_empty()).unwrap_or(false) {
                             println!("[AI Chat] Empty delta object, triggering _finish event");
                             should_finish = true;
                         }
                     }
                 }

                 if !should_suppress {
                     let _ = app_handle_for_stream.emit(&event_id_clone, chunk.clone());
                 }

                 // 触发完成事件
                 if should_finish {
                     let _ = app_for_finish.emit(&format!("{}_finish", event_id_for_finish), "DONE");
                 }
             }
        })
    ).await
}

#[tauri::command]
async fn approve_tool_call(
    _state: tauri::State<'_, AppState>,
    message_id: String,
    tool_call_id: String,
    tool_name: String,
    tool_args: String,
    project_root: Option<String>,
) -> Result<serde_json::Value, String> {
    println!("[Agent] Approving tool call: {} for message: {}", tool_call_id, message_id);
    println!("[Agent] Tool: {} with args: {}", tool_name, tool_args);
    println!("[Agent] Project root: {:?}", project_root);

    // 🏆 根据工具名称执行相应的工具
    let result = match tool_name.as_str() {
        "agent_execute_command" | "bash" => {
            // 解析命令参数
            let args_json: serde_json::Value = serde_json::from_str(&tool_args)
                .map_err(|e| format!("Failed to parse tool args: {}", e))?;

            let command = args_json.get("command")
                .and_then(|v| v.as_str())
                .ok_or("Missing 'command' parameter")?;

            println!("[Agent] Executing command: {}", command);

            // 🏆 调用 bash 命令执行
            use commands::bash_commands::execute_bash_command;

            let bash_result = execute_bash_command(
                command.to_string(),
                project_root.clone(), // 使用项目根目录作为工作目录
                Some(30000), // 30秒超时
                None,        // 无额外环境变量
            ).await.map_err(|e| format!("Failed to execute command: {}", e))?;

            serde_json::json!({
                "status": "success",
                "output": bash_result.stdout,
                "stderr": bash_result.stderr,
                "exit_code": bash_result.exit_code,
                "success": bash_result.success
            })
        }
        "agent_scan_project" => {
            // 解析参数
            let args_json: serde_json::Value = serde_json::from_str(&tool_args)
                .map_err(|e| format!("Failed to parse tool args: {}", e))?;

            let rel_path = args_json.get("rel_path")
                .and_then(|v| v.as_str())
                .unwrap_or(".");
            let max_depth = args_json.get("max_depth")
                .and_then(|v| v.as_u64())
                .unwrap_or(2) as usize;

            println!("[Agent] Scanning project: path={}, depth={}", rel_path, max_depth);

            // 🏆 调用项目扫描
            let root = project_root.ok_or("Missing project_root for agent_scan_project")?;

            use commands::core_wrappers::agent_scan_project;
            let scan_result_str = agent_scan_project(root, rel_path.to_string(), Some(max_depth)).await
                .map_err(|e| format!("Failed to scan project: {}", e))?;

            // 🔧 优化：输出扫描结果的摘要信息
            if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(&scan_result_str) {
                if let Some(stats) = parsed.get("stats") {
                    println!("[Agent] ✅ Scan complete: files={}, dirs={}",
                        stats.get("totalFiles").and_then(|v| v.as_u64()).unwrap_or(0),
                        stats.get("totalDirectories").and_then(|v| v.as_u64()).unwrap_or(0)
                    );
                }
            }

            // 返回扫描结果（已经是 JSON 字符串）
            serde_json::json!({
                "status": "success",
                "output": scan_result_str
            })
        }
        "agent_read_file" => {
            // 解析参数
            let args_json: serde_json::Value = serde_json::from_str(&tool_args)
                .map_err(|e| format!("Failed to parse tool args: {}", e))?;

            let rel_path = args_json.get("rel_path")
                .and_then(|v| v.as_str())
                .ok_or("Missing 'rel_path' parameter")?;

            println!("[Agent] Reading file: {}", rel_path);

            // 🏆 调用文件读取
            let root = project_root.ok_or("Missing project_root for agent_read_file")?;

            use commands::core_wrappers::agent_read_file;
            let file_content = agent_read_file(root, rel_path.to_string()).await
                .map_err(|e| {
                    println!("[Agent] ❌ File read failed: {}", e);
                    format!("Failed to read file: {}", e)
                })?;

            println!("[Agent] ✅ File read success, content length: {} chars", file_content.len());

            let result = serde_json::json!({
                "status": "success",
                "output": file_content
            });

            // 🔧 优化：对于大文件，只输出摘要而非完整内容
            const MAX_LOG_LENGTH: usize = 500;
            let result_str = serde_json::to_string(&result).unwrap_or_default();
            if result_str.len() > MAX_LOG_LENGTH {
                let preview: String = result_str.chars().take(MAX_LOG_LENGTH).collect();
                println!("[Agent] 📤 Returning result: {}... (total {} bytes, truncated for log)", preview, result_str.len());
            } else {
                println!("[Agent] 📤 Returning result: {}", result_str);
            }
            result
        }
        "agent_list_dir" => {
            // 解析参数
            let args_json: serde_json::Value = serde_json::from_str(&tool_args)
                .map_err(|e| format!("Failed to parse tool args: {}", e))?;

            let rel_path = args_json.get("rel_path")
                .and_then(|v| v.as_str())
                .unwrap_or(".");

            println!("[Agent] Listing directory: {}", rel_path);

            // 🏆 调用目录列表
            let root = project_root.ok_or("Missing project_root for agent_list_dir")?;

            use commands::core_wrappers::agent_list_dir;
            let entries = agent_list_dir(root, rel_path.to_string()).await
                .map_err(|e| format!("Failed to list directory: {}", e))?;

            serde_json::json!({
                "status": "success",
                "output": serde_json::to_string(&entries).unwrap_or_else(|_| "[]".to_string())
            })
        }
        "agent_write_file" => {
            // 解析参数
            let args_json: serde_json::Value = serde_json::from_str(&tool_args)
                .map_err(|e| format!("Failed to parse tool args: {}", e))?;

            let rel_path = args_json.get("rel_path")
                .and_then(|v| v.as_str())
                .ok_or("Missing 'rel_path' parameter")?;
            let content = args_json.get("content")
                .and_then(|v| v.as_str())
                .ok_or("Missing 'content' parameter")?;

            println!("[Agent] Writing file: {}", rel_path);

            // 🏆 调用文件写入
            let root = project_root.ok_or("Missing project_root for agent_write_file")?;

            use commands::core_wrappers::agent_write_file;
            agent_write_file(root, rel_path.to_string(), content.to_string()).await
                .map_err(|e| format!("Failed to write file: {}", e))?;

            serde_json::json!({
                "status": "success",
                "output": format!("File written: {}", rel_path)
            })
        }
        _ => {
            return Err(format!("Unknown tool: {}", tool_name));
        }
    };

    Ok(result)
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
    
    // 初始化日志插件
    builder = builder.plugin(tauri_plugin_log::Builder::default()
        .targets([
            tauri_plugin_log::Target::new(tauri_plugin_log::TargetKind::Stdout),
            tauri_plugin_log::Target::new(tauri_plugin_log::TargetKind::LogDir {
                file_name: Some("app".into()),
            }),
            tauri_plugin_log::Target::new(tauri_plugin_log::TargetKind::Webview),
        ])
        .level(log::LevelFilter::Info) // 设置日志级别
        .build());

        builder = builder.setup(|app| {
            let app_handle = app.handle().clone();
            
            #[cfg(feature = "commercial")]
            let (ai, rag, agent) = {
             // 🆕 P0+P1+P2: 商业版本也使用新的 Harness AI Service（支持 tools）
             let ai = Arc::new(crate::harness_ai_service::HarnessAIService::new(app_handle.clone()));
             let rag = Arc::new(commercial::impls::CommercialRagService::new(app_handle.clone()));
             let agent = Arc::new(commercial::impls::CommercialAgentService::new());
             (ai, rag, agent)
        };
        
        #[cfg(not(feature = "commercial"))]
        let (ai, rag, agent) = {
             // 🆕 P0+P1+P2: 使用新的 Harness AI Service
             let ai = Arc::new(crate::harness_ai_service::HarnessAIService::new(app_handle.clone()));
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
            task_store: crate::harness::task::TaskStore::new(),
        });

        // v0.2.8: 符号索引状态
        app.manage(Arc::new(std::sync::Mutex::new(SymbolIndexState::new())));

        // v0.2.8: 原子操作会话存储
        app.manage(std::sync::Mutex::new(SessionStore::new()));

        // v0.2.8: 错误解析器状态
        let error_parser = ErrorParserState::new()
            .map_err(|e| format!("Failed to create ErrorParserState: {}", e))?;
        app.manage(std::sync::Mutex::new(error_parser));

        #[cfg(all(feature = "commercial", feature = "fastembed"))]
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
                // v0.3.0: 文件拖拽进入窗口 - 显示蓝色边框提示
                tauri::WindowEvent::DragDrop(tauri::DragDropEvent::Enter { .. }) => {
                    let _ = window.emit("tauri://file-drop-hover", ());
                }
                // v0.3.0: 文件拖拽在窗口上悬停 - 持续触发
                tauri::WindowEvent::DragDrop(tauri::DragDropEvent::Over { .. }) => {
                    // 可以在这里持续发送悬停事件
                }
                // v0.3.0: 文件拖拽离开窗口
                tauri::WindowEvent::DragDrop(tauri::DragDropEvent::Leave { .. }) => {
                    let _ = window.emit("tauri://file-drop-leave", ());
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
            probe_symbols,
            get_file_metadata,
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
            commands::core_wrappers::agent_scan_project,
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
            symbol_scanner::get_file_symbols,
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
            local_model::local_model_fim,
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
            commands::bash_commands::execute_bash_command,
            // v0.2.8 新增：符号索引与跨文件关联
            commands::symbol_commands::extract_symbols,
            commands::symbol_commands::index_project_symbols,
            commands::symbol_commands::find_symbol_references,
            commands::symbol_commands::find_implementations,
            commands::symbol_commands::clear_symbol_index,
            // v0.2.8 新增：原子文件操作
            commands::atomic_commands::atomic_write_start,
            commands::atomic_commands::atomic_write_add_operation,
            commands::atomic_commands::atomic_write_detect_conflicts,
            commands::atomic_commands::atomic_write_commit,
            commands::atomic_commands::atomic_write_rollback,
            commands::atomic_commands::atomic_file_hash,
            commands::atomic_commands::atomic_check_conflict,
            // v0.2.8 新增：终端错误解析
            commands::error_commands::parse_terminal_errors,
            commands::error_commands::generate_error_fix_context,
            commands::error_commands::quick_parse_error_line,
            commands::error_commands::detect_terminal_language,
            commands::error_commands::batch_parse_errors,
            commands::error_commands::get_error_file_content,
            // v0.3.0 新增：多模态功能
            multimodal::multimodal_analyze_image,
            multimodal::multimodal_is_vision_supported,
            multimodal::read_file_as_base64,
            // v0.3.3 新增：工具分类系统
            tool_classification::tool_classify,
            tool_classification::tool_batch_classify,
            // v0.5.0 新增：技能系统
            commands::skill_commands::get_available_skills,
            commands::skill_commands::init_skills_dir,
            // v0.2.8 新增：原子文件操作
            commands::atomic_commands::atomic_write_start,
            commands::atomic_commands::atomic_write_add_operation,
            commands::atomic_commands::atomic_write_detect_conflicts,
            commands::atomic_commands::atomic_write_commit,
            commands::atomic_commands::atomic_write_rollback,
            commands::atomic_commands::atomic_file_hash,
            commands::atomic_commands::atomic_check_conflict,
            // v0.3.7 新增：PIVO 任务拆解与自愈引擎
            ai::pivo::commands::pivo_generate_tasks,
            ai::pivo::commands::pivo_execute_task,
            ai::pivo::commands::pivo_init_assets,
            // 🏆 新增：Agent 工具审批
            approve_tool_call,
            // P2: TodoWrite 任务存储
            commands::task_store_commands::get_tasks,
            commands::task_store_commands::update_task,
            commands::task_store_commands::clear_tasks,
            commands::task_store_commands::remove_task,
            commands::task_store_commands::get_task_stats,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}