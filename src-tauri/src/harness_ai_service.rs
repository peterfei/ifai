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
        let mut loop_count = 0;

        // 防止无限循环：追踪连续相同的工具调用签名
        let mut consecutive_same_tool_count: usize = 0;
        let mut last_tool_signature: String = String::new();

        use tokio::time::{timeout, Duration};

        println!("[AI] stream_chat start: model={}, tools={}", model, tool_count);

        loop {
            loop_count += 1;

            // 构建请求
            let request = StreamRequest {
                model: model.clone(),
                messages: stream_messages.clone(),
                max_tokens: 4096,
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
            let mut has_error = false;

            // 处理流式响应
            while let Some(result) = stream.next().await {
                match result {
                    Ok(event) => {
                        match event {
                            crate::harness::api::StreamEvent::MessageStart { .. } => {}
                            crate::harness::api::StreamEvent::TextDelta { text } => {
                                loop_text.push_str(&text);

                                let chunk = json!({
                                    "choices": [{ "delta": { "content": text } }]
                                });
                                callback(chunk.to_string());
                            }
                            crate::harness::api::StreamEvent::ToolStart { tool_id, name, input } => {
                                tool_name_map.insert(tool_id.clone(), name.clone());

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

                                    let exec_result = match router.execute(&tool_name, &args) {
                                        Ok(res) => res,
                                        Err(e) => format!("Error: {:?}", e),
                                    };

                                    // 构建并发送 tool_done 事件
                                    let mut done_event = json!({
                                        "type": "tool_done",
                                        "tool_call_id": tool_id,
                                        "tool": tool_name,
                                        "result": exec_result
                                    });
                                    if tool_name == "TodoWrite" {
                                        if let Some(todos) = args.get("todos") {
                                            done_event["todos"] = todos.clone();
                                        }
                                    }
                                    callback(done_event.to_string());

                                    (tool_name, exec_result)
                                } else {
                                    // JSON 解析失败：使用 tool_name_map 中的名称尝试执行
                                    let (resolved_name, exec_result) = if tool_name_from_map != "unknown" {
                                        let fallback_args = serde_json::json!({"raw_input": &result_str});
                                        let exec = match get_global_tool_router().execute(&tool_name_from_map, &fallback_args) {
                                            Ok(res) => res,
                                            Err(e) => format!("Error: args parse failed, fallback also failed: {:?}", e),
                                        };
                                        callback(json!({
                                            "type": "tool_done",
                                            "tool_call_id": tool_id,
                                            "tool": tool_name_from_map,
                                            "result": exec
                                        }).to_string());
                                        (tool_name_from_map, exec)
                                    } else {
                                        let err_msg = format!("Error: tool args parse failed, tool name unknown");
                                        callback(json!({
                                            "type": "tool_done",
                                            "tool_call_id": tool_id,
                                            "result": err_msg
                                        }).to_string());
                                        ("unknown".to_string(), err_msg)
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
                            crate::harness::api::StreamEvent::MessageDone { tokens_used: _ } => {}
                            crate::harness::api::StreamEvent::Error { code, message } => {
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
                        println!("[AI] Stream error: {:?}", e);
                        has_error = true;
                        break;
                    }
                }
            }

            // 判断是否需要续接 (claw-code 模式：主要退出条件)
            if has_error {
                println!("[AI] Loop {} error, stopping", loop_count);
                break;
            }

            if collected_tool_calls.is_empty() {
                // 没有工具调用 → 模型完成生成
                let finish_event = json!({
                    "choices": [{ "finish_reason": "stop" }]
                });
                callback(finish_event.to_string());
                println!("[AI] Completed after {} loop(s)", loop_count);
                break;
            }

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
