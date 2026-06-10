//!
//! Harness-based AI Service
//!
//! 使用新的 harness API 架构，完全绕过旧的 ai_utils 系统
//! P4: Tool Call Auto-Continuation Loop（参考 agent_system/runner.rs、claw-code/conversation.rs）
//!

use crate::core_traits::ai::{AIProviderConfig, AIService, Message};
use crate::harness::api::types::{
    ApiError, ToolCall as HarnessToolCall, ToolCallFunction as HarnessToolCallFunction,
};
use crate::harness::api::{
    AiProvider, ApiClientFactory, Message as HarnessMessage, MessageRole, StreamRequest,
};
use crate::harness::api::{BatchEventStream, EventStream, StreamToEventStream}; // 🔥 方案 1: 使用 EventStream + BatchEventStream
use crate::harness::tool::ToolRegistry;
use crate::harness::tool::ToolRouter;
use dashmap::DashMap;
use futures_util::StreamExt;
use serde_json::json;
use std::collections::HashMap;
use std::sync::OnceLock;
use std::time::Duration;
use tauri::{AppHandle, Emitter};
use tokio::sync::oneshot;

// ═══════════════════════════════════════════════════════════
// 智能压缩系统（参考 session.rs）
// ═══════════════════════════════════════════════════════════

/// 压缩模式
enum CompactionMode {
    PreTurn, // 循环开始前，完整压缩（AI 摘要 + 保留最近 N 条）
    MidTurn, // 工具循环中，轻量压缩（不调 AI）
    Manual,  // 手动触发，完整压缩
}

/// 摘要生成 prompt（参照 codex compact/prompt.md）
const COMPACTION_PROMPT: &str = "\
You are performing a CONTEXT CHECKPOINT COMPACTION. \
Create a handoff summary for another LLM that will resume the task.\n\n\
Include:\n\
- Current progress and key decisions made\n\
- Important context, constraints, or user preferences\n\
- What remains to be done (clear next steps)\n\
- Any critical data, examples, or references needed to continue\n\n\
Be concise, structured, and focused on helping the next LLM seamlessly continue the work.";

/// 构建压缩后的消息历史（使用 HarnessMessage）
fn build_compacted_messages_harness(
    system_prompt: &str,
    summary: Option<&str>,
    recent: &[HarnessMessage],
) -> Vec<HarnessMessage> {
    let mut result = Vec::new();

    // 1. 系统提示词
    if !system_prompt.is_empty() {
        result.push(HarnessMessage {
            role: MessageRole::System,
            content: crate::harness::api::types::MessageContent::Text(system_prompt.to_string()),
            tool_calls: None,
            tool_call_id: None,
        });
    }

    // 2. AI 摘要（如有）
    if let Some(text) = summary {
        result.push(HarnessMessage {
            role: MessageRole::System,
            content: crate::harness::api::types::MessageContent::Text(format!(
                "[Conversation Summary]\n{}\n[End of Summary]",
                text
            )),
            tool_calls: None,
            tool_call_id: None,
        });
    }

    // 3. 最近消息
    result.extend(recent.iter().cloned());

    result
}

/// Fallback 压缩（不调 AI，当前行为）
fn perform_compaction_fallback_harness(
    messages: &[HarnessMessage],
    system_prompt: &str,
    keep_last: usize,
) -> Vec<HarnessMessage> {
    if messages.len() <= keep_last {
        return messages.to_vec();
    }

    let mut result = Vec::new();

    // 系统提示词
    if let Some(first) = messages.first() {
        if matches!(first.role, MessageRole::System) {
            result.push(first.clone());
        }
    }
    if !system_prompt.is_empty() && result.is_empty() {
        result.push(HarnessMessage {
            role: MessageRole::System,
            content: crate::harness::api::types::MessageContent::Text(system_prompt.to_string()),
            tool_calls: None,
            tool_call_id: None,
        });
    }

    // 压缩说明
    result.push(HarnessMessage {
        role: MessageRole::System,
        content: crate::harness::api::types::MessageContent::Text(format!(
            "(对话历史已压缩，保留最近 {} 条消息)",
            keep_last
        )),
        tool_calls: None,
        tool_call_id: None,
    });

    // 最近消息 — 向前扫描确保不在孤立 tool 消息处截断
    let mut start = messages.len().saturating_sub(keep_last);

    // 🔥 FIX: 向前扫描确保起始点不落在 tool 消息上
    // tool 消息必须有前面的 assistant[tool_calls] 消息配对
    while start > 0 {
        let first_msg = &messages[start];

        // 如果第一条是 tool，需要继续往前找配对的 assistant[tool_calls]
        if first_msg.role == MessageRole::Tool {
            start -= 1;
            continue;
        }

        // 找到有效的起始点（user / system / assistant）
        break;
    }

    result.extend(messages[start..].iter().cloned());

    result
}

