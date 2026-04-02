//!
//! Harness-based AI Service
//!
//! 使用新的 harness API 架构，完全绕过旧的 ai_utils 系统
//!
//! 🎯 P0+P1+P2 集成点
//!

use crate::core_traits::ai::{AIService, AIProviderConfig, Message};
use crate::harness::api::{ApiClientFactory, AiProvider, StreamRequest};
use crate::harness::tool::ToolRegistry;
use crate::harness::tool::ToolRouter;
use tauri::{AppHandle, Emitter};
use std::sync::OnceLock;
use serde_json::json;
use futures_util::StreamExt; // 用于 next() 方法

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
        // 🔍 P2 调试：打印工具列表
        if let Some(ref tools) = tools {
            println!("[HarnessAIService] 🛠️ Received {} tools:", tools.len());
            for (i, tool) in tools.iter().enumerate() {
                if let Some(func) = tool.get("function") {
                    let name = func.get("name").and_then(|n| n.as_str()).unwrap_or("?");
                    println!("  [{}] {}", i + 1, name);
                }
            }
        }

        // 转换消息格式
        let stream_messages: Vec<crate::harness::api::Message> = messages
            .into_iter()
            .map(|msg| crate::harness::api::Message {
                role: match msg.role.as_str() {
                    "user" => crate::harness::api::MessageRole::User,
                    "assistant" => crate::harness::api::MessageRole::Assistant,
                    "system" => crate::harness::api::MessageRole::System,
                    _ => crate::harness::api::MessageRole::User,
                },
                content: match &msg.content {
                    crate::core_traits::ai::Content::Text(text) => text.clone(),
                    _ => String::new(),
                },
                tool_calls: None,  // 🆕 P3: 默认无工具调用
                tool_call_id: None,  // 🆕 P3: 默认无工具调用 ID
            })
            .collect();

        // 确定提供商
        let provider = match config.name.to_lowercase().as_str() {
            name if name.contains("anthropic") || name.contains("claude") => AiProvider::Anthropic,
            name if name.contains("deepseek") => AiProvider::DeepSeek,
            name if name.contains("openai") || name.contains("gpt") => AiProvider::OpenAI,
            _ => {
                // 根据 base_url 判断
                if config.base_url.contains("anthropic") {
                    AiProvider::Anthropic
                } else if config.base_url.contains("deepseek") {
                    AiProvider::DeepSeek
                } else {
                    AiProvider::OpenAI
                }
            }
        };

        // 创建 ProviderConfig
        let provider_config = crate::harness::api::ProviderConfig {
            api_key: config.api_key.clone(),
            base_url: Some(config.base_url.clone()),
            organization: None,
        };

        // 创建 API 客户端
        println!("[HarnessAIService] 🚀 Starting stream with provider: {:?}", provider);
        let client = ApiClientFactory::create_provider(provider, &provider_config)
            .map_err(|e| format!("Failed to create API client: {}", e))?;

        // 构建请求
        let request = StreamRequest {
            model: config.models.get(0).cloned().unwrap_or_default(),
            messages: stream_messages,
            max_tokens: 4096,
            system: None,
            temperature: Some(0.7),
            stream: true,
            tools, // 🆕 P0: 传递工具（直接传递，不需要 cloned）
        };

        println!("[HarnessAIService] 📋 Model: {}", request.model);
        println!("[HarnessAIService] 🛠️ Tools: {}", request.tools.is_some());

        // 🔍 P2 调试：打印请求详情
        if let Some(ref tools) = request.tools {
            println!("[HarnessAIService] 📤 Sending tools to API:");
            for (i, tool) in tools.iter().enumerate() {
                if let Some(func) = tool.get("function") {
                    let name = func.get("name").and_then(|n| n.as_str()).unwrap_or("?");
                    println!("  [{}] {}", i + 1, name);
                }
            }
        }

        // 🆕 添加超时处理（30 秒）
        use tokio::time::{timeout, Duration};
        let stream_result = timeout(Duration::from_secs(30), client.stream(request)).await;

        let mut stream = match stream_result {
            Ok(Ok(s)) => s,
            Ok(Err(e)) => {
                return Err(format!("API stream error: {:?}", e));
            }
            Err(_) => {
                return Err("API request timeout after 30 seconds".to_string());
            }
        };

        println!("[HarnessAIService] ✅ Stream created successfully, starting to process events...");

        // 处理流式响应
        let mut full_text = String::new();
        let mut tool_calls_buffer: Vec<String> = Vec::new();
        // 🆕 P3: 保存 tool_id -> tool_name 映射，用于 ToolDone 事件
        use std::collections::HashMap;
        let mut tool_name_map: HashMap<String, String> = HashMap::new();

        while let Some(result) = stream.next().await {
            match result {
                Ok(event) => {
                    match event {
                        crate::harness::api::StreamEvent::MessageStart { .. } => {
                            // 消息开始，不做处理
                        }
                        crate::harness::api::StreamEvent::TextDelta { text } => {
                            full_text.push_str(&text);

                            // 发送 OpenAI 格式的 SSE chunk
                            let chunk = json!({
                                "choices": [{
                                    "delta": {
                                        "content": text
                                    }
                                }]
                            });
                            callback(chunk.to_string());
                        }
                        crate::harness::api::StreamEvent::ToolStart { tool_id, name, input } => {
                            println!("[HarnessAIService] 🔧 Tool start: {} ({})", name, tool_id);
                            println!("[HarnessAIService] 🔧 Tool input: {}", input);  // 🆕 调试：打印输入

                            // 🆕 P3: 保存工具名称映射
                            tool_name_map.insert(tool_id.clone(), name.clone());

                            // 发送工具调用事件
                            let tool_event = json!({
                                "type": "tool_call",
                                "tool_call": {
                                    "index": 0,
                                    "id": tool_id,
                                    "type": "function",
                                    "function": {
                                        "name": name,
                                        "arguments": input
                                    }
                                }
                            });
                            println!("[HarnessAIService] 📤 Sending tool_call event: {}", tool_event.to_string());
                            callback(tool_event.to_string());

                            // 🔥 FIX: 不在 ToolStart 时执行 TodoWrite，因为 input 此时是空的
                            // 真正的执行移到 ToolDone 事件处理中
                        }
                        crate::harness::api::StreamEvent::ToolDone { tool_id, result } => {
                            println!("[HarnessAIService] ✅ Tool done: {}", tool_id);
                            println!("[HarnessAIService] 🔧 Tool result: {}", result);

                            // 🔥 P3: 使用 ToolRouter 执行所有工具
                            let done_event = if let Ok(args) = serde_json::from_str::<serde_json::Value>(&result) {
                                println!("[HarnessAIService] 🔧 Executing tool with router...");

                                let router = get_global_tool_router();

                                // 🆕 P3: 从映射中获取工具名称（ToolStart 时保存的）
                                let tool_name = tool_name_map.get(&tool_id)
                                    .map(|s| s.as_str())
                                    .or_else(|| args.get("name").and_then(|v| v.as_str()))
                                    .or_else(|| args.get("tool").and_then(|v| v.as_str()))
                                    .unwrap_or("TodoWrite");

                                println!("[HarnessAIService] 🔧 Resolved tool name: {}", tool_name);

                                match router.execute(tool_name, &args) {
                                    Ok(exec_result) => {
                                        println!("[HarnessAIService] ✅ Tool '{}' executed: {}", tool_name, exec_result);

                                        // 构建工具完成事件
                                        let mut event = json!({
                                            "type": "tool_done",
                                            "tool_call_id": tool_id,
                                            "tool": tool_name,
                                            "result": exec_result
                                        });

                                        // 如果是 TodoWrite，添加 todos 数据供前端使用
                                        if tool_name == "TodoWrite" {
                                            if let Some(todos) = args.get("todos") {
                                                event["todos"] = todos.clone();
                                            }
                                        }

                                        event
                                    }
                                    Err(e) => {
                                        println!("[HarnessAIService] ❌ Tool '{}' failed: {:?}", tool_name, e);

                                        json!({
                                            "type": "tool_done",
                                            "tool_call_id": tool_id,
                                            "tool": tool_name,
                                            "result": format!("Error: {:?}", e)
                                        })
                                    }
                                }
                            } else {
                                // 解析失败，发送原始的 tool_done 事件
                                println!("[HarnessAIService] ⚠️  Failed to parse tool result as JSON");
                                json!({
                                    "type": "tool_done",
                                    "tool_call_id": tool_id,
                                    "result": result
                                })
                            };

                            println!("[HarnessAIService] 📤 Sending tool_done callback: {}", done_event.to_string());
                            callback(done_event.to_string());
                            println!("[HarnessAIService] ✅ Callback invoked successfully");
                        }
                        crate::harness::api::StreamEvent::MessageDone { tokens_used } => {
                            println!("[HarnessAIService] ✅ Message done, tokens: {}", tokens_used);

                            let finish_event = json!({
                                "choices": [{
                                    "finish_reason": "stop"
                                }]
                            });
                            callback(finish_event.to_string());
                        }
                        crate::harness::api::StreamEvent::Error { code, message } => {
                            println!("[HarnessAIService] ❌ Error: {} - {}", code, message);

                            let error_event = json!({
                                "type": "error",
                                "code": code,
                                "message": message
                            });
                            callback(error_event.to_string());
                        }
                    }
                }
                Err(e) => {
                    println!("[HarnessAIService] ❌ Stream error: {:?}", e);
                    break;
                }
            }
        }

        Ok(())
    }
}
