use crate::core_traits::ai::{Message, Content, ToolCall, AIProviderConfig, FunctionCall};
use serde_json::{json, Value};
use reqwest::Client;
use std::time::{Duration, Instant};
use std::collections::HashMap;
use tauri::{AppHandle, Emitter};
use futures::stream::StreamExt;
use eventsource_stream::Eventsource;

pub fn sanitize_messages(messages: &mut Vec<Message>) {
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
                messages[i].tool_calls = None;
            } else {
                // Update with only completed calls
                messages[i].tool_calls = Some(filtered_calls);
            }
        }
        i += 1;
    }
}

pub async fn fetch_ai_completion(
    config: &AIProviderConfig,
    mut messages: Vec<Message>, // Change to mutable to allow sanitization
    tools: Option<Vec<Value>>,
) -> Result<Message, String> {
    // Apply sanitization before every internal API call
    sanitize_messages(&mut messages);

    let client = Client::builder()
        .timeout(Duration::from_secs(120)) // Increase timeout to 2 minutes
        .pool_max_idle_per_host(0) // Disable connection pooling
        .http1_only() // Force HTTP/1.1 to avoid HTTP/2 chunking issues
        .http1_title_case_headers() // Better compatibility
        .build()
        .map_err(|e| e.to_string())?;
    
    let mut request_body = json!({
        "model": config.models[0],
        "messages": messages,
        "stream": false
    });

    if let Some(t) = tools {
        request_body["tools"] = json!(t);
    }

    let response = client.post(&config.base_url)
        .header("Authorization", format!("Bearer {}", config.api_key))
        .json(&request_body)
        .send()
        .await
        .map_err(|e| format!("Network/Request error: {}", e))?;

    let status = response.status();
    let headers = response.headers().clone();

    // Log response details
    eprintln!("[AIUtils] Response status: {}", status);
    if let Some(content_type) = headers.get("content-type") {
        eprintln!("[AIUtils] Content-Type: {:?}", content_type);
    }
    if let Some(content_length) = headers.get("content-length") {
        eprintln!("[AIUtils] Content-Length: {:?}", content_length);
    }

    if !status.is_success() {
        let err_body = response.text().await.unwrap_or_default();
        eprintln!("[AIUtils] API HTTP Error {}: {}", status, err_body);
        return Err(format!("AI API Error ({}): {}", status, err_body));
    }

    // Try to read response as bytes first, then convert to string
    eprintln!("[AIUtils] Attempting to read response body...");
    let response_bytes = match response.bytes().await {
        Ok(bytes) => {
            eprintln!("[AIUtils] Successfully read {} bytes", bytes.len());
            bytes
        }
        Err(e) => {
            eprintln!("[AIUtils] Failed to read response bytes: {}", e);
            eprintln!("[AIUtils] Error kind: {:?}", e);
            eprintln!("[AIUtils] Is timeout: {}", e.is_timeout());
            eprintln!("[AIUtils] Is connect: {}", e.is_connect());
            return Err(format!("Failed to read response bytes: {} (timeout: {}, connect: {})",
                e, e.is_timeout(), e.is_connect()));
        }
    };

    let response_text = String::from_utf8(response_bytes.to_vec()).map_err(|e| {
        eprintln!("[AIUtils] Failed to decode response as UTF-8: {}", e);
        eprintln!("[AIUtils] First 100 bytes (as hex): {:02x?}",
            &response_bytes[..response_bytes.len().min(100)]);
        format!("Response is not valid UTF-8: {}", e)
    })?;

    // Try to parse as JSON
    let res_json: Value = serde_json::from_str(&response_text).map_err(|e| {
        eprintln!("[AIUtils] JSON Parse Error: {}", e);
        eprintln!("[AIUtils] Response body (first 500 chars): {}",
            if response_text.len() > 500 {
                format!("{}...", &response_text[..500])
            } else {
                response_text.clone()
            }
        );
        format!("Failed to parse AI response as JSON: {}", e)
    })?;
    
    let choice = &res_json["choices"][0]["message"];
    if choice.is_null() {
        eprintln!("[AIUtils] Error: 'choices[0].message' is missing in response: {}", res_json);
        return Err("Malformed AI response: message field missing".to_string());
    }

    let role = choice["role"].as_str().unwrap_or("assistant").to_string();
    let content_text = choice["content"].as_str().unwrap_or("").to_string();
    
    let mut tool_calls: Option<Vec<ToolCall>> = None;
    if let Some(tc_array) = choice["tool_calls"].as_array() {
        let mut calls = Vec::new();
        for tc_val in tc_array {
            calls.push(ToolCall {
                id: tc_val["id"].as_str().unwrap_or("").to_string(),
                r#type: "function".to_string(),
                function: FunctionCall {
                    name: tc_val["function"]["name"].as_str().unwrap_or("").to_string(),
                    arguments: tc_val["function"]["arguments"].as_str().unwrap_or("{}").to_string(),
                }
            });
        }
        tool_calls = Some(calls);
    }

    Ok(Message {
        role,
        content: Content::Text(content_text),
        tool_calls,
        tool_call_id: None,
    })
}

