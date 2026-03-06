use tauri::{AppHandle, Emitter};
use crate::agent_system::base::{AgentStatus, AgentContext, PivoStage};
use crate::agent_system::supervisor::Supervisor;
use crate::agent_system::tools;
use crate::prompt_manager;
use crate::ai_utils;
use crate::core_traits::ai::{Message, Content};
use serde_json::{json, Value};

pub async fn run_agent_task(
    app: AppHandle,
    supervisor: Supervisor,
    id: String,
    agent_type: String,
    context: AgentContext,
) {
    let event_id = format!("agent_{}", id);

    // 🔥 使用 app.emit 发送日志到前端控制台
    let _ = app.emit(&event_id, json!({
        "type": "log",
        "message": format!("[AgentRunner] 🔥🔥🔥 run_agent_task ENTRY - id: {}, agent_type: '{}'", id, agent_type)
    }));

    println!("[AgentRunner] Starting task for: {} ({}), event_id: {}", id, agent_type, event_id);
    
    let mut history: Vec<Message> = Vec::new();
    let mut created_files: Vec<String> = Vec::new();
    let mut last_ai_summary = String::new();
    let mut pivo_stage = PivoStage::Idle;
    let mut retry_count = 0;
    const MAX_RETRY_PER_STEP: usize = 3;
    
    let system_prompt = prompt_manager::get_agent_prompt(&agent_type, &context.project_root, &context.task_description);
    
    history.push(Message {
        role: "system".to_string(),
        content: Content::Text(system_content_with_tools(&system_prompt)),
        tool_calls: None,
        tool_call_id: None,
    });

    history.push(Message {
        role: "user".to_string(),
        content: Content::Text(context.task_description.clone()),
        tool_calls: None,
        tool_call_id: None,
    });

    let _ = supervisor.update_status(&id, AgentStatus::Running).await;

    // 🏆 PIVO 3.0: 动态工具管线
    // 根据 Agent 类型，通过物理模板引擎动态获取工具定义
    let tool_ids = match agent_type.as_str() {
        "bash" | "/bash" => vec!["bash", "read", "list"],
        "demo" | "/demo" | "Demo Agent" => vec!["write", "read", "bash"],
        _ => vec!["list", "read", "batch_read", "scan_directory", "write", "bash", "probe"],
    };

    let tools = crate::prompt_manager::get_dynamic_tools(&context.project_root, tool_ids);

    // 🏆 PIVO 3.0: 认知回路重构 - 确保 Agent 优先使用符号探测
    let mut loop_count = 0;
    const MAX_LOOPS: usize = 12;

    while loop_count < MAX_LOOPS {
        loop_count += 1;

        // 初始进入或重试时处于 Plan 阶段
        pivo_stage = if retry_count > 0 { PivoStage::Optimize } else { PivoStage::Plan };
        let _ = app.emit("pivo_stage", json!({ "id": id, "stage": pivo_stage }));

        let _ = app.emit("agent:status", json!({ "id": id, "status": "running", "progress": 0.15 + (loop_count as f32 * 0.05) }));
        let _ = app.emit(&event_id, json!({ "type": "status", "status": "running", "progress": 0.15 + (loop_count as f32 * 0.05) }));
        let _ = app.emit(&event_id, json!({ "type": "thinking", "content": "\n🤔 正在思考..." }));

        match ai_utils::agent_stream_chat_with_root(
            &app,
            &context.provider_config,
            history.clone(),
            &id,
            Some(tools.clone()),
            Some(context.project_root.clone()),
            Some(agent_type.clone())
        ).await {
            Ok(ai_message) => {
                if let Content::Text(ref text) = ai_message.content {
                    if !text.is_empty() { last_ai_summary = text.clone(); }
                }

                if let Some(tool_calls) = &ai_message.tool_calls {
                    if tool_calls.is_empty() { break; }
                    history.push(ai_message.clone());

                    // 进入 Implement 阶段
                    pivo_stage = PivoStage::Implement;
                    let _ = app.emit("pivo_stage", json!({ "id": id, "stage": pivo_stage }));

                    for (idx, tool_call) in tool_calls.iter().enumerate() {
                        let tool_name = &tool_call.function.name;
                        let args_res: Result<Value, _> = serde_json::from_str(&tool_call.function.arguments);

                        let _ = app.emit(&event_id, json!({ "type": "thinking", "content": format!("\n🔧 正在处理工具: {}...\n", tool_name) }));

                        let (tool_result, _success) = match args_res {
                            Ok(args) => {
                                let tool_id = tool_call.id.clone();
                                let _ = app.emit(&event_id, json!({
                                    "type": "tool_call",
                                    "toolCall": { "id": tool_id, "tool": tool_name, "args": args, "isPartial": false }
                                }));

                                let _ = supervisor.update_status(&id, AgentStatus::WaitingForTool).await;
                                let _ = app.emit("agent:status", json!({ "id": id.clone(), "status": "waitingfortool" }));
                                let _ = app.emit(&event_id, json!({ "type": "status", "status": "waitingfortool" }));

                                let approved = supervisor.wait_for_approval(id.clone()).await;
                                
                                if approved {
                                    let _ = app.emit("agent:status", json!({ "id": id, "status": "running" }));
                                    let _ = app.emit(&event_id, json!({ "type": "status", "status": "running" }));
                                    let _ = app.emit(&event_id, json!({ "type": "thinking", "content": format!("\n🚀 正在执行: {}...\n", tool_name) }));
                                }

                                let _ = supervisor.update_status(&id, if approved { AgentStatus::Running } else { AgentStatus::Stopped }).await;

                                if !approved {
                                    ("User rejected the operation.".to_string(), false)
                                } else {
                                    if tool_name == "agent_write_file" {
                                        if let Some(path) = args["rel_path"].as_str() { created_files.push(path.to_string()); }
                                    }

                                    let (tool_result, is_success) = if tool_name == "agent_scan_directory" {
                                        let rel_path = args["rel_path"].as_str().or_else(|| args["path"].as_str()).unwrap_or(".").to_string();
                                        let pattern = args["pattern"].as_str().map(|s| s.to_string());
                                        let max_depth = args["max_depth"].as_u64().map(|v| v as usize);
                                        let max_files = args["max_files"].as_u64().map(|v| v as usize);

                                        match crate::commands::core_wrappers::agent_scan_directory_with_progress(
                                            &app, &event_id, context.project_root.clone(), rel_path, pattern, max_depth, max_files
                                        ).await {
                                            Ok(res) => (res, true),
                                            Err(e) => (format!("Error: {}", e), false)
                                        }
                                    } else {
                                        match tools::execute_tool_internal(tool_name, &args, &context.project_root).await {
                                            Ok(res) => (res, true),
                                            Err(e) => (format!("Error: {}", e), false)
                                        }
                                    };

                                    // 处理自愈
                                    if !is_success && retry_count < MAX_RETRY_PER_STEP {
                                        retry_count += 1;
                                        pivo_stage = PivoStage::Optimize;
                                    } else if is_success {
                                        retry_count = 0; 
                                    }

                                    (tool_result, true)
                                }
                            },
                            Err(e) => (format!("Failed to parse arguments: {}", e), false)
                        };

                        let tool_id = tool_call.id.clone();
                        let _ = app.emit(&event_id, json!({
                            "type": "tool_result",
                            "toolCallId": tool_id,
                            "result": tool_result,
                            "success": _success
                        }));

                        history.push(Message {
                            role: "tool".to_string(),
                            content: Content::Text(tool_result),
                            tool_calls: None,
                            tool_call_id: Some(tool_call.id.clone()),
                        });
                    }
                } else { break; }
            },
            Err(e) => {
                let _ = app.emit(&event_id, json!({ "type": "error", "error": e }));
                let _ = app.emit("agent:status", json!({ "id": id, "status": "failed", "error": e }));
                return;
            }
        }
    }

    let mut final_output = if !last_ai_summary.is_empty() { last_ai_summary } else { format!("Agent {} has completed the task.", agent_type) };

    if !created_files.is_empty() {
        final_output.push_str("\n\n### 📝 Changes Applied:\n");
        for file in created_files { final_output.push_str(&format!("- ✅ `{}`\n", file)); }
    }

    let _ = supervisor.update_status(&id, AgentStatus::Completed).await;
    let _ = app.emit("agent:status", json!({ "id": id, "status": "completed", "progress": 1.0 }));
    let _ = app.emit(&event_id, json!({ "type": "status", "status": "completed", "progress": 1.0 }));

    let _ = app.emit(&event_id, json!({ "type": "result", "result": final_output }));
    let _ = app.emit("agent:result", json!({ "id": id, "output": final_output }));
}

fn system_content_with_tools(base: &str) -> String {
    // 🏆 PIVO 3.0: 引入 Symbol-First 认知准则
    format!("{}\n\n## Tool Usage Guidelines\n\n- **ALWAYS use tools** for file operations (agent_read_file, agent_write_file, etc.)\n- **Efficiency First**: For large files (>10KB), you MUST use agent_probe_symbols first to understand the structure before reading content.\n- For writing files: use the agent_write_file tool with the full content\n- The agent_write_file tool will **automatically** wait for user approval\n- **Bash execution**: When using the agent_bash tool, the 'command' parameter should be the actual shell command.\n- Show the code you intend to write clearly in the tool's content parameter\n- Never ask \"请确认是否同意\" - always use the tool directly", base)
}
