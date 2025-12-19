use tauri::{AppHandle, Emitter};
use crate::agent_system::base::{AgentStatus, AgentContext};
use crate::agent_system::supervisor::Supervisor;
use crate::agent_system::tools;
use crate::prompt_manager;
use crate::ai_utils;
use ifainew_core::ai::{Message, Content, ToolCall};
use serde_json::{json, Value};

pub async fn run_agent_task(
    app: AppHandle,
    supervisor: Supervisor,
    id: String,
    agent_type: String,
    context: AgentContext,
) {
    println!("[AgentRunner] Starting task for: {} ({})", id, agent_type);

    // Initial Setup
    let mut history: Vec<Message> = Vec::new();
    let mut created_files: Vec<String> = Vec::new(); // Track created/modified files

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

    // Define available tools
    let tools = vec![
        json!({
            "type": "function",
            "function": {
                "name": "agent_list_dir",
                "description": "List files in a directory",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "rel_path": { "type": "string", "description": "Relative path to directory" }
                    }
                }
            }
        }),
        json!({
            "type": "function",
            "function": {
                "name": "agent_read_file",
                "description": "Read content of a file",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "rel_path": { "type": "string", "description": "Relative path to file" }
                    },
                    "required": ["rel_path"]
                }
            }
        }),
        json!({
            "type": "function",
            "function": {
                "name": "agent_write_file",
                "description": "Write content to a file",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "rel_path": { "type": "string", "description": "Relative path to file" },
                        "content": { "type": "string", "description": "File content" }
                    },
                    "required": ["rel_path", "content"]
                }
            }
        })
    ];

    let mut loop_count = 0;
    const MAX_LOOPS: usize = 12;
    let mut final_ai_summary = String::new();

    while loop_count < MAX_LOOPS {
        loop_count += 1;
        let _ = app.emit("agent:status", json!({ "id": id, "status": "running", "progress": 0.15 + (loop_count as f32 * 0.05) }));
        let _ = app.emit("agent:log", json!({ "id": id, "message": "AI is thinking..." }));

        match ai_utils::agent_stream_chat(&app, &context.provider_config, history.clone(), &id, Some(tools.clone())).await {
            Ok(ai_message) => {
                // Content is already streamed to frontend by agent_stream_chat
                if let Content::Text(ref text) = ai_message.content {
                    if !text.is_empty() {
                         final_ai_summary = text.clone();
                    }
                }

                if let Some(tool_calls) = &ai_message.tool_calls {
                    if tool_calls.is_empty() { break; }
                    history.push(ai_message.clone());

                    for tool_call in tool_calls {
                        let tool_name = &tool_call.function.name;
                        let args_res: Result<Value, _> = serde_json::from_str(&tool_call.function.arguments);

                        let _ = app.emit("agent:log", json!({ "id": id, "message": format!("Executing tool: {}", tool_name) }));

                        let (tool_result, _success) = match args_res {
                            Ok(args) => {
                                if tool_name == "agent_write_file" {
                                    if let Some(path) = args["rel_path"].as_str() {
                                        created_files.push(path.to_string());
                                    }
                                }
                                match tools::execute_tool_internal(tool_name, &args, &context.project_root).await {
                                    Ok(res) => (res, true),
                                    Err(e) => (format!("Error: {}", e), false)
                                }
                            },
                            Err(e) => (format!("Failed to parse arguments: {}", e), false)
                        };

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
                let _ = app.emit("agent:status", json!({ "id": id, "status": "failed", "error": e }));
                return;
            }
        }
    }

    // Build the final output message with file details
    let mut final_output = if !final_ai_summary.is_empty() {
        final_ai_summary
    } else {
        format!("Agent {} has completed the task.", agent_type)
    };

    if !created_files.is_empty() {
        final_output.push_str("\n\n### 📝 File Changes:\n");

        for file in &created_files {
            final_output.push_str(&format!("- `{}`\n", file));
        }
    }

    println!("[AgentRunner] Agent {} finished.", id);
    let _ = supervisor.update_status(&id, AgentStatus::Completed).await;
    let _ = app.emit("agent:status", json!({
        "id": id,
        "status": "completed",
        "progress": 1.0
    }));

    // Send agent:result event with the final output
    let _ = app.emit("agent:result", json!({
        "id": id,
        "output": final_output
    }));
}

fn system_content_with_tools(base: &str) -> String {
    format!("{}\n\nAlways use tools to explore the codebase or read files when needed. Do not guess.", base)
}