// Streaming response data structures
#[derive(serde::Deserialize, Debug)]
struct OpenAIStreamResponse {
    choices: Vec<StreamChoice>,
}

#[derive(serde::Deserialize, Debug)]
struct StreamChoice {
    delta: StreamDelta,
}

#[derive(serde::Deserialize, Debug)]
struct StreamDelta {
    content: Option<String>,
    tool_calls: Option<Vec<ToolCallChunk>>,
}

#[derive(serde::Deserialize, Debug, Clone)]
struct ToolCallChunk {
    index: i32,
    id: Option<String>,
    function: Option<FunctionChunk>,
}

#[derive(serde::Deserialize, Debug, Clone)]
struct FunctionChunk {
    name: Option<String>,
    arguments: Option<String>,
}

struct StreamingToolCall {
    id: String,
    name: String,
    arguments: String,
}

fn extract_partial_value(json_str: &str, key: &str) -> Option<String> {
    // Enhanced regex to find string values in partial JSON, including multiline content
    // Matches: "key": "value..." where value can contain escaped quotes and newlines
    let pattern = format!(r#""{}"\s*:\s*"((?:[^"\\]|\\.|[\n\r])*)"#, key);
    if let Ok(re) = regex::Regex::new(&pattern) {
        if let Some(caps) = re.captures(json_str) {
            let mut val = caps[1].to_string();
            // Enhanced unescaping for display purposes
            val = val.replace("\\n", "\n")
                     .replace("\\r", "\r")
                     .replace("\\t", "\t")
                     .replace("\\\"", "\"")
                     .replace("\\\\", "\\");
            return Some(val);
        }
    }
    None
}

/// Agent-specific streaming chat that returns a Message (unlike stream_chat which only emits events)
pub async fn agent_stream_chat(
    app: &AppHandle,
    config: &AIProviderConfig,
    messages: Vec<Message>,
    agent_id: &str,
    tools: Option<Vec<Value>>,
) -> Result<Message, String> {
    agent_stream_chat_with_root(app, config, messages, agent_id, tools, None, None).await
}

/// Agent streaming chat with local model routing support
pub async fn agent_stream_chat_with_root(
    app: &AppHandle,
    config: &AIProviderConfig,
    messages: Vec<Message>,
    agent_id: &str,
    tools: Option<Vec<Value>>,
    project_root: Option<String>,
    agent_type: Option<String>,
) -> Result<Message, String> {
    eprintln!("[AgentStream] agent_stream_chat called with agent_id: {}, agent_type: {:?}", agent_id, agent_type);

    // 检查 agent 类型
    let (is_explore_agent, is_hybrid_agent) = if let Some(ref at) = agent_type {
        let at_lower = at.to_lowercase();
        let explore = at_lower.contains("explore") || at_lower.contains("scan");
        // Hybrid agents: review, test, doc, refactor - 这些需要读取文件，但内容生成由云端完成
        let hybrid = at_lower.contains("review") || at_lower.contains("test") ||
                     at_lower.contains("doc") || at_lower.contains("refactor");
        (explore, hybrid)
    } else {
        (false, false)
    };

    // 本地模型预处理 - 智能路由决策
    if let Some(ref root) = project_root {
        println!("[AgentStream] Checking local model routing... (explore: {}, hybrid: {})", is_explore_agent, is_hybrid_agent);

        // 对于 explore agent，如果本地模型可用，直接使用本地工具调用
        if is_explore_agent {
            println!("[AgentStream] Explore agent detected, using local tool calls");

            // 获取任务描述（最后一条用户消息）
            let task_path = messages.iter()
                .filter(|m| m.role == "user")
                .last()
                .and_then(|m| {
                    if let Content::Text(ref text) = m.content {
                        Some(text.trim())
                    } else {
                        None
                    }
                })
                .unwrap_or(".");

            println!("[AgentStream] Task path: {}", task_path);

            // 执行工具调用 - 使用递归扫描以获取完整目录树
            use crate::commands::core_wrappers;
            use std::collections::BTreeMap;
            let start = std::time::Instant::now();

            // 使用递归扫描，限制深度和文件数量
            let scan_result = core_wrappers::agent_scan_directory(
                root.to_string(),
                task_path.to_string(),
                None,  // pattern
                Some(3),  // max_depth - 扫描3层深
                Some(200)  // max_files - 最多200个文件
            ).await;

            let tool_result = match scan_result {
                Ok(json_str) => {
                    let elapsed = start.elapsed().as_millis();

                    // 解析 JSON 结果
                    if let Ok(data) = serde_json::from_str::<serde_json::Value>(&json_str) {
                        let files = data["files"].as_array().map(|a| a.iter().filter_map(|v| v.as_str()).collect::<Vec<_>>()).unwrap_or_default();
                        let directories = data["directories"].as_array().map(|a| a.iter().filter_map(|v| v.as_str()).collect::<Vec<_>>()).unwrap_or_default();

                        println!("[AgentStream] Scan result: {} files, {} directories", files.len(), directories.len());
                        if !files.is_empty() {
                            println!("[AgentStream] First 20 files: {:?}", &files.iter().take(20).collect::<Vec<_>>());
                        }
                        if !directories.is_empty() {
                            println!("[AgentStream] All directories: {:?}", directories);
                        }

                        // 常见的忽略模式（目录和文件）
                        let ignore_dirs = [
                            "node_modules", ".git", "target", "dist", "build",
                            ".vscode", ".idea", "coverage", ".next", ".nuxt"
                        ];

                        let ignore_files = [
                            ".DS_Store", "*.log", ".tsbuildinfo"
                        ];

                        // 检查是否应该忽略目录
                        let should_ignore_dir = |dir: &str| -> bool {
                            for pattern in &ignore_dirs {
                                if dir == *pattern || dir.starts_with(&format!("{}/", pattern)) {
                                    return true;
                                }
                            }
                            false
                        };

                        // 检查是否应该忽略文件
                        let should_ignore_file = |file: &str| -> bool {
                            // 首先检查文件路径中是否包含忽略的目录
                            for ignore_dir in &ignore_dirs {
                                if file.starts_with(&format!("{}/", ignore_dir)) ||
                                   file.contains(&format!("/{}/", ignore_dir)) {
                                    return true;
                                }
                            }

                            // 然后检查文件名模式
                            for pattern in &ignore_files {
                                if pattern.starts_with('*') {
                                    if file.ends_with(&pattern[1..]) {
                                        return true;
                                    }
                                } else {
                                    if file == *pattern || file.ends_with(&format!("/{}", pattern)) {
                                        return true;
                                    }
                                }
                            }
                            false
                        };

                        // 过滤目录
                        let filtered_dirs: Vec<&str> = directories.iter().filter(|d| !should_ignore_dir(d)).cloned().collect();

                        // 过滤文件 - 添加详细日志
                        let mut ignored_count = 0;
                        let mut kept_count = 0;
                        let filtered_files: Vec<&str> = files.iter().filter(|f| {
                            let ignored = should_ignore_file(f);
                            if ignored {
                                ignored_count += 1;
                                if ignored_count <= 5 {
                                    println!("[AgentStream] Filtered file: {}", f);
                                }
                            } else {
                                kept_count += 1;
                                if kept_count <= 5 {
                                    println!("[AgentStream] Kept file: {}", f);
                                }
                            }
                            !ignored
                        }).cloned().collect();

                        println!("[AgentStream] After filtering: {} files kept, {} ignored (out of {} total), {} directories",
                            kept_count, ignored_count, files.len(), filtered_dirs.len());

                        // 按目录分组文件
                        let mut dir_map: BTreeMap<String, Vec<String>> = BTreeMap::new();
                        let mut root_files: Vec<String> = Vec::new();

                        for entry in &filtered_files {
                            if entry.contains('/') {
                                let parts: Vec<&str> = entry.split('/').collect();
                                if parts.len() > 1 {
                                    let dir = parts[0].to_string();
                                    // 只添加非忽略的目录
                                    if !should_ignore_dir(&dir) {
                                        let file = parts[1..].join("/");
                                        dir_map.entry(dir).or_default().push(file.to_string());
                                    }
                                } else {
                                    root_files.push(entry.to_string());
                                }
                            } else {
                                root_files.push(entry.to_string());
                            }
                        }

                        // 构建树状结构输出 - 工业级格式
                        let mut tree_output = String::new();

                        // 先输出根目录文件
                        for file in &root_files {
                            tree_output.push_str(&format!("├── {}\n", file));
                        }

                        // 输出目录和文件
                        for (dir, files) in &dir_map {
                            if !root_files.is_empty() {
                                tree_output.push_str(&format!("│\n├── {}/\n", dir));
                                for (idx, file) in files.iter().enumerate() {
                                    if idx == files.len() - 1 {
                                        tree_output.push_str(&format!("│   └── {}\n", file));
                                    } else {
                                        tree_output.push_str(&format!("│   ├── {}\n", file));
                                    }
                                }
                            } else {
                                tree_output.push_str(&format!("├── {}/\n", dir));
                                for (idx, file) in files.iter().enumerate() {
                                    if idx == files.len() - 1 {
                                        tree_output.push_str(&format!("│   └── {}\n", file));
                                    } else {
                                        tree_output.push_str(&format!("│   ├── {}\n", file));
                                    }
                                }
                            }
                        }

                        // 统计实际显示的文件数
                        let visible_count = root_files.len() + dir_map.values().map(|v| v.len()).sum::<usize>();

                        // 闭合树结构
                        if visible_count > 0 {
                            tree_output.push_str("│\n└── \n");
                        } else {
                            tree_output.push_str("(empty directory - all files filtered)\n");
                        }

                        // 使用代码块格式以保持渲染，添加元数据供前端 i18n
                        format!("```\n{}\n```\n\n__SCAN_RESULT__{}|{}", tree_output, visible_count, elapsed)
                    } else {
                        format!("Error: Failed to parse scan result ({}ms)", elapsed)
                    }
                }
                Err(e) => {
                    let elapsed = start.elapsed().as_millis();
                    format!("Error: {} ({}ms)", e, elapsed)
                }
            };

            // 发送工具结果事件
            let _ = app.emit(&format!("agent_{}", agent_id), json!({
                "type": "content",
                "content": tool_result.clone(),
                "metadata": {
                    "source": "local_model",
                    "agent_type": "explore",
                    "execution_time_ms": start.elapsed().as_millis()
                }
            }));

            // 返回纯文本的 Message，不带 tool_calls
            println!("[AgentStream] Local explore completed in {}ms", start.elapsed().as_millis());
            return Ok(Message {
                role: "assistant".to_string(),
                content: Content::Text(tool_result),
                tool_calls: None,
                tool_call_id: None,
            });
        }

        match crate::local_model::local_model_preprocess(messages.clone()).await {
            Ok(result) => {
                println!("[AgentStream] Local Model Preprocess:");
                println!("  - should_use_local: {}", result.should_use_local);
                println!("  - has_tool_calls: {}", result.has_tool_calls);
                println!("  - tool_calls: {:?}", result.tool_calls.iter().map(|t| &t.name).collect::<Vec<_>>());
                println!("  - route_reason: {}", result.route_reason);

                // 如果本地可以处理工具调用
                if result.should_use_local && result.has_tool_calls {
                    println!("[AgentStream] Executing {} tool calls locally", result.tool_calls.len());

                    // 执行工具调用并构造返回的 Message
                    let mut tool_calls_vec = Vec::new();
                    for tool_call in result.tool_calls {
                        println!("[AgentStream] Executing tool: {}", tool_call.name);

                        // 构建参数 JSON
                        let args_json = serde_json::to_string(&tool_call.arguments)
                            .unwrap_or_else(|_| "{}".to_string());
                        let args_value: serde_json::Value = serde_json::from_str(&args_json)
                            .unwrap_or_else(|_| serde_json::json!({}));

                        // 执行工具调用 - 直接调用 core_wrappers
                        use crate::commands::core_wrappers;
                        let tool_result = match tool_call.name.as_str() {
                            "agent_read_file" => {
                                let rel_path = args_value["rel_path"].as_str().unwrap_or("");
                                core_wrappers::agent_read_file(root.to_string(), rel_path.to_string()).await
                                    .unwrap_or_else(|e| format!("错误: {}", e))
                            }
                            "agent_list_dir" => {
                                let rel_path = args_value["rel_path"].as_str().unwrap_or(".");
                                match core_wrappers::agent_list_dir(root.to_string(), rel_path.to_string()).await {
                                    Ok(entries) => entries.join("\n"),
                                    Err(e) => format!("错误: {}", e)
                                }
                            }
                            "agent_write_file" => {
                                let rel_path = args_value["rel_path"].as_str().unwrap_or("");
                                let content = args_value["content"].as_str().unwrap_or("");
                                core_wrappers::agent_write_file(root.to_string(), rel_path.to_string(), content.to_string()).await
                                    .unwrap_or_else(|e| format!("错误: {}", e))
                            }
                            _ => format!("未知的工具: {}", tool_call.name)
                        };

                        // 发送工具结果事件
                        let _ = app.emit(&format!("agent_{}", agent_id), json!({
                            "type": "tool-result",
                            "tool_name": tool_call.name,
                            "result": tool_result
                        }));

                        // 构造 ToolCall
                        tool_calls_vec.push(crate::core_traits::ai::ToolCall {
                            id: format!("call_{}", uuid::Uuid::new_v4()),
                            r#type: "function".to_string(),
                            function: crate::core_traits::ai::FunctionCall {
                                name: tool_call.name,
                                arguments: args_json,
                            },
                        });
                    }

                    // 返回带有工具调用的 Message
                    println!("[AgentStream] Local tool execution completed, returning Message with tool calls");
                    return Ok(Message {
                        role: "assistant".to_string(),
                        content: Content::Text(format!("已执行 {} 个工具调用", tool_calls_vec.len())),
                        tool_calls: if tool_calls_vec.is_empty() { None } else { Some(tool_calls_vec) },
                        tool_call_id: None,
                    });
                }
            }
            Err(e) => {
                eprintln!("[AgentStream] Local model preprocess failed: {}, falling back to cloud", e);
            }
        }
    }

    // Hybrid 模式：本地执行工具调用 + 云端生成内容
    // 用于 review, test, doc, refactor 等 Agent
    let mut messages_with_tools = messages.clone();
    if is_hybrid_agent {
        if let Some(ref root) = project_root {
            use crate::file_cache;
            use std::path::PathBuf;
            use regex::Regex;

            println!("[AgentStream] Hybrid mode: checking for file paths in user message");

            // 获取最后一条用户消息
            let user_message = messages.iter()
                .filter(|m| m.role == "user")
                .last();

            if let Some(msg) = user_message {
                let text = if let Content::Text(ref t) = msg.content { t } else { "" };

                // 智能提取文件路径的正则表达式
                // 匹配: "review src/lib.rs", "/test components/Header.tsx", "检查 src/main.rs"
                let file_patterns = [
                    r"\b(?:review|test|doc|refactor|check|read|审查|测试|文档|重构|检查|读取)\s+([^\s,]+\.[a-z]+)",
                    r"\b([\w./-]+\.[a-z]{2,4})\b",  // 匹配文件扩展名
                    r"\b([\w./-]+/[\w./-]*)\b",  // 匹配类路径
                ];

                let mut extracted_paths = std::collections::HashSet::new();

                for pattern in &file_patterns {
                    if let Ok(re) = Regex::new(pattern) {
                        for cap in re.captures_iter(text) {
                            if let Some(path_match) = cap.get(1) {
                                let path_str = path_match.as_str();
                                // 过滤掉明显不是文件路径的匹配
                                if path_str.contains('.') || path_str.contains('/') {
                                    // 移除引号
                                    let clean_path = path_str.trim_matches('"').trim_matches('\'').trim();
                                    if !clean_path.is_empty() && clean_path.len() < 200 {
                                        extracted_paths.insert(clean_path.to_string());
                                    }
                                }
                            }
                        }
                    }
                }

                // 将 HashSet 转换为 Vec 并排序
                let mut paths: Vec<String> = extracted_paths.into_iter().collect();
                paths.sort();

                if !paths.is_empty() {
                    let path_count = paths.len();
                    println!("[AgentStream] Hybrid mode: extracted {} file paths: {:?}", path_count, paths);

                    // 读取所有文件（使用缓存）
                    // 构建文件内容摘要
                    let mut file_contents = Vec::new();
                    for path in paths {
                        let full_path = PathBuf::from(root).join(&path);

                        // 添加详细路径日志
                        println!("[AgentStream] Hybrid: project_root={}, rel_path={}, full_path={}",
                            root, path, full_path.display());

                        match file_cache::cached_read_file(&full_path) {
                            Ok(content) => {
                                println!("[AgentStream] Hybrid: read file from cache: {} ({} bytes)", path, content.len());
                                file_contents.push((path, content));
                            }
                            Err(e) => {
                                println!("[AgentStream] Hybrid: file not found or error: {} - {}", path, e);
                                println!("[AgentStream] Hybrid: tried path: {}", full_path.display());
                                // 检查文件是否真的存在
                                if full_path.exists() {
                                    println!("[AgentStream] Hybrid: file exists but read failed");
                                } else {
                                    println!("[AgentStream] Hybrid: file does not exist at path");
                                }
                                file_contents.push((path.clone(), format!("Error: File not found at {}", full_path.display())));
                            }
                        }
                    }

                    // 将文件内容作为 system 消息添加（在用户消息之前）
                    let context_message = format!(
                        "The following files have been read for context:\n{}",
                        file_contents.iter()
                            .map(|(path, content)| {
                                // 限制每个文件最多 10000 字符
                                let truncated = if content.len() > 10000 {
                                    format!("{}...\n[truncated, total {} chars]", content.chars().take(10000).collect::<String>(), content.len())
                                } else {
                                    content.clone()
                                };
                                format!("File: {}\n```\n{}\n```", path, truncated)
                            })
                            .collect::<Vec<_>>()
                            .join("\n\n")
                    );

                    // 在消息历史开头插入 system 消息
                    messages_with_tools.insert(0, Message {
                        role: "system".to_string(),
                        content: Content::Text(context_message),
                        tool_calls: None,
                        tool_call_id: None,
                    });

                    println!("[AgentStream] Hybrid mode: completed local file reading, added {} files as system context", path_count);
                } else {
                    println!("[AgentStream] Hybrid mode: no file paths found in message, falling back to cloud-only");
                }
            }
        }
    }

    // 调用云端 API
    eprintln!("[AgentStream] Using cloud API");
    // ... (rest of implementation)
    // 1. Sanitize messages - use messages_with_tools for hybrid mode
    let mut clean_messages = if is_hybrid_agent { messages_with_tools } else { messages.clone() };
    sanitize_messages(&mut clean_messages);

    // 2. Build request with proper timeout and keep-alive configuration
    let client = Client::builder()
        .timeout(Duration::from_secs(600))  // 10 minute total timeout (was 300s)
        .connect_timeout(Duration::from_secs(60))  // 60 second connection timeout (was 30s)
        .pool_idle_timeout(Duration::from_secs(120))  // Keep connections alive for 120s in pool (was 90s)
        .pool_max_idle_per_host(10)  // Maintain up to 10 idle connections per host
        .tcp_keepalive(Duration::from_secs(30))  // TCP layer keepalive every 30s (was 15s)
        .http2_keep_alive_interval(Duration::from_secs(20))  // HTTP/2 keepalive every 20s (was 10s)
        .http2_keep_alive_timeout(Duration::from_secs(30))   // HTTP/2 must respond within 30s (was 5s)
        .http2_keep_alive_while_idle(true)
        .build()
        .map_err(|e| {
            eprintln!("[AgentStream] Failed to create HTTP client: {}", e);
            e.to_string()
        })?;

    let mut request_body = json!({
        "model": config.models[0],
        "messages": clean_messages,
        "stream": true  // Enable streaming
    });

    if let Some(t) = tools {
        request_body["tools"] = json!(t);
    }

    eprintln!("[AgentStream] Sending streaming request for agent {}", agent_id);

    // 3. Send HTTP request
    let response = client
        .post(&config.base_url)
        .header("Authorization", format!("Bearer {}", config.api_key))
        .header("Content-Type", "application/json")
        .json(&request_body)
        .send()
        .await
        .map_err(|e| format!("Network error: {}", e))?;

    let status = response.status();
    if !status.is_success() {
        let error_text = response.text().await.unwrap_or_default();
        eprintln!("[AgentStream] API Error: {}: {}", status, error_text);
        return Err(format!("AI API Error ({}): {}", status, error_text));
    }

    // 4. Process SSE stream
    eprintln!("[AgentStream] Creating event stream...");
    let mut stream = response.bytes_stream().eventsource();
    let mut accumulated_content = String::new();
    let mut accumulated_tool_calls: HashMap<i32, StreamingToolCall> = HashMap::new();
    let mut event_count = 0;

    // Stream statistics tracking
    let start_time = Instant::now();
    let mut last_event_time = Instant::now();

    eprintln!("[AgentStream] Starting stream iteration...");

    while let Some(event) = stream.next().await {
        event_count += 1;
        let now = Instant::now();
        let time_since_last = now.duration_since(last_event_time).as_secs_f64();
        last_event_time = now;

        match event {
            Ok(event) => {
                // Log stream statistics every 50 events
                if event_count % 50 == 0 {
                    let elapsed = start_time.elapsed().as_secs_f64();
                    eprintln!("[AgentStream] Event #{} | Stats: {:.1}s elapsed, {:.3}s since last",
                        event_count, elapsed, time_since_last);
                } else {
                    eprintln!("[AgentStream] Event #{}", event_count);
                }
                eprintln!("[AgentStream] Received event, data length: {}", event.data.len());

                if event.data == "[DONE]" {
                    let total_time = start_time.elapsed().as_secs_f64();
                    eprintln!("[AgentStream] Stream completed: {} events in {:.1}s",
                        event_count, total_time);
                    break;
                }

                if let Ok(stream_response) = serde_json::from_str::<OpenAIStreamResponse>(&event.data) {
                    if let Some(choice) = stream_response.choices.first() {
                        // Handle text content
                        if let Some(content) = &choice.delta.content {
                            eprintln!("[AgentStream] Got content chunk: {} chars", content.len());
                            accumulated_content.push_str(content);

                            // Send to frontend in real-time as 'thinking' type
                            let _ = app.emit(
                                &format!("agent_{}", agent_id),
                                json!({ "type": "thinking", "content": content })
                            );
                        }

                        // Handle tool call chunks
                        if let Some(tool_chunks) = &choice.delta.tool_calls {
                            for chunk in tool_chunks {
                                let idx = chunk.index;

                                if !accumulated_tool_calls.contains_key(&idx) {
                                    accumulated_tool_calls.insert(idx, StreamingToolCall {
                                        id: String::new(),
                                        name: String::new(),
                                        arguments: String::new(),
                                    });
                                }

                                let st = accumulated_tool_calls.get_mut(&idx).unwrap();
                                if let Some(id) = &chunk.id {
                                    st.id = id.clone();
                                }
                                if let Some(func) = &chunk.function {
                                    if let Some(name) = &func.name {
                                        st.name.push_str(name);
                                    }
                                    if let Some(args) = &func.arguments {
                                        st.arguments.push_str(args);
                                    }
                                }

                                // Emit partial tool call to frontend
                                // FIX: Always use consistent ID (index-based) to prevent duplicate tool calls
                                // Only emit when we have at least a tool name to avoid "unknown" entries
                                if !st.name.is_empty() {
                                    let tool_name = &st.name;
                                    // Use consistent index-based ID throughout the stream
                                    let tool_id = format!("{}_{}", agent_id, idx);

                                    // Try full parse first
                                let args_val: Value = serde_json::from_str(&st.arguments).unwrap_or_else(|_| {
                                    // If not valid JSON, try to extract fields manually for better progressive UI
                                    let mut map = serde_json::Map::new();
                                    if let Some(path) = extract_partial_value(&st.arguments, "rel_path") {
                                        map.insert("rel_path".to_string(), json!(path));
                                    }
                                    if let Some(content) = extract_partial_value(&st.arguments, "content") {
                                        map.insert("content".to_string(), json!(content));
                                    }
                                    Value::Object(map)
                                });

                                // Debug log for streaming tool call
                                let event_name = format!("agent_{}", agent_id);
                                eprintln!("[AgentStream] Streaming: tool={}, args_len={}, isPartial=true, event_name={}",
                                    tool_name,
                                    st.arguments.len(),
                                    event_name);

                                let emit_result = app.emit(
                                    &event_name,
                                    json!({
                                        "type": "tool_call",
                                        "toolCall": {
                                            "id": tool_id,
                                            "tool": tool_name,
                                            "args": args_val,
                                            "isPartial": true
                                        }
                                    })
                                );
                                if let Err(e) = emit_result {
                                    eprintln!("[AgentStream] ERROR emitting event: {}", e);
                                } else {
                                    eprintln!("[AgentStream] Event emitted successfully");
                                }
                                }  // End of if !st.name.is_empty()
                            }
                        }
                    }
                } else {
                    eprintln!("[AgentStream] Failed to parse JSON at event #{}. First 200 chars: {}",
                        event_count,
                        if event.data.len() > 200 {
                            format!("{}...", &event.data[..200])
                        } else {
                            event.data.clone()
                        }
                    );
                }
            }
            Err(e) => {
                let elapsed = start_time.elapsed().as_secs_f64();
                let error_source = std::error::Error::source(&e)
                    .map(|s| s.to_string())
                    .unwrap_or_else(|| "None".to_string());
                let error_details = format!(
                    "[AgentStream] Stream error at event {}: {:.1}s elapsed, {:.3}s since last, error: {}, source: {}",
                    event_count, elapsed, time_since_last, e, error_source
                );

                eprintln!("{}", error_details);

                // Check if this is a recoverable error (encoding/decoding/connection issues)
                let error_str = e.to_string().to_lowercase();
                // Detect recoverable errors: encoding errors, connection timeouts, stream interruptions
                if error_str.contains("decoding") ||
                   error_str.contains("utf8") ||
                   error_str.contains("charset") ||
                   error_str.contains("response body") ||  // Catch connection timeout read errors
                   error_str.contains("unexpected eof") ||  // Connection closed unexpectedly
                   error_str.contains("connection") {      // Generic connection issues
                    // Log warning and attempt to continue
                    eprintln!("[AgentStream] Recoverable error at event #{}: {}. Attempting to continue...",
                        event_count, e);
                    let _ = app.emit(
                        &format!("agent_{}", agent_id),
                        json!({
                            "type": "warning",
                            "message": format!("Stream interrupted at event #{}, attempting recovery...", event_count)
                        })
                    );
                    continue;
                }

                // For non-recoverable errors, emit error and return
                let _ = app.emit(
                    &format!("agent_{}", agent_id),
                    json!({
                        "type": "error",
                        "error": error_details
                    })
                );
                return Err(format!("Stream error: {}", e));
            }
        }
    }

    let total_time = start_time.elapsed().as_secs_f64();
    eprintln!("[AgentStream] Stream completed. Events: {}, Time: {:.1}s, Content: {} chars, Tools: {}",
        event_count, total_time, accumulated_content.len(), accumulated_tool_calls.len());

    // 5. Build final Message
    let tool_calls = if accumulated_tool_calls.is_empty() {
        None
    } else {
        Some(
            accumulated_tool_calls
                .values()
                .map(|st| ToolCall {
                    id: st.id.clone(),
                    r#type: "function".to_string(),
                    function: FunctionCall {
                        name: st.name.clone(),
                        arguments: st.arguments.clone(),
                    },
                })
                .collect()
        )
    };

    Ok(Message {
        role: "assistant".to_string(),
        content: Content::Text(accumulated_content),
        tool_calls,
        tool_call_id: None,
    })
}