/// 异步生成对话摘要（使用 HarnessMessage）
async fn generate_compaction_summary_harness(
    trimmed_messages: &[HarnessMessage],
    model: &str,
    provider_config: &crate::harness::api::ProviderConfig,
) -> Option<String> {
    if trimmed_messages.is_empty() {
        return None;
    }

    // 将消息简化为文本
    let mut text_parts = Vec::new();
    for msg in trimmed_messages {
        let role = match msg.role {
            MessageRole::System => "system",
            MessageRole::User => "user",
            MessageRole::Assistant => "assistant",
            MessageRole::Tool => "tool",
        };

        let content_text = match &msg.content {
            crate::harness::api::types::MessageContent::Text(text) => text.clone(),
            crate::harness::api::types::MessageContent::MultiModal(parts) => {
                // 多模态内容：提取文本部分
                parts
                    .iter()
                    .filter_map(|p| p.text.as_ref())
                    .map(|s| s.as_str())
                    .collect::<Vec<_>>()
                    .join(" ")
            }
        };

        let display = if content_text.len() > 500 {
            format!(
                "{}... ({} chars truncated)",
                crate::ai_utils::safe_truncate(&content_text, 500),
                content_text.len() - 500
            )
        } else {
            content_text
        };
        text_parts.push(format!("[{}] {}", role, display));
    }

    let summary_input = text_parts.join("\n");

    // 直接用 reqwest 发 OpenAI 兼容请求
    let base_url = provider_config.base_url.clone().unwrap_or_default();
    let url = format!("{}/chat/completions", base_url.trim_end_matches('/'));

    let body = serde_json::json!({
        "model": model,
        "messages": [
            {"role": "system", "content": COMPACTION_PROMPT},
            {"role": "user", "content": summary_input}
        ],
        "stream": false,
        "temperature": 0.0
    });

    let client = reqwest::Client::new();
    let response = client
        .post(&url)
        .header(
            "Authorization",
            format!("Bearer {}", provider_config.api_key),
        )
        .header("Content-Type", "application/json")
        .json(&body)
        .timeout(Duration::from_secs(30))
        .send()
        .await
        .ok()?;

    if !response.status().is_success() {
        eprintln!("[AI] ⚠️ Compaction summary request failed: {}", response.status());
        return None;
    }

    let json: serde_json::Value = response.json().await.ok()?;
    json["choices"][0]["message"]["content"]
        .as_str()
        .map(|s| s.to_string())
}

/// 统一压缩入口（使用 HarnessMessage）
async fn perform_compaction_harness(
    messages: &[HarnessMessage],
    model: &str,
    provider_config: &crate::harness::api::ProviderConfig,
    system_prompt: &str,
    mode: CompactionMode,
) -> Vec<HarnessMessage> {
    // 🔥 简化版本：使用固定阈值（避免依赖 token 模块）
    const MAX_MESSAGES_THRESHOLD: usize = 30;
    let current = messages.len();

    if current <= MAX_MESSAGES_THRESHOLD {
        return messages.to_vec();
    }

    let keep_last = match mode {
        CompactionMode::PreTurn | CompactionMode::Manual => 30,
        CompactionMode::MidTurn => 20,
    };

    if messages.len() <= keep_last {
        return messages.to_vec();
    }

    let recent = &messages[messages.len() - keep_last..];
    let trimmed = &messages[..messages.len() - keep_last];

    // 尝试 AI 摘要（pre-turn / manual）
    let summary = if matches!(mode, CompactionMode::PreTurn | CompactionMode::Manual) {
        eprintln!("[AI] 📦 Attempting AI summary compression ({} messages)...", trimmed.len());
        generate_compaction_summary_harness(trimmed, model, provider_config).await
    } else {
        None
    };

    if summary.is_some() {
        eprintln!("[AI] ✅ AI summary generated successfully");
        build_compacted_messages_harness(system_prompt, summary.as_deref(), recent)
    } else {
        eprintln!("[AI] ⚠️ AI summary failed, using fallback compression");
        perform_compaction_fallback_harness(messages, system_prompt, keep_last)
    }
}

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

/// 待审批工具调用：tool_call_id → oneshot::Sender
/// 前端审批后通过 resolve_tool_approval 发送结果到对应的 sender
static PENDING_APPROVALS: OnceLock<DashMap<String, oneshot::Sender<ApprovalResult>>> =
    OnceLock::new();

fn get_pending_approvals() -> &'static DashMap<String, oneshot::Sender<ApprovalResult>> {
    PENDING_APPROVALS.get_or_init(DashMap::new)
}

/// 审批结果
#[derive(Debug, Clone)]
pub struct ApprovalResult {
    pub approved: bool,
    pub result: Option<String>, // 执行结果（approved=true 时有值）
}

/// 供 Tauri command 调用：前端审批完成后，将结果发送给等待中的 stream_chat loop
pub fn resolve_tool_approval(tool_call_id: &str, approved: bool, result: Option<String>) -> bool {
    let map = get_pending_approvals();
    if let Some((_, sender)) = map.remove(tool_call_id) {
        let _ = sender.send(ApprovalResult { approved, result });
        println!(
            "[AI] ✅ Tool approval resolved: {} -> approved={}",
            tool_call_id, approved
        );
        true
    } else {
        println!(
            "[AI] ⚠️ No pending approval found for tool_call_id: {}",
            tool_call_id
        );
        false
    }
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
        let all_tools = registry.all();

        // 🔥 过滤掉 web_search 工具（LLM 应该使用 websearch_agent 代替）
        // web_search 是底层实现，不应该直接暴露给 LLM
        let tools: Vec<_> = all_tools
            .into_iter()
            .filter(|tool| tool.name != "web_search")
            .collect();

        tools
            .into_iter()
            .enumerate()
            .map(|(i, tool)| {
                let tool_json = json!({
                    "type": "function",
                    "function": {
                        "name": tool.name,
                        "description": tool.description,
                        "parameters": tool.input_schema
                    }
                });

                // 🔍 DEBUG: 检查每个工具的序列化结果
                println!("[ToolConversion] Tool #{}: {}", i, tool.name);
                if let Some(obj) = tool_json.as_object() {
                    println!("  - Has 'type' field: {}", obj.contains_key("type"));
                    if let Some(type_val) = obj.get("type") {
                        println!("  - type value: {:?}", type_val);
                    }
                    if let Some(function) = obj.get("function") {
                        if let Some(func_obj) = function.as_object() {
                            println!(
                                "  - function keys: {:?}",
                                func_obj.keys().collect::<Vec<_>>()
                            );
                        }
                    }
                }

                tool_json
            })
            .collect()
    }

    /// 确定提供商类型
    fn resolve_provider(&self, config: &AIProviderConfig) -> AiProvider {
        match config.name.to_lowercase().as_str() {
            name if name.contains("anthropic") || name.contains("claude") => AiProvider::Anthropic,
            name if name.contains("deepseek") => AiProvider::DeepSeek,
            name if name.contains("openai") || name.contains("gpt") => AiProvider::OpenAI,
            name if name.contains("zhipu") || name.contains("glm") => AiProvider::Zhipu,
            name if name.contains("kimi") || name.contains("moonshot") => AiProvider::Kimi,
            name if name.contains("gemini") || name.contains("google") => AiProvider::Gemini,
            _ => {
                if config.base_url.contains("anthropic") {
                    AiProvider::Anthropic
                } else if config.base_url.contains("deepseek") {
                    AiProvider::DeepSeek
                } else if config.base_url.contains("bigmodel.cn") {
                    AiProvider::Zhipu
                } else if config.base_url.contains("moonshot.cn") {
                    AiProvider::Kimi
                } else if config.base_url.contains("googleapis.com") {
                    AiProvider::Gemini
                } else {
                    AiProvider::OpenAI
                }
            }
        }
    }
}

