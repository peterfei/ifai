//!
//! Harness-based AI Service
//!
//! 使用新的 harness API 架构，完全绕过旧的 ai_utils 系统
//! P4: Tool Call Auto-Continuation Loop（参考 agent_system/runner.rs、claw-code/conversation.rs）
//!

use crate::core_traits::ai::{AIService, AIProviderConfig, Message};
use crate::harness::api::{ApiClientFactory, AiProvider, StreamRequest, Message as HarnessMessage, MessageRole};
use crate::harness::api::types::{ToolCall as HarnessToolCall, ToolCallFunction as HarnessToolCallFunction};
use crate::harness::tool::ToolRegistry;
use crate::harness::tool::ToolRouter;
use tauri::{AppHandle, Emitter};
use std::sync::OnceLock;
use serde_json::json;
use futures_util::StreamExt;
use std::collections::HashMap;

/// 全局 ToolRegistry (P1)
static GLOBAL_TOOL_REGISTRY: OnceLock<ToolRegistry> = OnceLock::new();

fn get_global_tool_registry() -> &'static ToolRegistry {
    GLOBAL_TOOL_REGISTRY.get_or_init(|| ToolRegistry::new())
}

/// 全局 ToolRouter (P3)
static GLOBAL_TOOL_ROUTER: OnceLock<ToolRouter> = OnceLock::new();

fn get_global_tool_router() -> &'static ToolRouter {
    GLOBAL_TOOL_ROUTER.get_or_init(|| ToolRouter::new())
}

/// 单次流式轮次中收集的工具调用信息
struct CollectedToolCall {
    tool_id: String,
    tool_name: String,
    arguments: String,
    execution_result: String,
}

/// 安全截断字符串（按字符边界，避免 UTF-8 panic）
fn truncate_str(s: &str, max_chars: usize) -> String {
    if s.chars().count() <= max_chars {
        s.to_string()
    } else {
        let truncated: String = s.chars().take(max_chars).collect();
        format!("{}...(truncated, {} bytes total)", truncated, s.len())
    }
}

pub struct HarnessAIService {
    pub app: AppHandle,
}

impl HarnessAIService {
    pub fn new(app: AppHandle) -> Self {
        Self { app }
    }

    /// 将工具注册表转换为 OpenAI 格式
    fn convert_tools_to_openai_format(&self) -> Vec<serde_json::Value> {
        let registry = get_global_tool_registry();
        let tools = registry.all();

        tools.into_iter()
            .map(|tool| {
                json!({
                    "type": "function",
                    "function": {
                        "name": tool.name,
                        "description": tool.description,
                        "parameters": tool.input_schema
                    }
                })
            })
            .collect()
    }

    /// 确定提供商类型
    fn resolve_provider(&self, config: &AIProviderConfig) -> AiProvider {
        match config.name.to_lowercase().as_str() {
            name if name.contains("anthropic") || name.contains("claude") => AiProvider::Anthropic,
            name if name.contains("deepseek") => AiProvider::DeepSeek,
            name if name.contains("openai") || name.contains("gpt") => AiProvider::OpenAI,
            _ => {
                if config.base_url.contains("anthropic") {
                    AiProvider::Anthropic
                } else if config.base_url.contains("deepseek") {
                    AiProvider::DeepSeek
                } else {
                    AiProvider::OpenAI
                }
            }
        }
    }
}

#[async_trait::async_trait]
impl AIService for HarnessAIService {
    async fn chat(&self, _config: &AIProviderConfig, _messages: Vec<Message>) -> Result<Message, String> {
        Err("HarnessAIService::chat not implemented yet".to_string())
    }

