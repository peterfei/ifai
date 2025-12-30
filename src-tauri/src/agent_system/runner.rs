use tauri::{AppHandle, Emitter};
use crate::agent_system::base::{AgentStatus, AgentContext};
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
    println!("[AgentRunner] Starting task for: {} ({}), event_id: {}", id, agent_type, event_id);
    
    let mut history: Vec<Message> = Vec::new();
    let mut created_files: Vec<String> = Vec::new();
    let mut last_ai_summary = String::new();
    
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
                "name": "agent_batch_read",
                "description": "Read multiple files in parallel for efficiency. Use this when you need to read 3-10 files at once. Returns JSON array with results for each file.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "paths": {
                            "type": "array",
                            "items": { "type": "string" },
                            "description": "Array of relative file paths to read (recommended: 3-10 files per batch)"
                        }
                    },
                    "required": ["paths"]
                }
            }
        }),
        json!({
            "type": "function",
            "function": {
                "name": "agent_scan_directory",
                "description": "Scan a directory and return structured file tree with statistics. Supports glob patterns (e.g., '*.ts') and limits. Use this for quick project overview before deep scanning.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "rel_path": {
                            "type": "string",
                            "description": "Relative path to directory to scan (default: '.' for current directory)"
                        },
                        "pattern": {
                            "type": "string",
                            "description": "Optional glob pattern to filter files (e.g., '*.ts', '**/*.tsx', '**/*.rs')"
                        },
                        "max_depth": {
                            "type": "number",
                            "description": "Maximum directory depth to scan (default: 10)"
                        },
                        "max_files": {
                            "type": "number",
                            "description": "Maximum number of files to return (default: 500)"
                        }
                    },
                    "required": []
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

    while loop_count < MAX_LOOPS {
        loop_count += 1;
        let _ = app.emit("agent:status", json!({ "id": id, "status": "running", "progress": 0.15 + (loop_count as f32 * 0.05) }));
        let _ = app.emit(&event_id, json!({ "type": "status", "status": "running", "progress": 0.15 + (loop_count as f32 * 0.05) }));
        let _ = app.emit(&event_id, json!({ "type": "log", "message": "Thinking..." }));

        match ai_utils::agent_stream_chat(&app, &context.provider_config, history.clone(), &id, Some(tools.clone())).await {
            Ok(ai_message) => {
                if let Content::Text(ref text) = ai_message.content {
                    if !text.is_empty() {
                         last_ai_summary = text.clone();
                    }
                }

                if let Some(tool_calls) = &ai_message.tool_calls {
                    if tool_calls.is_empty() { break; }
                    history.push(ai_message.clone());

                    for (idx, tool_call) in tool_calls.iter().enumerate() {
                        let tool_name = &tool_call.function.name;
                        let args_res: Result<Value, _> = serde_json::from_str(&tool_call.function.arguments);

                        let _ = app.emit(&event_id, json!({ "type": "log", "message": format!("Processing tool: {}", tool_name) }));

                        let (tool_result, _success) = match args_res {
                            Ok(args) => {
                                // Send final tool_call event with complete arguments (isPartial: false)
                                // This marks the end of streaming and requests user approval
                                // FIX: Use index-based ID to match streaming events (agent_id_idx format)
                                let tool_id = format!("{}_{}", id, idx);
                                println!("[AgentRunner] Requesting authorization for: {}, event_id={}, tool_id={}", tool_name, event_id, tool_id);
                                let emit_result = app.emit(&event_id, json!({
                                    "type": "tool_call",
                                    "toolCall": {
                                        "id": tool_id,  // Use consistent index-based ID
                                        "tool": tool_name,
                                        "args": args,
                                        "isPartial": false
                                    }
                                }));
                                if let Err(e) = emit_result {
                                    eprintln!("[AgentRunner] ERROR emitting event: {}", e);
                                } else {
                                    eprintln!("[AgentRunner] Event emitted successfully");
                                }

                                let _ = supervisor.update_status(&id, AgentStatus::WaitingForTool).await;
                                // Send waitingfortool status event to frontend
                                let _ = app.emit("agent:status", json!({ "id": id.clone(), "status": "waitingfortool" }));
                                let _ = app.emit(&event_id, json!({ "type": "status", "status": "waitingfortool" }));

                                let approved = supervisor.wait_for_approval(id.clone()).await;
                                
                                if approved {
                                    let _ = app.emit("agent:status", json!({ "id": id, "status": "running" }));
                                    let _ = app.emit(&event_id, json!({ "type": "status", "status": "running" }));
                                    let _ = app.emit(&event_id, json!({ "type": "log", "message": format!("🚀 Executing {}...", tool_name) }));
                                }

                                let _ = supervisor.update_status(&id, if approved { AgentStatus::Running } else { AgentStatus::Stopped }).await;

                                if !approved {
                                    ("User rejected the operation.".to_string(), false)
                                } else {
                                    if tool_name == "agent_write_file" {
                                        if let Some(path) = args["rel_path"].as_str() {
                                            created_files.push(path.to_string());
                                        }
                                    }

                                    // Use recursive scan for agent_scan_directory to enable progress callbacks
                                    let tool_result = if tool_name == "agent_scan_directory" {
                                        let rel_path = args["rel_path"].as_str().or_else(|| args["path"].as_str()).unwrap_or(".").to_string();
                                        let pattern = args["pattern"].as_str().map(|s| s.to_string());
                                        let max_depth = args["max_depth"].as_u64().map(|v| v as usize);
                                        let max_files = args["max_files"].as_u64().map(|v| v as usize);

                                        match crate::commands::core_wrappers::agent_scan_directory_with_progress(
                                            &app, &event_id, context.project_root.clone(), rel_path, pattern, max_depth, max_files
                                        ).await {
                                            Ok(res) => res,
                                            Err(e) => format!("Error: {}", e)
                                        }
                                    } else {
                                        match tools::execute_tool_internal(tool_name, &args, &context.project_root).await {
                                            Ok(res) => res,
                                            Err(e) => format!("Error: {}", e)
                                        }
                                    };

                                    // Send explore_findings event for agent_scan_directory
                                    if tool_name == "agent_scan_directory" {
                                        if let Ok(scan_result) = serde_json::from_str::<Value>(&tool_result) {
                                            let total_files = scan_result["stats"]["totalFiles"].as_u64().unwrap_or(0);
                                            let total_dirs = scan_result["stats"]["totalDirectories"].as_u64().unwrap_or(0);

                                            // Send analyzing progress event (scanning done, now analyzing findings)
                                            let _ = app.emit(&event_id, json!({
                                                "type": "explore_progress",
                                                "exploreProgress": {
                                                    "phase": "analyzing",
                                                    "progress": {
                                                        "total": 1,
                                                        "scanned": 1,
                                                        "byDirectory": {}
                                                    }
                                                }
                                            }));

                                            // Build directories array from scan result with sample files
                                            let directories = if let (Some(dirs_arr), Some(files_arr)) = (
                                                scan_result["directories"].as_array(),
                                                scan_result["files"].as_array()
                                            ) {
                                                dirs_arr.iter().filter_map(|dir_value| {
                                                    let dir_path = dir_value.as_str()?;
                                                    let dir_prefix = if dir_path == "." {
                                                        String::new()
                                                    } else {
                                                        format!("{}/", dir_path)
                                                    };

                                                    // Find files in this directory
                                                    let dir_files: Vec<String> = files_arr.iter()
                                                        .filter_map(|f| f.as_str())
                                                        .filter(|f| f.starts_with(&dir_prefix) || dir_path == ".")
                                                        .filter(|f| {
                                                            // Only direct children (no more slashes after the directory prefix)
                                                            let rest = if dir_path == "." { *f } else { f.strip_prefix(&dir_prefix).unwrap_or(f) };
                                                            !rest.contains('/')
                                                        })
                                                        .take(5) // Take up to 5 sample files
                                                        .map(|f| f.split('/').last().unwrap_or(f).to_string())
                                                        .collect();

                                                    let file_count = dir_files.len();

                                                    Some(json!({
                                                        "path": dir_path,
                                                        "fileCount": file_count,
                                                        "keyFiles": dir_files
                                                    }))
                                                }).collect::<Vec<serde_json::Value>>()
                                            } else {
                                                Vec::new()
                                            };

                                            let summary = format!(
                                                "探索完成：发现 {} 个文件和 {} 个目录",
                                                total_files,
                                                total_dirs
                                            );

                                            let _ = app.emit(&event_id, json!({
                                                "type": "explore_findings",
                                                "exploreFindings": {
                                                    "summary": summary,
                                                    "directories": directories
                                                }
                                            }));
                                        }
                                    }

                                    (tool_result, true)
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
                let _ = app.emit(&event_id, json!({ "type": "error", "error": e }));
                let _ = app.emit("agent:status", json!({ "id": id, "status": "failed", "error": e }));
                return;
            }
        }
    }

    let mut final_output = if !last_ai_summary.is_empty() {
        last_ai_summary
    } else {
        format!("Agent {} has completed the task.", agent_type)
    };

    if !created_files.is_empty() {
        final_output.push_str("\n\n### 📝 Changes Applied:\n");
        for file in created_files {
            final_output.push_str(&format!("- ✅ `{}`\n", file));
        }
    }

    let _ = supervisor.update_status(&id, AgentStatus::Completed).await;
    let _ = app.emit("agent:status", json!({ "id": id, "status": "completed", "progress": 1.0 }));
    let _ = app.emit(&event_id, json!({ "type": "status", "status": "completed", "progress": 1.0 }));

    // Send final result through unified stream
    let _ = app.emit(&event_id, json!({
        "type": "result",
        "result": final_output
    }));
    
    // Also keep agent:result for backward compatibility and global listeners
    let _ = app.emit("agent:result", json!({ "id": id, "output": final_output }));
}

fn system_content_with_tools(base: &str) -> String {
    format!("{}\n\nAlways use tools. Show the code you intend to write clearly. Wait for approval before writing files.", base)
}