#[async_trait::async_trait]
impl AIService for HarnessAIService {
    async fn chat(
        &self,
        config: &AIProviderConfig,
        messages: Vec<Message>,
    ) -> Result<Message, String> {
        // 复用已有的非流式 HTTP 实现（与 BasicAIService 相同）
        crate::ai_utils::fetch_ai_completion(config, messages, None).await
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
                    crate::core_traits::ai::Content::Text(text) => {
                        crate::harness::api::types::MessageContent::Text(text.clone())
                    }
                    crate::core_traits::ai::Content::Parts(parts) => {
                        // 🔥 v0.4.3: 支持多模态内容
                        let content_parts = parts
                            .iter()
                            .map(|part| match part {
                                crate::core_traits::ai::ContentPart::Text { text, .. } => {
                                    crate::harness::api::types::ContentPart {
                                        part_type: "text".to_string(),
                                        text: Some(text.clone()),
                                        image_url: None,
                                    }
                                }
                                crate::core_traits::ai::ContentPart::ImageUrl {
                                    image_url, ..
                                } => crate::harness::api::types::ContentPart {
                                    part_type: "image_url".to_string(),
                                    text: None,
                                    image_url: Some(crate::harness::api::types::ImageUrl {
                                        url: image_url.url.clone(),
                                    }),
                                },
                            })
                            .collect();
                        crate::harness::api::types::MessageContent::MultiModal(content_parts)
                    }
                },
                tool_calls: None,
                tool_call_id: None,
            })
            .collect();

        // 确定提供商
        let provider = self.resolve_provider(config);

        // 从 event_id 中提取 correlation_id（格式： "chat_xxx" -> "xxx"）
        let correlation_id = event_id
            .strip_prefix("chat_")
            .unwrap_or(event_id)
            .to_string();

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

        // 🔥 FIX: 设置最大迭代次数（参考 claw-code/conversation.rs）
        // claw-code 默认使用 usize::MAX（几乎无限），这里设置为较大值
        // 复杂任务（如创建多个文件、完整功能开发）可能需要 50-100 次工具调用
        const MAX_ITERATIONS: usize = 1000; // 足够大的值（依靠循环检测机制保护）

        let mut loop_count = 0;

        // 防止无限循环：追踪连续相同的工具调用签名
        let mut consecutive_same_tool_count: usize = 0;
        let mut last_tool_signature: String = String::new();

        // 🔥 FIX: 将 delta_index 移到 loop 外部，确保在整个 continuation 过程中单调递增
        // 这样每轮续播都会接续上一轮的序号，而不是从 0 重新开始
        let mut global_delta_index: usize = 0;

        use tokio::time::{timeout, Duration};

        println!(
            "[AI] stream_chat start: model={}, tools={}",
            model, tool_count
        );

        loop {
            loop_count += 1;

            // 🔥 CRITICAL: 添加最大迭代次数保护（参考 claw-code/conversation.rs line 168-172）
            if loop_count > MAX_ITERATIONS {
                let error_msg = format!(
                    "超过最大迭代次数限制 ({})，可能陷入工具调用循环",
                    MAX_ITERATIONS
                );
                eprintln!("[AI] ❌ {}: loop_count={}, stopping", error_msg, loop_count);
                callback(
                    json!({
                        "type": "error",
                        "code": "MAX_ITERATIONS_EXCEEDED",
                        "message": error_msg
                    })
                    .to_string(),
                );
                let finish_event = json!({
                    "choices": [{ "finish_reason": "stop" }]
                });
                callback(finish_event.to_string());
                break;
            }

            // 🔥 FIX: 简化日志（只在关键时刻输出）
            if loop_count == 1 || loop_count % 10 == 0 {
                println!(
                    "[AI] ➡️ Loop {} starting (delta_index={})",
                    loop_count, global_delta_index
                );
            }

            // 🔥 FIX: 使用全局 delta_index，并在每轮开始时记录当前值
            let loop_start_delta_index = global_delta_index;

            // 🔥 FIX: 移除消息历史打印（占用大量内存）

            // 🔥 智能压缩：使用 MidTurn 模式（轻量压缩，不调 AI，避免阻塞工具循环）
            // 参考 session.rs 的压缩系统，但在工具循环中使用 fallback 模式
            const MAX_MESSAGES_THRESHOLD: usize = 20; // 🔥 降低阈值：30 → 20（更激进地压缩）
            if stream_messages.len() > MAX_MESSAGES_THRESHOLD {
                eprintln!("[AI] 📦 Intelligent compression triggered: {} messages (threshold: {})", stream_messages.len(), MAX_MESSAGES_THRESHOLD);

                // 获取系统提示词（如果有）
                let system_prompt = stream_messages
                    .first()
                    .and_then(|m| {
                        if matches!(m.role, MessageRole::System) {
                            match &m.content {
                                crate::harness::api::types::MessageContent::Text(text) => Some(text.clone()),
                                _ => None,
                            }
                        } else {
                            None
                        }
                    })
                    .unwrap_or_default();

                // 使用 MidTurn 模式：轻量压缩（不调 AI，避免阻塞工具循环）
                // 保留最近 15 条消息（更激进）
                let compressed = perform_compaction_fallback_harness(
                    &stream_messages,
                    &system_prompt,
                    15, // 🔥 降低保留数量：20 → 15
                );

                eprintln!("[AI] ✅ Compression complete: {} → {} messages", stream_messages.len(), compressed.len());
                stream_messages = compressed;
            } else {
                // 🔥 添加日志，方便调试
                if loop_count % 5 == 0 {
                    eprintln!("[AI] 📊 Message count: {} (threshold: {})", stream_messages.len(), MAX_MESSAGES_THRESHOLD);
                }
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

            // 🔥 FIX: 增加超时时间，避免复杂任务被中断
            // 首次请求 180s，续接 300s（与 DeepSeek HTTP 客户端超时对齐）
            let timeout_secs = if loop_count == 1 { 180 } else { 300 };
            let stream_result =
                timeout(Duration::from_secs(timeout_secs), client.stream(request)).await;

            let mut stream = match stream_result {
                Ok(Ok(s)) => s,
                Ok(Err(e)) => {
                    let err_msg = format!("API stream error: {:?}", e);
                    eprintln!("[AI] ❌ {}", err_msg);
                    // 通过 callback 通知前端，让 StoreMapper 能接收并显示
                    let error_code = match &e {
                        ApiError::HttpError { status, .. } => format!("HTTP_{}", status.as_u16()),
                        ApiError::Network(_) => "NETWORK_ERROR".to_string(),
                        ApiError::Sse(_) => "SSE_ERROR".to_string(),
                        _ => "UNKNOWN_ERROR".to_string(),
                    };

                    // 🔥 FIX: 直接提取内层 error.message（对于智谱等 API 返回的 JSON）
                    let error_detail = match &e {
                        ApiError::HttpError { message, .. } => {
                            // 尝试解析 JSON 并提取内层 error.message
                            if message.trim().starts_with('{') {
                                if let Ok(parsed) =
                                    serde_json::from_str::<serde_json::Value>(message)
                                {
                                    if let Some(err_obj) = parsed.get("error") {
                                        if let Some(inner_msg) = err_obj.get("message") {
                                            if let Some(msg_str) = inner_msg.as_str() {
                                                msg_str.to_string()
                                            } else {
                                                message.clone()
                                            }
                                        } else {
                                            message.clone()
                                        }
                                    } else {
                                        message.clone()
                                    }
                                } else {
                                    message.clone()
                                }
                            } else {
                                message.clone()
                            }
                        }
                        ApiError::Network(msg) => msg.clone(),
                        ApiError::Sse(msg) => msg.clone(),
                        _ => err_msg.clone(),
                    };

                    callback(
                        json!({
                            "type": "error",
                            "correlationId": correlation_id,
                            "error": {
                                "code": error_code,
                                "message": error_detail  // 直接发送内层错误消息，不再包装
                            }
                        })
                        .to_string(),
                    );
                    // 发送 finish 事件，让前端停止 loading
                    callback(
                        json!({
                            "choices": [{ "finish_reason": "stop" }]
                        })
                        .to_string(),
                    );
                    return Err(err_msg);
                }
                Err(_) => {
                    let err_msg = format!("API request timeout after {}s", timeout_secs);
                    eprintln!("[AI] ❌ {}", err_msg);

                    callback(
                        json!({
                            "type": "error",
                            "code": "TIMEOUT",
                            "message": err_msg
                        })
                        .to_string(),
                    );
                    callback(
                        json!({
                            "choices": [{ "finish_reason": "stop" }]
                        })
                        .to_string(),
                    );
                    return Err(err_msg);
                }
            };

            // 本次轮次的状态
            let mut loop_text = String::new();
            let mut tool_name_map: HashMap<String, String> = HashMap::new();
            let mut collected_tool_calls: Vec<CollectedToolCall> = Vec::new();
            let mut loop_finish_reason: Option<String> = None; // 🔥 CRITICAL FIX: 追踪本轮的 finish_reason

            // 🔥 FIX: 立即发送 delta chunks（禁用批量）
            // 批量发送可能导致缓冲区问题，暂时禁用
            let mut batch_buffer: Vec<String> = Vec::new();
            let batch_size = 1; // 立即发送（禁用批量）
            let mut has_error = false;
            let mut event_count = 0;

            // 🔥 DEBUG: 添加 stream 处理开始日志（仅一次）
            if loop_count == 1 {
                println!("[AI] 🔊 Starting stream processing (batch_size=50)...");
            }

            // 🔥 方案 A: 使用 BatchEventStream 批量处理（批量大小 50），大幅减少函数调用次数
            let event_stream = StreamToEventStream::new(stream);
            let mut batch_stream = BatchEventStream::new(Box::new(event_stream), 50);

            loop {
                match batch_stream.next_batch().await {
                    Ok(events) => {
                        if events.is_empty() {
                            // 流结束
                            break;
                        }

                        // 批量处理事件
                        for event in events {
                            event_count += 1;

                            // 🔥 FIX: 移除过度日志（每个事件都打印会导致内存爆炸）
                            // 只在每 100 个事件时打印一次
                            if event_count % 100 == 0 {
                                println!("[AI] 📨 Processed {} events so far...", event_count);
                            }

                            match event {
                                crate::harness::api::StreamEvent::MessageStart { .. } => {}
                                crate::harness::api::StreamEvent::TextDelta { text } => {
                                    loop_text.push_str(&text);

                                    // 🔥 FIX: 完全移除 TextDelta 日志，避免流式输出卡顿
                                    // 参考 claw-code 的零日志策略

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
                                crate::harness::api::StreamEvent::ToolStart {
                                    tool_id,
                                    name,
                                    input,
                                } => {
                                    tool_name_map.insert(tool_id.clone(), name.clone());

                                    // 🔥 FIX: 清空批量 buffer，确保之前的数据立即发送
                                    if !batch_buffer.is_empty() {
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
                                crate::harness::api::StreamEvent::ToolCallDelta {
                                    tool_id,
                                    name,
                                    arguments_delta,
                                } => {
                                    // 保存工具名映射（与 ToolStart 一致）
                                    if let Some(n) = &name {
                                        tool_name_map.insert(tool_id.clone(), n.clone());
                                    }
                                    // 🔥 FIX: 当 name 缺失时从 tool_name_map 回填
                                    // （OpenAI 格式首个 chunk 有 name 但 args 为空，被跳过；
                                    //   后续 chunk 有 args 但无 name）
                                    let resolved_name = name.clone().or_else(|| {
                                        tool_name_map.get(&tool_id).cloned()
                                    });
                                    // 直接发送增量事件，不放入 batch_buffer
                                    let delta_event = json!({
                                        "type": "tool_call_delta",
                                        "tool_call_delta": {
                                            "id": tool_id,
                                            "name": resolved_name,
                                            "arguments_delta": arguments_delta
                                        }
                                    });
                                    callback(delta_event.to_string());
                                }
                                crate::harness::api::StreamEvent::ToolDone { tool_id, result } => {
                                    if !batch_buffer.is_empty() {
                                        for batched_chunk in batch_buffer.drain(..) {
                                            callback(batched_chunk);
                                        }
                                    }

                                    let result_str = result;

                                    // 从 tool_name_map 获取工具名称（ToolStart 时已保存）
                                    let tool_name_from_map = tool_name_map
                                        .get(&tool_id)
                                        .map(|s| s.as_str())
                                        .unwrap_or("unknown")
                                        .to_string();

                                    // 🔥 FIX: 发送完整的 tool_call 事件给前端（包含完整 arguments）
                                    // ToolStart 时 arguments 为空，前端 toolCallBuffer 等待完整 arguments
                                    // 在 ToolDone 时 result 就是完整的 arguments JSON，发送给前端以完成累积
                                    let complete_tool_event = json!({
                                        "type": "tool_call",
                                        "tool_call": {
                                            "index": 0,
                                            "id": tool_id,
                                            "type": "function",
                                            "function": {
                                                "name": tool_name_from_map,
                                                "arguments": result_str
                                            }
                                        }
                                    });
                                    callback(complete_tool_event.to_string());

                                    let (tool_name, exec_result) = if let Ok(mut args) =
                                        serde_json::from_str::<serde_json::Value>(&result_str)
                                    {
                                        let router = get_global_tool_router();

                                        let tool_name = tool_name_map
                                            .get(&tool_id)
                                            .map(|s| s.as_str())
                                            .or_else(|| args.get("name").and_then(|v| v.as_str()))
                                            .or_else(|| args.get("tool").and_then(|v| v.as_str()))
                                            .unwrap_or("TodoWrite")
                                            .to_string();

                                        // 🔥 request_user_input: 创建反馈通道并等待用户交互
                                        // 不走 router.execute()，而是通过 oneshot channel 等待前端反馈
                                        if tool_name == "request_user_input" {
                                            let title = args.get("title").and_then(|v| v.as_str()).unwrap_or("");
                                            let questions = args.get("questions").and_then(|v| v.as_array()).cloned().unwrap_or_default();
                                            let on_select = args.get("onSelect").and_then(|v| v.as_str());

                                            match crate::agent_system::workflow::tools::create_feedback_channel(title, &questions, on_select) {
                                                Ok(interaction_json) => {
                                                    let interaction_str = serde_json::to_string(&interaction_json).unwrap_or_default();

                                                    // 发送 tool_done 事件给前端（包含 interaction 数据）
                                                    let done_event = json!({
                                                        "type": "tool_done",
                                                        "tool_call_id": tool_id,
                                                        "tool": "request_user_input",
                                                        "result": interaction_str,
                                                    });
                                                    callback(done_event.to_string());

                                                    // 等待用户反馈（5 分钟超时，复用 wait_for_feedback）
                                                    let feedback_req_id = interaction_json["_feedback_req_id"].as_str().unwrap_or("");
                                                    match crate::agent_system::workflow::tools::wait_for_feedback(feedback_req_id).await {
                                                        Ok(feedback) => {
                                                            let feedback_str = serde_json::to_string(&feedback).unwrap_or_default();
                                                            (tool_name.clone(), feedback_str)
                                                        }
                                                        Err(e) => {
                                                            let err_str = json!({
                                                                "error": true, "success": false,
                                                                "message": format!("用户反馈等待失败: {}", e),
                                                                "tool_name": "request_user_input"
                                                            }).to_string();
                                                            (tool_name.clone(), err_str)
                                                        }
                                                    }
                                                }
                                                Err(e) => {
                                                    let err_str = json!({
                                                        "error": true, "success": false,
                                                        "message": format!("创建反馈通道失败: {}", e),
                                                        "tool_name": "request_user_input"
                                                    }).to_string();
                                                    (tool_name.clone(), err_str)
                                                }
                                            }
                                        } else {
                                        // 🔥 FIX: 为 bash 工具自动注入 working_dir 参数
                                        if tool_name == "bash" || tool_name == "PowerShell" {
                                            if let Some(obj) = args.as_object_mut() {
                                                if !obj.contains_key("working_dir") {
                                                    if let Some(project_root) = crate::harness::tool::router::get_global_project_root() {
                                                    println!("[AI] 🔧 Auto-injecting working_dir={} for {}", project_root, tool_name);
                                                    obj.insert("working_dir".to_string(), serde_json::json!(project_root));
                                                }
                                                }
                                            }
                                        }

                                        // 🔥 FIX: 为文件工具自动解析相对路径
                                        if tool_name == "write_file"
                                            || tool_name == "edit_file"
                                            || tool_name == "read_file"
                                        {
                                            if let Some(obj) = args.as_object_mut() {
                                                if let Some(path) =
                                                    obj.get("path").and_then(|v| v.as_str())
                                                {
                                                    // 如果是相对路径（不以 / 开头），自动加上项目根目录
                                                    if !path.starts_with('/') {
                                                        if let Some(project_root) = crate::harness::tool::router::get_global_project_root() {
                                                        let full_path = format!("{}/{}", project_root.trim_end_matches('/'), path);
                                                        println!("[AI] 🔧 Auto-resolving path: {} -> {}", path, full_path);
                                                        obj.insert("path".to_string(), serde_json::json!(full_path));
                                                    }
                                                    }
                                                }
                                            }
                                        }

                                        // 🔥 FIX: 为搜索工具自动解析相对路径
                                        if tool_name == "glob_search" || tool_name == "grep_search"
                                        {
                                            if let Some(obj) = args.as_object_mut() {
                                                // 获取或设置 path 参数（默认为 "."）
                                                let path = obj
                                                    .get("path")
                                                    .and_then(|v| v.as_str())
                                                    .unwrap_or(".");
                                                // 如果 path 是 "." 或者相对路径，自动解析为项目根目录
                                                if path == "." || !path.starts_with('/') {
                                                    if let Some(project_root) = crate::harness::tool::router::get_global_project_root() {
                                                    let resolved_path = if path == "." {
                                                        project_root.clone()
                                                    } else {
                                                        format!("{}/{}", project_root.trim_end_matches('/'), path)
                                                    };
                                                    println!("[AI] 🔧 Auto-resolving search path: {} -> {}", path, resolved_path);
                                                    obj.insert("path".to_string(), serde_json::json!(resolved_path));
                                                }
                                                }
                                            }
                                        }

                                        // 🔥 审批门控：Schema-Driven 权限检查
                                        let exec_result = if !crate::stream_schema_generated::requires_approval(
                                        crate::stream_schema_generated::PermissionMode::ReadOnly,
                                        &tool_name,
                                    ) {
                                        // safe 工具直接执行
                                        match router.execute(&tool_name, &args) {
                                            Ok(res) => res,
                                            Err(e) => {
                                                serde_json::json!({
                                                    "error": true,
                                                    "success": false,
                                                    "message": format!("{}", e),
                                                    "tool_name": tool_name
                                                }).to_string()
                                            }
                                        }
                                    } else {
                                        // dangerous/destructive 工具：发送审批请求给前端，等待用户审批
                                        println!("[AI] 🔐 Tool {} requires approval, waiting for user...", tool_name);

                                        // 发送 tool_approval_required 事件给前端
                                        let approval_event = json!({
                                            "type": "tool_approval_required",
                                            "tool_call_id": tool_id,
                                            "tool_name": tool_name,
                                            "arguments": result_str,
                                            "correlation_id": correlation_id
                                        });
                                        callback(approval_event.to_string());

                                        // 🆕 Schema-Driven: 发射 stream_phase 事件通知前端进入审批状态
                                        callback(json!({
                                            "type": "stream_phase",
                                            "phase": "AWAITING_APPROVAL",
                                            "tool_call_id": tool_id,
                                            "correlation_id": correlation_id
                                        }).to_string());

                                        // 创建 oneshot channel 等待前端审批
                                        let (tx, rx) = oneshot::channel();
                                        get_pending_approvals().insert(tool_id.clone(), tx);

                                        // 等待前端审批结果（带超时 5 分钟）
                                        match tokio::time::timeout(Duration::from_secs(300), rx).await {
                                            Ok(Ok(approval)) if approval.approved => {
                                                // 用户批准：执行工具
                                                println!("[AI] ✅ Tool {} approved by user, executing...", tool_name);

                                                // 🆕 Schema-Driven: 发射 stream_phase 事件通知前端恢复继续
                                                callback(json!({
                                                    "type": "stream_phase",
                                                    "phase": "CONTINUING",
                                                    "correlation_id": correlation_id
                                                }).to_string());
                                                match router.execute(&tool_name, &args) {
                                                    Ok(res) => res,
                                                    Err(e) => {
                                                        serde_json::json!({
                                                            "error": true,
                                                            "success": false,
                                                            "message": format!("{}", e),
                                                            "tool_name": tool_name
                                                        }).to_string()
                                                    }
                                                }
                                            }
                                            Ok(Ok(_)) => {
                                                // 用户拒绝
                                                println!("[AI] ❌ Tool {} rejected by user", tool_name);
                                                serde_json::json!({
                                                    "error": true,
                                                    "success": false,
                                                    "message": "User rejected this tool call",
                                                    "tool_name": tool_name
                                                }).to_string()
                                            }
                                            Ok(Err(_)) => {
                                                // channel 被关闭（前端异常）
                                                println!("[AI] ⚠️ Tool {} approval channel closed unexpectedly", tool_name);
                                                serde_json::json!({
                                                    "error": true,
                                                    "success": false,
                                                    "message": "Approval process was interrupted",
                                                    "tool_name": tool_name
                                                }).to_string()
                                            }
                                            Err(_) => {
                                                // 超时
                                                println!("[AI] ⏰ Tool {} approval timed out (5min)", tool_name);
                                                serde_json::json!({
                                                    "error": true,
                                                    "success": false,
                                                    "message": "Approval timed out after 5 minutes",
                                                    "tool_name": tool_name
                                                }).to_string()
                                            }
                                        }
                                    };

                                        // 🔥 DIAGNOSTIC: 打印工具执行详情，用于调试 TodoWrite
                                        println!("[AI] 🔧 Tool executed: name={}, args_keys={:?}, has_todos={}",
                                        tool_name,
                                        args.as_object().map(|o| o.keys().collect::<Vec<_>>()),
                                        args.get("todos").is_some()
                                    );

                                        // 🔄 文件操作工具执行成功后，刷新文件树
                                        if matches!(
                                            tool_name.as_str(),
                                            "write_file"
                                                | "edit_file"
                                                | "agent_write_file"
                                                | "agent_delete_file"
                                        ) {
                                            let _ = self.app.emit(
                                                "file-tree-refresh",
                                                json!({
                                                    "action": "write",
                                                    "tool": tool_name
                                                }),
                                            );
                                            println!(
                                                "[AI] 🔄 Emitted file-tree-refresh event after {}",
                                                tool_name
                                            );
                                        }

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
                                        }
                                    } else {
                                        // JSON 解析失败：使用 tool_name_map 中的名称尝试执行
                                        println!("[AI] ⚠️ Failed to parse tool args as JSON, trying fallback. result_str preview: {}",
                                        result_str.chars().take(100).collect::<String>()
                                    );

                                        let (resolved_name, exec_result) = if tool_name_from_map
                                            != "unknown"
                                        {
                                            // 🔥 CRITICAL FIX: 尝试从 result_str 中提取 todos（用于 TodoWrite）
                                            let maybe_todos = if tool_name_from_map == "TodoWrite" {
                                                serde_json::from_str::<serde_json::Value>(
                                                    &result_str,
                                                )
                                                .ok()
                                                .and_then(|v| v.get("todos").cloned())
                                            } else {
                                                None
                                            };

                                            // 🔥 FIX: 为 bash 工具自动注入 working_dir（fallback 路径）
                                            let mut fallback_args =
                                                serde_json::json!({"raw_input": &result_str});
                                            if tool_name_from_map == "bash"
                                                || tool_name_from_map == "PowerShell"
                                            {
                                                if let Some(project_root) = crate::harness::tool::router::get_global_project_root() {
                                                if let Some(obj) = fallback_args.as_object_mut() {
                                                    if !obj.contains_key("working_dir") {
                                                        println!("[AI] 🔧 Auto-injecting working_dir={} for {} (fallback)", project_root, tool_name_from_map);
                                                        obj.insert("working_dir".to_string(), serde_json::json!(project_root));
                                                    }
                                                }
                                            }
                                            }

                                            // 🔥 FIX: 为文件工具自动解析相对路径（fallback 路径）
                                            if tool_name_from_map == "write_file"
                                                || tool_name_from_map == "edit_file"
                                                || tool_name_from_map == "read_file"
                                            {
                                                if let Some(project_root) = crate::harness::tool::router::get_global_project_root() {
                                                if let Some(obj) = fallback_args.as_object_mut() {
                                                    if let Some(path) = obj.get("path").and_then(|v| v.as_str()) {
                                                        // 如果是相对路径（不以 / 开头），自动加上项目根目录
                                                        if !path.starts_with('/') {
                                                            let full_path = format!("{}/{}", project_root.trim_end_matches('/'), path);
                                                            println!("[AI] 🔧 Auto-resolving path (fallback): {} -> {}", path, full_path);
                                                            obj.insert("path".to_string(), serde_json::json!(full_path));
                                                        }
                                                    }
                                                }
                                            }
                                            }

                                            // 🔥 FIX: 为搜索工具自动解析相对路径（fallback 路径）
                                            if tool_name_from_map == "glob_search"
                                                || tool_name_from_map == "grep_search"
                                            {
                                                if let Some(project_root) = crate::harness::tool::router::get_global_project_root() {
                                                if let Some(obj) = fallback_args.as_object_mut() {
                                                    // 获取或设置 path 参数（默认为 "."）
                                                    let path = obj.get("path").and_then(|v| v.as_str()).unwrap_or(".");
                                                    // 如果 path 是 "." 或者相对路径，自动解析为项目根目录
                                                    if path == "." || !path.starts_with('/') {
                                                        let resolved_path = if path == "." {
                                                            project_root.clone()
                                                        } else {
                                                            format!("{}/{}", project_root.trim_end_matches('/'), path)
                                                        };
                                                        println!("[AI] 🔧 Auto-resolving search path (fallback): {} -> {}", path, resolved_path);
                                                        obj.insert("path".to_string(), serde_json::json!(resolved_path));
                                                    }
                                                }
                                            }
                                            }

                                            // 🔥 fallback 路径审批门控（Schema-Driven）
                                            let exec = if !crate::stream_schema_generated::requires_approval(
                                            crate::stream_schema_generated::PermissionMode::ReadOnly,
                                            &tool_name_from_map,
                                        ) {
                                            match get_global_tool_router().execute(&tool_name_from_map, &fallback_args) {
                                                Ok(res) => res,
                                                Err(e) => {
                                                    serde_json::json!({
                                                        "error": true,
                                                        "success": false,
                                                        "message": format!("参数解析失败: {}", e),
                                                        "tool_name": tool_name_from_map,
                                                        "raw_input": result_str.chars().take(200).collect::<String>()
                                                    }).to_string()
                                                }
                                            }
                                        } else {
                                            // 非安全工具：发送审批请求
                                            println!("[AI] 🔐 Tool {} (fallback) requires approval, waiting for user...", tool_name_from_map);

                                            let approval_event = json!({
                                                "type": "tool_approval_required",
                                                "tool_call_id": &tool_id,
                                                "tool_name": &tool_name_from_map,
                                                "arguments": &result_str,
                                                "correlation_id": &correlation_id
                                            });
                                            callback(approval_event.to_string());

                                            // 🆕 Schema-Driven: 发射 stream_phase 事件（fallback 路径）
                                            callback(json!({
                                                "type": "stream_phase",
                                                "phase": "AWAITING_APPROVAL",
                                                "tool_call_id": &tool_id,
                                                "correlation_id": &correlation_id
                                            }).to_string());

                                            let (tx, rx) = oneshot::channel();
                                            get_pending_approvals().insert(tool_id.clone(), tx);

                                            match tokio::time::timeout(Duration::from_secs(300), rx).await {
                                                Ok(Ok(approval)) if approval.approved => {
                                                    println!("[AI] ✅ Tool {} (fallback) approved, executing...", tool_name_from_map);

                                                    // 🆕 Schema-Driven: 发射 stream_phase 事件恢复继续
                                                    callback(json!({
                                                        "type": "stream_phase",
                                                        "phase": "CONTINUING",
                                                        "correlation_id": &correlation_id
                                                    }).to_string());
                                                    match get_global_tool_router().execute(&tool_name_from_map, &fallback_args) {
                                                        Ok(res) => res,
                                                        Err(e) => serde_json::json!({
                                                            "error": true, "success": false,
                                                            "message": format!("{}", e),
                                                            "tool_name": tool_name_from_map
                                                        }).to_string()
                                                    }
                                                }
                                                _ => {
                                                    println!("[AI] ❌ Tool {} (fallback) rejected or timed out", tool_name_from_map);
                                                    serde_json::json!({
                                                        "error": true, "success": false,
                                                        "message": "User rejected or approval timed out",
                                                        "tool_name": tool_name_from_map
                                                    }).to_string()
                                                }
                                            }
                                        };

                                            // 🔄 文件操作工具执行成功后，刷新文件树（fallback 路径）
                                            if matches!(
                                                tool_name_from_map.as_str(),
                                                "write_file"
                                                    | "edit_file"
                                                    | "agent_write_file"
                                                    | "agent_delete_file"
                                            ) {
                                                let _ = self.app.emit(
                                                    "file-tree-refresh",
                                                    json!({
                                                        "action": "write",
                                                        "tool": tool_name_from_map
                                                    }),
                                                );
                                                println!("[AI] 🔄 Emitted file-tree-refresh event after {} (fallback)", tool_name_from_map);
                                            }

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
                                            callback(
                                                json!({
                                                    "type": "tool_done",
                                                    "tool_call_id": tool_id,
                                                    "result": err_json
                                                })
                                                .to_string(),
                                            );
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
                                crate::harness::api::StreamEvent::MessageDone {
                                    input_tokens: _,
                                    output_tokens: _,
                                    finish_reason: _,
                                } => {
                                    if !batch_buffer.is_empty() {
                                        for batched_chunk in batch_buffer.drain(..) {
                                            callback(batched_chunk);
                                        }
                                    }
                                }
                                crate::harness::api::StreamEvent::Error { code, message } => {
                                    if !batch_buffer.is_empty() {
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
                        } // match event
                    } // for event in events
                    Err(e) => {
                        println!("[AI] ❌ Batch stream error: {:?}", e);
                        has_error = true;

                        if !batch_buffer.is_empty() {
                            for remaining_chunk in batch_buffer.drain(..) {
                                callback(remaining_chunk);
                            }
                        }

                        break;
                    }
                } // match batch_stream.next_batch()
            } // loop

            println!("[AI] 🔚 While loop ended, event_count={}", event_count);

            // 🔥 FIX: 清空剩余的批量 buffer
            if !batch_buffer.is_empty() {
                for remaining_chunk in batch_buffer.drain(..) {
                    callback(remaining_chunk);
                }
            }

            // 🔥 FIX: 简化日志（只输出关键信息）
            if has_error || collected_tool_calls.is_empty() {
                println!(
                    "[AI] Loop {} ended: events={}, tool_calls={}, error={}",
                    loop_count,
                    event_count,
                    collected_tool_calls.len(),
                    has_error
                );
            }

            // 判断是否需要续接 (claw-code 模式：主要退出条件)
            if has_error {
                println!("[AI] ❌ Loop {} error, stopping", loop_count);
                break;
            }

            if collected_tool_calls.is_empty() {
                // 没有工具调用 → 模型完成生成
                println!("[AI] ✅ Completed after {} loop(s)", loop_count);
                let finish_event = json!({
                    "choices": [{ "finish_reason": "stop" }]
                });
                callback(finish_event.to_string());
                break;
            }

            // 🔥 FIX: 简化续接日志
            if loop_count % 5 == 0 {
                println!(
                    "[AI] 🔄 Loop {} continuing ({} tools)",
                    loop_count,
                    collected_tool_calls.len()
                );
            }

            // 安全网：检测连续相同的工具调用签名
            let current_sig: String = collected_tool_calls
                .iter()
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
                println!(
                    "[AI] Loop detected ({}x same sig), stopping",
                    consecutive_same_tool_count + 1
                );
                callback(
                    json!({
                        "type": "error",
                        "code": "LOOP_DETECTED",
                        "message": format!("工具调用陷入循环")
                    })
                    .to_string(),
                );
                let finish_event = json!({
                    "choices": [{ "finish_reason": "stop" }]
                });
                callback(finish_event.to_string());
                break;
            }

            // 🔥 FIX: 移除工具名称打印（减少日志量）
            // 工具调用信息已在 ToolStart/ToolDone 时输出

            // 构建 assistant 消息（包含 tool_calls）
            let tool_calls_for_msg: Vec<HarnessToolCall> = collected_tool_calls
                .iter()
                .map(|tc| HarnessToolCall {
                    id: tc.tool_id.clone(),
                    call_type: "function".to_string(),
                    function: HarnessToolCallFunction {
                        name: tc.tool_name.clone(),
                        arguments: tc.arguments.clone(),
                    },
                })
                .collect();

            // 🔍 FIX: 空数组设为 None，防止 API 400 错误
            // DeepSeek 等不允许 assistant 消息的 tool_calls 为空数组 []
            let tool_calls_opt = if tool_calls_for_msg.is_empty() {
                None
            } else {
                Some(tool_calls_for_msg)
            };

            stream_messages.push(HarnessMessage {
                role: MessageRole::Assistant,
                content: crate::harness::api::types::MessageContent::Text(loop_text.clone()),
                tool_calls: tool_calls_opt,
                tool_call_id: None,
            });

            // 为每个工具调用添加 role:"tool" 消息
            for tc in &collected_tool_calls {
                stream_messages.push(HarnessMessage {
                    role: MessageRole::Tool,
                    content: crate::harness::api::types::MessageContent::Text(
                        tc.execution_result.clone(),
                    ),
                    tool_calls: None,
                    tool_call_id: Some(tc.tool_id.clone()),
                });
            }
        }

        println!("[AI] stream_chat completed: {} loop(s)", loop_count);
        Ok(())
    }
}
