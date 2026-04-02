//! DeepSeek API 客户端实现
//!
//! DeepSeek 使用 OpenAI 兼容的 API 格式。

use async_stream::stream;
use futures_core::Stream;
use futures_util::StreamExt;
use reqwest::Client as HttpClient;
use std::pin::Pin;
use std::collections::HashMap;

use super::super::client::ApiClient;
use super::super::types::{ApiError, Message, MessageRole, ModelInfo, StreamEvent, StreamRequest};
use super::openai_format::{parse_openai_frame, ToolCallDelta, FunctionDelta};

pub struct DeepSeekClient {
    http: HttpClient,
    api_key: String,
    base_url: String,
}

impl DeepSeekClient {
    pub fn new(config: &super::super::types::ProviderConfig) -> Self {
        // 🆕 P2: 规范化 base_url，移除可能存在的路径后缀
        let base_url = if let Some(url) = &config.base_url {
            // 如果用户配置的 base_url 已经包含完整路径（如 /chat/completions），使用它
            // 否则使用默认的 API base URL
            if url.contains("/chat/completions") || url.contains("/v1/") {
                url.clone()
            } else {
                format!("{}/chat/completions", url.trim_end_matches('/'))
            }
        } else {
            "https://api.deepseek.com/chat/completions".to_string()
        };

        // 🔥 FIX: 增加 HTTP 客户端超时时间，支持长 continuation 流
        // 默认 30 秒对于复杂多工具任务不够，增加到 300 秒（5 分钟）
        use std::time::Duration;
        let http = HttpClient::builder()
            .timeout(Duration::from_secs(300))
            .connect_timeout(Duration::from_secs(30))
            .read_timeout(Duration::from_secs(300))
            .build()
            .expect("Failed to create HTTP client");

        Self {
            http,
            api_key: config.api_key.clone(),
            base_url,
        }
    }
}