    async fn stream_chat(
        &self,
        config: &AIProviderConfig,
        messages: Vec<Message>,
        event_id: &str,
        tools: Option<Vec<serde_json::Value>>,
        callback: Box<dyn Fn(String) + Send>,
    ) -> Result<(), String> {
        // 转换消息格式（初始消息历史）
        let mut stream_messages: Vec<HarnessMessage> = messages
            .into_iter()
            .map(|msg| HarnessMessage {
                role: match msg.role.as_str() {
                    "user" => MessageRole::User,
                    "assistant" => MessageRole::Assistant,
                    "system" => MessageRole::System,
                    _ => MessageRole::User,
                },
                content: match &msg.content {
                    crate::core_traits::ai::Content::Text(text) => text.clone(),
                    _ => String::new(),
                },
                tool_calls: None,
                tool_call_id: None,
            })
            .collect();

        // 确定提供商
        let provider = self.resolve_provider(config);

        // 创建 ProviderConfig
        let provider_config = crate::harness::api::ProviderConfig {
            api_key: config.api_key.clone(),
            base_url: Some(config.base_url.clone()),
            organization: None,
        };

        // 创建 API 客户端
        let client = ApiClientFactory::create_provider(provider, &provider_config)
            .map_err(|e| format!("Failed to create API client: {}", e))?;

        let model = config.models.get(0).cloned().unwrap_or_default();
        let tool_count = tools.as_ref().map_or(0, |t| t.len());

        // P4: Tool Call Auto-Continuation Loop (参考 claw-code/conversation.rs)
        // OpenAI 协议：模型返回 tool_calls + finish_reason:stop → 应用执行工具 →
        // 以 role:"tool" 消息发回 API → 模型继续生成

        // 🔥 CRITICAL FIX: 添加最大迭代次数保护（参考 claw-code 的 max_iterations）
        // 防止 AI 陷入工具调用循环，导致 API 费用失控和资源耗尽
        // 注意：claw-code 默认是 usize::MAX（几乎无限），但这里限制为合理值
        // 复杂任务（如创建多个文件）可能需要 20-30 次工具调用
        const MAX_ITERATIONS: usize = 25;  // 允许最多 25 轮 continuation（可调整）

        let mut loop_count = 0;

        // 防止无限循环：追踪连续相同的工具调用签名
        let mut consecutive_same_tool_count: usize = 0;
        let mut last_tool_signature: String = String::new();

        // 🔥 FIX: 将 delta_index 移到 loop 外部，确保在整个 continuation 过程中单调递增
        // 这样每轮续播都会接续上一轮的序号，而不是从 0 重新开始
        let mut global_delta_index: usize = 0;

        use tokio::time::{timeout, Duration};

        println!("[AI] stream_chat start: model={}, tools={}", model, tool_count);

        loop {
            loop_count += 1;

            // 🔥 CRITICAL: 添加最大迭代次数保护（参考 claw-code/conversation.rs line 168-172）
            if loop_count > MAX_ITERATIONS {
                let error_msg = format!("超过最大迭代次数限制 ({})，可能陷入工具调用循环", MAX_ITERATIONS);
                println!("[AI] ❌ {}: loop_count={}, stopping", error_msg, loop_count);
                callback(json!({
                    "type": "error",
                    "code": "MAX_ITERATIONS_EXCEEDED",
                    "message": error_msg
                }).to_string());
                let finish_event = json!({
                    "choices": [{ "finish_reason": "stop" }]
                });
                callback(finish_event.to_string());
                break;
            }

            // 🔥 DEBUG: 添加详细的 loop 开始日志
            println!("[AI] ➡️ Starting loop {} (global_delta_index={}, max_iterations={})", loop_count, global_delta_index, MAX_ITERATIONS);

            // 🔥 FIX: 使用全局 delta_index，并在每轮开始时记录当前值
            let loop_start_delta_index = global_delta_index;

            // 🔥 DEBUG: 显示当前消息历史
            println!("[AI] 📋 Loop {} message count: {}", loop_count, stream_messages.len());
            for (i, msg) in stream_messages.iter().enumerate() {
                let role = match msg.role {
                    MessageRole::System => "system",
                    MessageRole::User => "user",
                    MessageRole::Assistant => "assistant",
                    MessageRole::Tool => "tool",
                };
                let content_preview = if msg.content.len() > 50 {
                    format!("{}...", &msg.content.chars().take(50).collect::<String>())
                } else {
                    msg.content.clone()
                };
                println!("[AI]   [{}] role={}, has_tool_calls={}, content=\"{}\"",
                    i, role, msg.tool_calls.is_some(), content_preview);
            }

            // 构建请求
            // 🔥 FIX: 根据 DeepSeek API 文档，deepseek-chat 最大支持 8K 输出 tokens
            // 之前设置的 4096 对于复杂多工具任务可能不足，导致 AI 提前结束
            // 设置为 8192（API 允许的最大值）以确保 AI 有足够预算完成所有任务
            // 注意：如果 finish_reason="length" 说明内容被截断
            let request = StreamRequest {
                model: model.clone(),
                messages: stream_messages.clone(),
                max_tokens: 8192,
                system: None,
                temperature: Some(0.7),
                stream: true,
                tools: tools.clone(),
            };

            // 首次 60s，续接 120s
            let timeout_secs = if loop_count == 1 { 60 } else { 120 };
            let stream_result = timeout(Duration::from_secs(timeout_secs), client.stream(request)).await;

            let mut stream = match stream_result {
                Ok(Ok(s)) => s,
                Ok(Err(e)) => {
                    return Err(format!("API stream error: {:?}", e));
                }
                Err(_) => {
                    return Err(format!("API request timeout after {}s", timeout_secs));
                }
            };

            // 本次轮次的状态
            let mut loop_text = String::new();
            let mut tool_name_map: HashMap<String, String> = HashMap::new();
            let mut collected_tool_calls: Vec<CollectedToolCall> = Vec::new();
            let mut loop_finish_reason: Option<String> = None;  // 🔥 CRITICAL FIX: 追踪本轮的 finish_reason

            // 🔥 FIX: 临时禁用批量发送，确保每个 delta 立即发送
            // 批量发送导致数据延迟，前端提前断开
            let mut batch_buffer: Vec<String> = Vec::new();
            let batch_size = 1; // 立即发送（禁用批量）
            let mut has_error = false;
            let mut event_count = 0;

            // 🔥 DEBUG: 添加 stream 处理开始日志
            println!("[AI] 🔊 Loop {} starting to process stream...", loop_count);

            // 处理流式响应
            println!("[AI] 🔗 About to call stream.next()...");
            while let Some(result) = stream.next().await {
                println!("[AI] ✅ Got result from stream!");
                event_count += 1;
                match result {
                    Ok(event) => {
                        // 🔥 DEBUG: 打印所有收到的事件类型
                        println!("[AI] 📨 Event {}: {:?}", event_count, event);

                        match event {
                            crate::harness::api::StreamEvent::MessageStart { .. } => {}
                            crate::harness::api::StreamEvent::TextDelta { text } => {
                                loop_text.push_str(&text);

                                // 🔥 DEBUG: 只在每 50 个 delta 或大片段时打印，同时显示 loop 信息
                                if global_delta_index % 50 == 0 || text.len() > 50 {
                                    println!("[AI] TextDelta: loop={}, idx={}, localIdx={}, textPreview=\"{}\", len={}",
                                        loop_count,
                                        global_delta_index,
                                        global_delta_index - loop_start_delta_index,
                                        text.chars().take(30).collect::<String>(),
                                        text.len()
                                    );
                                }

                                // 🔥 FIX: 使用全局 delta_index，确保跨整个 continuation 流单调递增
                                let chunk = json!({
                                    "choices": [{
                                        "delta": { "content": text },
                                        "index": {
                                            "content_block_index": 0,
                                            "delta_index": global_delta_index
                                        }
                                    }]
                                });

                                // 🔥 FIX: 批量发送，减少 Tauri IPC 调用频率
                                batch_buffer.push(chunk.to_string());

                                // 达到批次大小时批量发送
                                if batch_buffer.len() >= batch_size {
                                    for batched_chunk in batch_buffer.drain(..) {
                                        callback(batched_chunk);
                                    }
                                }

                                global_delta_index += 1;
                            }
                            crate::harness::api::StreamEvent::ToolStart { tool_id, name, input } => {
                                tool_name_map.insert(tool_id.clone(), name.clone());

                                // 🔥 FIX: 清空批量 buffer，确保之前的数据立即发送
                                if !batch_buffer.is_empty() {
                                    println!("[AI] 📦 Flushing {} chunks before ToolStart", batch_buffer.len());
                                    for batched_chunk in batch_buffer.drain(..) {
                                        callback(batched_chunk);
                                    }
                                }

                                let tool_event = json!({
                                    "type": "tool_call",
                                    "tool_call": {
                                        "index": 0,
                                        "id": tool_id,
                                        "type": "function",
                                        "function": { "name": name, "arguments": input }
                                    }
                                });
                                callback(tool_event.to_string());
                            }
                            crate::harness::api::StreamEvent::ToolDone { tool_id, result } => {
                                // 🔥 FIX: 清空批量 buffer，确保之前的数据立即发送
                                if !batch_buffer.is_empty() {
                                    println!("[AI] 📦 Flushing {} chunks before ToolDone", batch_buffer.len());
                                    for batched_chunk in batch_buffer.drain(..) {
                                        callback(batched_chunk);
                                    }
                                }

                                let result_str = result;

                                // 从 tool_name_map 获取工具名称（ToolStart 时已保存）
                                let tool_name_from_map = tool_name_map.get(&tool_id)
                                    .map(|s| s.as_str())
                                    .unwrap_or("unknown")
                                    .to_string();

                                let (tool_name, exec_result) = if let Ok(args) = serde_json::from_str::<serde_json::Value>(&result_str) {
                                    let router = get_global_tool_router();

                                    let tool_name = tool_name_map.get(&tool_id)
                                        .map(|s| s.as_str())
                                        .or_else(|| args.get("name").and_then(|v| v.as_str()))
                                        .or_else(|| args.get("tool").and_then(|v| v.as_str()))
                                        .unwrap_or("TodoWrite")
                                        .to_string();

                                    // 🔥 CRITICAL FIX: 工具执行错误时返回 JSON 格式，让 AI 知道失败
                                    // 参考 claw-code/conversation.rs line 222-225: 将错误转为输出
                                    let exec_result = match router.execute(&tool_name, &args) {
                                        Ok(res) => res,
                                        Err(e) => {
                                            // 返回明确的 JSON 错误格式，包含 error=true 标志
                                            serde_json::json!({
                                                "error": true,
                                                "success": false,
                                                "message": format!("{}", e),
                                                "tool_name": tool_name
                                            }).to_string()
                                        }
                                    };

                                    // 🔥 DIAGNOSTIC: 打印工具执行详情，用于调试 TodoWrite
                                    println!("[AI] 🔧 Tool executed: name={}, args_keys={:?}, has_todos={}",
                                        tool_name,
                                        args.as_object().map(|o| o.keys().collect::<Vec<_>>()),
                                        args.get("todos").is_some()
                                    );

                                    // 构建并发送 tool_done 事件
                                    let mut done_event = json!({
                                        "type": "tool_done",
                                        "tool_call_id": tool_id,
                                        "tool": tool_name,
                                        "result": exec_result
                                    });
                                    if tool_name == "TodoWrite" {
                                        if let Some(todos) = args.get("todos") {
                                            println!("[AI] ✅ Adding todos to tool_done event: {} tasks", todos.as_array().map(|a| a.len()).unwrap_or(0));
                                            done_event["todos"] = todos.clone();
                                        } else {
                                            println!("[AI] ⚠️ TodoWrite tool but no todos in args! args={}", args);
                                        }
                                    }
                                    callback(done_event.to_string());

                                    (tool_name, exec_result)
                                } else {
                                    // JSON 解析失败：使用 tool_name_map 中的名称尝试执行
                                    println!("[AI] ⚠️ Failed to parse tool args as JSON, trying fallback. result_str preview: {}",
                                        result_str.chars().take(100).collect::<String>()
                                    );

                                    let (resolved_name, exec_result) = if tool_name_from_map != "unknown" {
                                        // 🔥 CRITICAL FIX: 尝试从 result_str 中提取 todos（用于 TodoWrite）
                                        let maybe_todos = if tool_name_from_map == "TodoWrite" {
                                            serde_json::from_str::<serde_json::Value>(&result_str)
                                                .ok()
                                                .and_then(|v| v.get("todos").cloned())
                                        } else {
                                            None
                                        };

                                        let fallback_args = serde_json::json!({"raw_input": &result_str});
                                        // 🔥 CRITICAL FIX: fallback 执行失败时也返回 JSON 格式
                                        let exec = match get_global_tool_router().execute(&tool_name_from_map, &fallback_args) {
                                            Ok(res) => res,
                                            Err(e) => {
                                                // 返回明确的 JSON 错误格式
                                                serde_json::json!({
                                                    "error": true,
                                                    "success": false,
                                                    "message": format!("参数解析失败: {}", e),
                                                    "tool_name": tool_name_from_map,
                                                    "raw_input": result_str.chars().take(200).collect::<String>()  // 只保留前 200 字符
                                                }).to_string()
                                            }
                                        };

                                        let mut done_event = json!({
                                            "type": "tool_done",
                                            "tool_call_id": tool_id,
                                            "tool": tool_name_from_map,
                                            "result": exec
                                        });
                                        // 🔥 CRITICAL FIX: 如果是 TodoWrite 且有 todos，添加到事件中
                                        if let Some(todos) = maybe_todos {
                                            println!("[AI] ✅ Adding todos to fallback tool_done event");
                                            done_event["todos"] = todos;
                                        }
                                        callback(done_event.to_string());
                                        (tool_name_from_map, exec)
                                    } else {
                                        // 🔥 CRITICAL FIX: 工具名称未知时也返回 JSON 格式
                                        let err_json = serde_json::json!({
                                            "error": true,
                                            "success": false,
                                            "message": "工具参数解析失败，且无法确定工具名称",
                                            "tool_call_id": tool_id,
                                            "raw_input": result_str.chars().take(200).collect::<String>()
                                        }).to_string();
                                        callback(json!({
                                            "type": "tool_done",
                                            "tool_call_id": tool_id,
                                            "result": err_json
                                        }).to_string());
                                        ("unknown".to_string(), err_json)
                                    };

                                    (resolved_name, exec_result)
                                };

                                collected_tool_calls.push(CollectedToolCall {
                                    tool_id: tool_id.clone(),
                                    tool_name: tool_name.clone(),
                                    arguments: result_str,
                                    execution_result: exec_result,
                                });
                            }
                            crate::harness::api::StreamEvent::MessageDone { tokens_used: _ } => {
                                // 🔥 FIX: 清空批量 buffer，确保之前的数据立即发送
                                if !batch_buffer.is_empty() {
                                    println!("[AI] 📦 Flushing {} chunks before MessageDone", batch_buffer.len());
                                    for batched_chunk in batch_buffer.drain(..) {
                                        callback(batched_chunk);
                                    }
                                }
                            }
                            crate::harness::api::StreamEvent::Error { code, message } => {
                                // 🔥 FIX: 清空批量 buffer，确保之前的数据立即发送
                                if !batch_buffer.is_empty() {
                                    println!("[AI] 📦 Flushing {} chunks before Error", batch_buffer.len());
                                    for batched_chunk in batch_buffer.drain(..) {
                                        callback(batched_chunk);
                                    }
                                }

                                println!("[AI] Stream error: {} - {}", code, message);
                                let error_event = json!({
                                    "type": "error", "code": code, "message": message
                                });
                                callback(error_event.to_string());
                                has_error = true;
                            }
                        }
                    }
                    Err(e) => {
                        println!("[AI] ❌ Stream error: {:?}", e);
                        has_error = true;

                        // 🔥 FIX: 清空剩余的批量 buffer
                        if !batch_buffer.is_empty() {
                            println!("[AI] 📦 Flushing {} chunks on error", batch_buffer.len());
                            for remaining_chunk in batch_buffer.drain(..) {
                                callback(remaining_chunk);
                            }
                        }

                        break;
                    }
                }
            }

            println!("[AI] 🔚 While loop ended, event_count={}", event_count);

            // 🔥 FIX: 清空剩余的批量 buffer
            if !batch_buffer.is_empty() {
                println!("[AI] 📦 Flushing {} remaining chunks from batch_buffer", batch_buffer.len());
                for remaining_chunk in batch_buffer.drain(..) {
                    callback(remaining_chunk);
                }
            }

            // 🔥 DEBUG: 显示本轮 loop 收到的事件数
            println!("[AI] 🔍 Loop {} stream ended: events={}, has_error={}, tool_calls={}, text_len={}",
                loop_count, event_count, has_error, collected_tool_calls.len(), loop_text.len());

            // 判断是否需要续接 (claw-code 模式：主要退出条件)
            // 🔥 DEBUG: 添加详细的退出原因日志
            if has_error {
                println!("[AI] ❌ Loop {} error, stopping", loop_count);
                break;
            }

            if collected_tool_calls.is_empty() {
                // 没有工具调用 → 模型完成生成
                println!("[AI] ✅ No tool calls in loop {}, model finished generating", loop_count);
                let finish_event = json!({
                    "choices": [{ "finish_reason": "stop" }]
                });
                callback(finish_event.to_string());
                println!("[AI] ✅ Completed after {} loop(s)", loop_count);
                break;
            }

            println!("[AI] 🔄 Loop {} has {} tool(s), continuing to next loop...", loop_count, collected_tool_calls.len());

            // 安全网：检测连续相同的工具调用签名
            let current_sig: String = collected_tool_calls.iter()
                .map(|tc| format!("{}:{}", tc.tool_name, tc.arguments.len()))
                .collect::<Vec<_>>()
                .join("|");

            if current_sig == last_tool_signature {
                consecutive_same_tool_count += 1;
            } else {
                consecutive_same_tool_count = 0;
                last_tool_signature = current_sig.clone();
            }

            if consecutive_same_tool_count >= 3 {
                println!("[AI] Loop detected ({}x same sig), stopping", consecutive_same_tool_count + 1);
                callback(json!({
                    "type": "error",
                    "code": "LOOP_DETECTED",
                    "message": format!("工具调用陷入循环")
                }).to_string());
                let finish_event = json!({
                    "choices": [{ "finish_reason": "stop" }]
                });
                callback(finish_event.to_string());
                break;
            }

            // 打印简洁的续接日志（每轮一行）
            let tool_names: Vec<&str> = collected_tool_calls.iter()
                .map(|tc| tc.tool_name.as_str())
                .collect();
            println!("[AI] Loop {}: {} tool(s) [{}]", loop_count, collected_tool_calls.len(), tool_names.join(", "));

            // 构建 assistant 消息（包含 tool_calls）
            let tool_calls_for_msg: Vec<HarnessToolCall> = collected_tool_calls.iter().map(|tc| {
                HarnessToolCall {
                    id: tc.tool_id.clone(),
                    call_type: "function".to_string(),
                    function: HarnessToolCallFunction {
                        name: tc.tool_name.clone(),
                        arguments: tc.arguments.clone(),
                    },
                }
            }).collect();

            stream_messages.push(HarnessMessage {
                role: MessageRole::Assistant,
                content: loop_text.clone(),
                tool_calls: Some(tool_calls_for_msg),
                tool_call_id: None,
            });

            // 为每个工具调用添加 role:"tool" 消息
            for tc in &collected_tool_calls {
                stream_messages.push(HarnessMessage {
                    role: MessageRole::Tool,
                    content: tc.execution_result.clone(),
                    tool_calls: None,
                    tool_call_id: Some(tc.tool_id.clone()),
                });
            }
        }

        println!("[AI] stream_chat completed: {} loop(s)", loop_count);
        Ok(())
    }
}