#[async_trait::async_trait]
impl ApiClient for DeepSeekClient {
    async fn stream(
        &self,
        request: StreamRequest,
    ) -> Result<Pin<Box<dyn Stream<Item = Result<StreamEvent, ApiError>> + Send>>, ApiError> {
        // 🔧 CLI: 构建 messages 数组，system prompt 作为第一条消息
        let mut messages = Vec::new();

        // 如果有 system prompt，作为第一条消息添加
        if let Some(system) = &request.system {
            messages.push(Message {
                role: MessageRole::System,
                content: system.clone(),
                tool_calls: None,
                tool_call_id: None,
            });
        }

        // 添加所有原始消息
        messages.extend(request.messages.clone());

        // DeepSeek 使用 OpenAI 兼容的 API 格式
        let mut deepseek_request = serde_json::json!({
            "model": request.model,
            "messages": messages,
            "max_tokens": request.max_tokens,
            "temperature": request.temperature,
            "stream": true
        });

        // 🆕 P2: 添加 tools 参数（如果存在）
        if let Some(tools) = request.tools {
            println!("[DeepSeek] 🔧 Adding {} tools to request", tools.len());
            for tool in &tools {
                if let Some(name) = tool.get("function").and_then(|f| f.get("name")).and_then(|n| n.as_str()) {
                    println!("[DeepSeek]   - {}", name);
                }
            }
            if let Some(obj) = deepseek_request.as_object_mut() {
                obj.insert("tools".to_string(), serde_json::Value::Array(tools));
            }
        } else {
            println!("[DeepSeek] ⚠️ No tools provided in request!");
        }

        // 🔥 DIAGNOSTIC: 打印请求详情（仅在调试时）
        println!("[DeepSeek] 📤 Sending request to: {}", self.base_url);
        if let Ok(pretty) = serde_json::to_string_pretty(&deepseek_request) {
            println!("[DeepSeek] 📋 Request preview (first 500 chars):");
            println!("{}", pretty.chars().take(500).collect::<String>());
        }

        let response = self
            .http
            .post(&self.base_url)  // 🆕 P2: 直接使用 base_url，不再添加路径
            .header("Authorization", format!("Bearer {}", self.api_key))
            .header("Content-Type", "application/json")
            .json(&deepseek_request)
            .send()
            .await
            .map_err(|e| ApiError::Network(e.to_string()))?;

        if !response.status().is_success() {
            let status = response.status();
            let message = response
                .text()
                .await
                .unwrap_or_else(|_| "Unknown error".to_string());
            return Err(ApiError::HttpError { status, message });
        }

        let byte_stream = response.bytes_stream();
        let mut buffer = Vec::new();
        let mut tool_args_buffer: HashMap<i32, (String, String)> = HashMap::new(); // 🆕 P2: (tool_id, 累积的参数)
        let mut tool_started: HashMap<i32, bool> = HashMap::new(); // 🆕 P2: 跟踪工具是否已发送 Start 事件

        // 🔥 DIAGNOSTIC: 添加帧计数器和状态追踪
        let mut frame_count: usize = 0;
        let mut last_finish_reason: Option<String> = None;

        Ok(Box::pin(stream! {
            for await chunk_result in byte_stream {
                match chunk_result {
                    Ok(chunk) => {
                        buffer.extend_from_slice(&chunk);

                        // 按 SSE 帧分隔（\n\n 或 \r\n\r\n）
                        loop {
                            let separator_pos = find_separator(&buffer);
                            if separator_pos == 0 {
                                break;
                            }

                            let frame_bytes = buffer.drain(..separator_pos).collect::<Vec<_>>();
                            // 移除分隔符
                            if buffer.starts_with(b"\n\n") {
                                buffer.drain(..2);
                            } else if buffer.starts_with(b"\r\n\r\n") {
                                buffer.drain(..4);
                            }

                            let frame = String::from_utf8_lossy(&frame_bytes);
                            frame_count += 1;

                            // 🔥 DIAGNOSTIC: 打印原始帧内容（前5帧和每10帧）
                            if frame_count <= 5 || frame_count % 10 == 0 {
                                println!("[DeepSeek] 📨 Frame {}: {} bytes, preview=\"{}\"",
                                    frame_count,
                                    frame_bytes.len(),
                                    frame.chars().take(80).collect::<String>()
                                );
                            }

                            if let Ok(Some(data)) = parse_openai_frame(&frame) {
                                // 🆕 P2: 处理工具调用
                                if let Some(choice) = data.choices.first() {
                                    if let Some(tool_calls) = &choice.delta.tool_calls {
                                        for tc in tool_calls {
                                            let index = tc.index;

                                            // 🔥 DIAGNOSTIC: 打印工具调用详情
                                            println!("[DeepSeek] 🔧 Tool call delta: index={}, id={:?}, name={:?}, args={:?}",
                                                index,
                                                tc.id,
                                                tc.function.as_ref().and_then(|f| f.name.as_ref()),
                                                tc.function.as_ref().and_then(|f| f.arguments.as_ref())
                                                    .map(|a| a.chars().take(50).collect::<String>())
                                            );

                                            // 发送 ToolStart 事件（仅一次）
                                            if !tool_started.get(&index).unwrap_or(&false) {
                                                if let (Some(id), Some(name)) = (&tc.id, tc.function.as_ref().and_then(|f| f.name.as_ref())) {
                                                    yield Ok(StreamEvent::ToolStart {
                                                        tool_id: id.clone(),
                                                        name: name.clone(),
                                                        input: String::new(), // 参数将在后续累积
                                                    });
                                                    tool_started.insert(index, true);
                                                    tool_args_buffer.insert(index, (id.clone(), String::new()));
                                                    println!("[DeepSeek] ✅ ToolStart sent: index={}, id={}, name={}", index, id, name);
                                                }
                                            }

                                            // 累积函数参数
                                            if let Some(func) = &tc.function {
                                                if let Some(args) = &func.arguments {
                                                    if let Some((tool_id, current)) = tool_args_buffer.get_mut(&index) {
                                                        let before_len = current.len();
                                                        current.push_str(args);
                                                        let after_len = current.len();
                                                        println!("[DeepSeek] 📝 Args accumulated: index={}, tool_id={}, added={}, total={}",
                                                            index, tool_id, after_len - before_len, after_len);
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }

                                // 🆕 P2: 优先检查是否所有工具调用完成（在处理其他事件之前）
                                // 🔥 FIX: 确保 ToolDone 在 MessageDone 之前发送，避免前端提前停止监听
                                if let Some(choice) = data.choices.first() {
                                    if let Some(reason) = &choice.finish_reason {
                                        last_finish_reason = Some(reason.clone());

                                        // 🔥 DIAGNOSTIC: 打印 finish_reason 和工具状态
                                        println!("[DeepSeek] 🏁 Finish reason: {}, pending_tools={}, tool_args_buffer_keys={:?}",
                                            reason,
                                            tool_started.len(),
                                            tool_args_buffer.keys().collect::<Vec<_>>()
                                        );

                                        // 发送所有累积的工具参数
                                        for (_index, (tool_id, args)) in tool_args_buffer.iter() {
                                            if !args.is_empty() {
                                                yield Ok(StreamEvent::ToolDone {
                                                    tool_id: tool_id.clone(),
                                                    result: args.clone(),
                                                });
                                            }
                                        }
                                        // 清空缓冲区
                                        tool_args_buffer.clear();
                                        tool_started.clear();
                                    }
                                }

                                // 处理普通事件（文本、完成）
                                if let Some(event) = convert_deepseek_data(&data) {
                                    yield Ok(event);
                                }
                            } else {
                                // 🔥 DIAGNOSTIC: 记录无法解析的帧
                                println!("[DeepSeek] ⚠️ Frame {} could not be parsed, preview=\"{}\"",
                                    frame_count,
                                    frame.chars().take(100).collect::<String>()
                                );
                            }
                        }
                    }
                    Err(e) => {
                        // 🔥 DIAGNOSTIC: 记录网络错误
                        println!("[DeepSeek] ❌ Network error after {} frames: {:?}", frame_count, e);
                        yield Err(ApiError::Network(e.to_string()));
                    }
                }
            }

            // 🔥 DIAGNOSTIC: 流结束时检查状态
            if !tool_args_buffer.is_empty() {
                println!("[DeepSeek] ⚠️ Stream ended with {} incomplete tool calls!",
                    tool_args_buffer.len()
                );
                for (index, (tool_id, args)) in tool_args_buffer.iter() {
                    println!("[DeepSeek]    [{}] tool_id={}, args_len={}",
                        index, tool_id, args.len()
                    );
                }
            }
            println!("[DeepSeek] 🏁 Stream completed: frames={}, finish_reason={:?}",
                frame_count, last_finish_reason
            );
        }))
    }

    async fn list_models(&self) -> Result<Vec<ModelInfo>, ApiError> {
        // DeepSeek 可用模型
        Ok(vec![
            ModelInfo {
                id: "deepseek-chat".to_string(),
                name: "DeepSeek Chat".to_string(),
                context_tokens: 128000,
            },
            ModelInfo {
                id: "deepseek-coder".to_string(),
                name: "DeepSeek Coder".to_string(),
                context_tokens: 128000,
            },
        ])
    }

    fn estimate_tokens(&self, content: &str) -> usize {
        // DeepSeek 使用 GPT-4 兼容的 tokenizer
        // 粗略估算：英文约 4 字符/token，中文约 2 字符/token
        let chinese_chars = content.chars().filter(|c| is_chinese(*c)).count();
        let other_chars = content.len() - chinese_chars;
        chinese_chars / 2 + other_chars / 4
    }
}

fn is_chinese(c: char) -> bool {
    matches!(c as u32, 0x4E00..=0x9FFF)
}

/// 查找 SSE 帧分隔符位置
fn find_separator(buffer: &[u8]) -> usize {
    // 查找 \n\n
    if let Some(pos) = buffer.windows(2).position(|w| w == b"\n\n") {
        return pos + 2;
    }
    // 查找 \r\n\r\n
    if let Some(pos) = buffer.windows(4).position(|w| w == b"\r\n\r\n") {
        return pos + 4;
    }
    0
}

/// 转换 DeepSeek/OpenAI 格式的数据为统一事件
fn convert_deepseek_data(data: &super::openai_format::OpenAiSseData) -> Option<StreamEvent> {
    if let Some(choice) = data.choices.first() {
        // 检查是否有内容
        if let Some(content) = &choice.delta.content {
            if !content.is_empty() {
                return Some(StreamEvent::TextDelta {
                    text: content.clone(),
                });
            }
        }

        // 检查是否完成
        if choice.finish_reason.is_some() {
            return Some(StreamEvent::MessageDone { tokens_used: 0 });
        }
    }

    None
}
