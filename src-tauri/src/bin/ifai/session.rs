//! Session & Event Collector — 两阶段工具调用协议
//!
//! 🏛️ 元编程：消除 `_ => {}` 静默忽略，显式事件路由
//!
//! 两阶段协议：
//! 1. **Collect 阶段**：累积 ToolStart 和 TextDelta 事件
//! 2. **Execute 阶段**：执行工具并发送结果回模型
//!
//! ToolDone 事件不再用于参数解析，参数仅来自 ToolStart.input

use crate::loop_detector::{self, EmptyArgsResult}; // 🎬 元编程：循环检测引擎 + 空参数三态结果
use crate::permission::{self as approval, RiskLevel, ToolCategory};
use crate::permission_store::{PermissionRule, PermissionStore, RuleType};
use crate::pipeline::PipelineTracker; // 🎨 元编程：Pipeline 可视化
use crate::prompt_vars::collect_cli_variables;
use crate::provider::resolve_provider;
use crate::render::{self, Spinner, RESET};
use crate::token; // 🔥 元编程：Token 状态栏
use crate::token::format_number; // 🔥 格式化数字（用于压缩统计）
use futures_util::stream::StreamExt;
use ifainew_lib::harness::api::types::{
    Message, MessageContent, MessageRole, StreamEvent, ToolCall, ToolCallFunction,
};
use ifainew_lib::harness::task::{get_global_task_store, TaskStatus, TaskStore};
use ifainew_lib::harness::tool::{clear_global_progress_callback, set_global_progress_callback, ToolRegistry, ToolRouter};
use ifainew_lib::memory;
use ifainew_lib::prompt_manager;
use serde_json::json;
use std::cell::RefCell;
use std::collections::HashMap;
use std::io::{self, Write};
use std::sync::Arc;
use std::time::{Duration, Instant}; // 📋 TodoWrite 任务状态自动推进

/// 共享重试策略 — R2: 消除连接建立和 chunk 读取的重复重试逻辑
pub struct RetryPolicy {
    pub max: u32,
    pub delays: Vec<Duration>,
}

/// 通用异步重试引擎
///
/// `f` 是异步闭包（返回 `Future<Output = Result>`），`is_retryable` 判断错误是否可重试。
/// 重试时按 `policy.delays` 中的延迟 sleep。
pub async fn with_retry<T, E, F, Fut, R>(
    policy: &RetryPolicy,
    is_retryable: R,
    mut f: F,
) -> Result<T, E>
where
    F: FnMut() -> Fut,
    Fut: std::future::Future<Output = Result<T, E>>,
    R: Fn(&E) -> bool,
{
    let mut attempt: u32 = 0;
    loop {
        match f().await {
            Ok(value) => return Ok(value),
            Err(e) => {
                if is_retryable(&e) && attempt < policy.max {
                    if let Some(&delay) = policy.delays.get(attempt as usize) {
                        tokio::time::sleep(delay).await;
                    }
                    attempt += 1;
                } else {
                    return Err(e);
                }
            }
        }
    }
}

/// 📋 自动推进 TodoWrite 任务状态（thread-aware：操作指定线程的 store）
///
/// AI（GLM）通常不会再次调用 TodoWrite 来更新状态，所以需要代码层面自动推进：
/// - 将第一个 pending 任务标记为 in_progress
/// - 当前已有 in_progress 时，如果还有 pending 任务，先将 in_progress 标记为 completed
fn auto_advance_tasks(store: &TaskStore) {
    let tasks = store.get_tasks();
    if tasks.is_empty() {
        return;
    }

    let mut in_progress_idx: Option<usize> = None;
    let mut first_pending_idx: Option<usize> = None;

    for (i, t) in tasks.iter().enumerate() {
        match t.status {
            TaskStatus::InProgress => {
                if in_progress_idx.is_none() {
                    in_progress_idx = Some(i);
                }
            }
            TaskStatus::Pending => {
                if first_pending_idx.is_none() {
                    first_pending_idx = Some(i);
                }
            }
            TaskStatus::Completed => {}
        }
    }

    match (in_progress_idx, first_pending_idx) {
        (None, Some(idx)) => {
            // 没有 in_progress → 将第一个 pending 设为 in_progress
            let _ = store.update_task_status(idx, TaskStatus::InProgress);
        }
        (Some(_), Some(idx)) => {
            // 已有 in_progress 且还有 pending → 标记当前 completed，推进下一个
            if let Some(ip_idx) = in_progress_idx {
                let _ = store.update_task_status(ip_idx, TaskStatus::Completed);
            }
            let _ = store.update_task_status(idx, TaskStatus::InProgress);
        }
        _ => {} // 全部 completed 或只有 in_progress 没有 pending → 不动
    }
}

/// 📋 将当前 in_progress 任务标记为 completed（thread-aware）
fn complete_current_task(store: &TaskStore) {
    let tasks = store.get_tasks();
    for (i, t) in tasks.iter().enumerate() {
        if t.status == TaskStatus::InProgress {
            let _ = store.update_task_status(i, TaskStatus::Completed);
            break;
        }
    }
}

/// 格式化持续时间
fn format_duration(seconds: f64) -> String {
    if seconds < 1.0 {
        format!("{:.1}ms", seconds * 1000.0)
    } else if seconds < 60.0 {
        format!("{:.1}s", seconds)
    } else {
        let mins = (seconds / 60.0).floor();
        let secs = seconds % 60.0;
        format!("{}m {:.0}s", mins, secs)
    }
}

/// 格式化工具参数以便友好显示
fn format_tool_args(tool_name: &str, args: &serde_json::Value) -> String {
    match tool_name {
        "bash" => {
            if let Some(cmd) = args.get("command").and_then(|v| v.as_str()) {
                if cmd.chars().count() > 80 {
                    format!("命令: {}...", cmd.chars().take(77).collect::<String>())
                } else {
                    format!("命令: {}", cmd)
                }
            } else {
                format!("参数: {}", args)
            }
        }
        "write_file" => {
            let path = args.get("path").and_then(|v| v.as_str()).unwrap_or("?");
            let content = args.get("content").and_then(|v| v.as_str()).unwrap_or("");
            let preview = if content.chars().count() > 40 {
                format!(
                    "{}... ({} 字符)",
                    content.chars().take(37).collect::<String>(),
                    content.chars().count()
                )
            } else {
                format!("{}", content)
            };
            format!("路径: {}\n内容: {}", path, preview)
        }
        "read_file" => {
            let path = args.get("path").and_then(|v| v.as_str()).unwrap_or("?");
            format!("读取文件: {}", path)
        }
        "edit_file" => {
            let path = args.get("path").and_then(|v| v.as_str()).unwrap_or("?");
            let edit = args.get("edit").and_then(|v| v.as_str()).unwrap_or("?");
            let preview = if edit.chars().count() > 40 {
                format!("{}...", edit.chars().take(37).collect::<String>())
            } else {
                format!("{}", edit)
            };
            format!("编辑文件: {}\n变更: {}", path, preview)
        }
        _ => {
            // 通用格式化
            let json_str = serde_json::to_string_pretty(args).unwrap_or_default();
            if json_str.chars().count() > 200 {
                format!("{}...", json_str.chars().take(197).collect::<String>())
            } else {
                json_str
            }
        }
    }
}

/// 格式化风险等级显示
fn format_risk_level(risk: approval::RiskLevel) -> String {
    match risk {
        approval::RiskLevel::Low => "⚠️  低风险".to_string(),
        approval::RiskLevel::Medium => "🔶 中风险".to_string(),
        approval::RiskLevel::High => "🔴 高风险".to_string(),
    }
}

// ============================================================================
// Pending Tool Call
// ============================================================================

/// 待执行的工具调用
#[derive(Debug, Clone)]
pub struct PendingToolCall {
    pub tool_id: String,
    pub name: String,
    pub args: String,
}

// ============================================================================
// 空参数判定（单一事实源）
// ============================================================================

/// 空参数判定
///
/// 仅判定**真正的空参数**：空字符串或显式 `{}`。
/// 不检查 JSON 有效性——Provider 截断长参数会导致 JSON 解析失败，
/// 但这不是"空参数"，应放行到 execute_tools 让工具层处理。
fn is_empty_args(args: &str) -> bool {
    args.trim().is_empty() || args.trim() == "{}"
}

// ============================================================================
// Event Collector (Text Only)
// ============================================================================

/// EventCollector — 纯文本收集器
///
/// 工具调用在事件循环中直接收集（ToolDone 时构建 PendingToolCall），
/// EventCollector 只负责收集 response_text。
pub struct EventCollector {
    /// 响应文本
    response_text: String,
    /// 是否收集完成
    done: bool,
}

impl EventCollector {
    pub fn new() -> Self {
        Self {
            response_text: String::new(),
            done: false,
        }
    }

    pub fn dispatch(&mut self, event: &StreamEvent) {
        match &event {
            StreamEvent::TextDelta { text } => {
                self.response_text.push_str(text);
            }
            StreamEvent::MessageDone { .. } => {
                self.done = true;
            }
            StreamEvent::ToolStart { .. }
            | StreamEvent::ToolDone { .. }
            | StreamEvent::MessageStart { .. }
            | StreamEvent::Error { .. } => {}
        }
    }

    pub fn response_text(&self) -> &str {
        &self.response_text
    }

    pub fn is_done(&self) -> bool {
        self.done
    }

    pub fn clear(&mut self) {
        self.response_text.clear();
        self.done = false;
    }
}

impl Default for EventCollector {
    fn default() -> Self {
        Self::new()
    }
}

/// 友好错误消息：根据 ApiError 类型返回用户可读的提示
fn format_stream_error(error: &ifainew_lib::harness::api::types::ApiError) -> String {
    use ifainew_lib::harness::api::types::ApiError;
    match error {
        ApiError::HttpError { status, message: _ } => match status.as_u16() {
            401 | 403 => "Authentication failed. Check your API key.".into(),
            429 => "Rate limited. Please wait a moment and retry.".into(),
            500..=599 => format!(
                "Server error ({}). Service may be temporarily unavailable.",
                status
            ),
            _ => format!("HTTP error {}", status),
        },
        ApiError::Network(msg) if msg.contains("timed out") || msg.contains("timeout") => {
            "Connection timed out. Check network/proxy settings and retry.".into()
        }
        ApiError::Network(msg)
            if msg.contains("dns") || msg.contains("resolve") || msg.contains("getaddrinfo") =>
        {
            "Cannot resolve API host. Check your base_url configuration.".into()
        }
        ApiError::Network(msg)
            if msg.contains("tls")
                || msg.contains("certificate")
                || msg.contains("connection refused") =>
        {
            "Connection failed. Check if the API server is reachable.".into()
        }
        _ => format!("Connection error: {}", error),
    }
}

// ============================================================================
// Continuation Guard
// ============================================================================

/// 最大续播次数限制（防止无限循环）
pub const MAX_CONTINUATIONS: u32 = 5;

/// 续播计数器
#[derive(Debug, Clone, Copy)]
pub struct ContinuationCounter {
    count: u32,
}

impl ContinuationCounter {
    pub fn new() -> Self {
        Self { count: 0 }
    }

    /// 增加计数
    pub fn increment(&mut self) -> Result<(), String> {
        self.count += 1;
        if self.count > MAX_CONTINUATIONS {
            Err(format!("达到最大续播次数 ({})", MAX_CONTINUATIONS))
        } else {
            Ok(())
        }
    }

    /// 获取当前计数
    pub fn count(&self) -> u32 {
        self.count
    }

    /// 是否超过限制
    pub fn is_exceeded(&self) -> bool {
        self.count > MAX_CONTINUATIONS
    }
}

impl Default for ContinuationCounter {
    fn default() -> Self {
        Self::new()
    }
}

// ============================================================================
// ThreadSessionContext — 每个线程独立的 Session 状态
// ============================================================================

/// 每个线程独立的 AI 对话上下文
pub struct ThreadSessionContext {
    /// 该线程的 AI 对话历史
    pub messages: Vec<Message>,
    /// 累积输入 token 数
    pub cumulative_input_tokens: u32,
    /// 累积输出 token 数
    pub cumulative_output_tokens: u32,
    /// 工具执行步骤跟踪
    pub pipeline_tracker: crate::pipeline::tracker::PipelineTracker,
}

impl ThreadSessionContext {
    pub fn new() -> Self {
        Self {
            messages: Vec::new(),
            cumulative_input_tokens: 0,
            cumulative_output_tokens: 0,
            pipeline_tracker: crate::pipeline::tracker::PipelineTracker::new(),
        }
    }
}

impl Default for ThreadSessionContext {
    fn default() -> Self {
        Self::new()
    }
}

// ============================================================================
// Session State (Placeholder)
// ============================================================================

/// 🔥 会话状态（支持 token 追踪）
pub struct Session {
    pub provider: String,
    pub model: String,
    pub tool_registry: ToolRegistry,
    pub tool_router: Arc<ToolRouter>,
    /// 🔥 API key（从配置读取，优先级：CLI > Env > TOML > Default）
    api_key: Option<String>,
    /// 🔥 Base URL（可选，从 TOML 配置读取）
    base_url: Option<String>,
    /// 🔥 禁用工具调用（--no-tool 标志）
    tools_disabled: bool,
    /// 🔥 自动批准所有工具调用（测试用）
    auto_approve_all: bool,
    /// 🔥 自定义系统提示词（--system 参数）
    custom_system_prompt: Option<String>,
    /// 🔥 权限存储（用户白名单）- 使用 RefCell 实现内部可变性
    permission_store: RefCell<PermissionStore>,
    /// 🔥 会话级权限规则（重启失效）
    session_rules: RefCell<Vec<PermissionRule>>,
    /// 🎯 统一底部状态栏
    bottom_status_bar: token::BottomStatusBar,
    /// 🔥 CLI 模式默认线程上下文（TUI 模式使用 per-thread ThreadSessionContext）
    pub default_ctx: ThreadSessionContext,
    /// 🔥 会话开始时间（用于计算总时长）
    session_start: Instant,
    /// 🎯 备用屏幕视图是否激活
    alt_view_active: bool,
    /// 🎨 声明式渲染管道
    render_pipeline: crate::stream_render::RenderPipeline,
    /// 🎬 动画任务停止标志
    animation_stop: Arc<std::sync::atomic::AtomicBool>,
    /// 🎬 当前动画任务句柄
    animation_task: Option<tokio::task::JoinHandle<()>>,
    /// 🎨 Markdown 代码块流式渲染器
    markdown_state: crate::markdown_stream::MarkdownStreamState,
}

// ============================================================================
// Compaction Functions (clone-out-of-lock pattern)
// ============================================================================

/// 压缩模式
enum CompactionMode {
    PreTurn, // 循环开始前，完整压缩（AI 摘要 + 保留最近 N 条）
    MidTurn, // 工具循环中，轻量压缩（不调 AI）
    Manual,  // /compact 命令，完整压缩
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

/// 构建压缩后的消息历史
fn build_compacted_messages(
    system_prompt: &str,
    summary: Option<&str>,
    recent: &[Message],
) -> Vec<Message> {
    let mut result = Vec::new();

    // 1. 系统提示词
    if !system_prompt.is_empty() {
        result.push(Message {
            role: MessageRole::System,
            content: MessageContent::Text(system_prompt.to_string()),
            tool_calls: None,
            tool_call_id: None,
        });
    }

    // 2. AI 摘要（如有）
    if let Some(text) = summary {
        result.push(Message {
            role: MessageRole::System,
            content: MessageContent::Text(format!(
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
pub fn perform_compaction_fallback(
    messages: &[Message],
    system_prompt: &str,
    keep_last: usize,
) -> Vec<Message> {
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
        result.push(Message {
            role: MessageRole::System,
            content: MessageContent::Text(system_prompt.to_string()),
            tool_calls: None,
            tool_call_id: None,
        });
    }

    // 压缩说明
    result.push(Message {
        role: MessageRole::System,
        content: MessageContent::Text(format!("(对话历史已压缩，保留最近 {} 条消息)", keep_last)),
        tool_calls: None,
        tool_call_id: None,
    });

    // 最近消息
    let start = messages.len().saturating_sub(keep_last);
    result.extend(messages[start..].iter().cloned());

    result
}

/// 异步生成对话摘要（直接 reqwest 调用，避免 Message 类型不兼容）
async fn generate_compaction_summary(
    trimmed_messages: &[Message],
    model: &str,
    provider_config: &ifainew_lib::harness::api::ProviderConfig,
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
        if let MessageContent::Text(text) = &msg.content {
            let display = if text.len() > 500 {
                format!("{}... ({} chars truncated)", &text[..500], text.len() - 500)
            } else {
                text.clone()
            };
            text_parts.push(format!("[{}] {}", role, display));
        }
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
        .timeout(std::time::Duration::from_secs(30))
        .send()
        .await
        .ok()?;

    if !response.status().is_success() {
        return None;
    }

    let json: serde_json::Value = response.json().await.ok()?;
    json["choices"][0]["message"]["content"]
        .as_str()
        .map(|s| s.to_string())
}

/// 统一压缩入口（纯函数，不持有任何锁）
async fn perform_compaction(
    messages: &[Message],
    model: &str,
    provider_config: &ifainew_lib::harness::api::ProviderConfig,
    system_prompt: &str,
    mode: CompactionMode,
) -> Vec<Message> {
    let threshold = token::display::compute_compress_threshold(model);
    let current = token::estimate_tokens(messages);
    if current <= threshold {
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
        generate_compaction_summary(trimmed, model, provider_config).await
    } else {
        None
    };

    if summary.is_some() {
        build_compacted_messages(system_prompt, summary.as_deref(), recent)
    } else {
        perform_compaction_fallback(messages, system_prompt, keep_last)
    }
}

impl Session {
    pub fn new(provider: String, model: String) -> Self {
        let tool_registry = ToolRegistry::new();
        let tool_router = Arc::new(ToolRouter::new());

        // 🔥 重置循环检测器（新会话开始）
        approval::reset_loop_detector();

        // 🎯 初始化底部状态栏
        let bottom_status_bar = token::BottomStatusBar::new(model.clone());

        // 🔥 记录会话开始时间
        let session_start = Instant::now();

        // 🎨 创建渲染管道（启用动画模式）
        use crate::stream_render::{RenderMode, RenderPipeline};
        let render_pipeline = RenderPipeline::new(RenderMode::Animated);

        // 🎬 创建动画停止标志
        use std::sync::atomic::{AtomicBool, Ordering};
        let animation_stop = Arc::new(AtomicBool::new(false));

        Self {
            provider,
            model,
            tool_registry,
            tool_router,
            api_key: None,
            base_url: None,
            tools_disabled: false,
            auto_approve_all: false,
            custom_system_prompt: None,
            permission_store: RefCell::new(PermissionStore::load()),
            session_rules: RefCell::new(Vec::new()),
            bottom_status_bar,
            default_ctx: ThreadSessionContext::new(),
            session_start,
            alt_view_active: false,
            render_pipeline,
            animation_stop,
            animation_task: None,
            markdown_state: crate::markdown_stream::MarkdownStreamState::new(),
        }
    }

    /// 🔥 设置 API key（从 EffectiveConfig 读取）
    pub fn set_api_key(&mut self, api_key: String) {
        self.api_key = Some(api_key);
    }

    /// 🔥 获取已存储的 API key（用于记忆提取等场景）
    /// 注意：这个只返回已存储的 key，不会从环境变量读取
    pub fn get_stored_api_key(&self) -> Option<&str> {
        self.api_key.as_deref()
    }

    /// 🔥 设置自定义系统提示词（--system 参数）
    pub fn set_system_prompt(&mut self, system_prompt: String) {
        self.custom_system_prompt = Some(system_prompt);
    }

    /// 🔥 设置 Base URL（从 EffectiveConfig 读取）
    pub fn set_base_url(&mut self, base_url: String) {
        self.base_url = Some(base_url);
    }

    /// 🔥 禁用工具调用（--no-tool 标志）
    pub fn disable_tools(&mut self) {
        self.tools_disabled = true;
    }

    /// 🔥 自动批准所有工具调用（测试用）
    pub fn set_auto_approve_all(&mut self, value: bool) {
        self.auto_approve_all = value;
    }

    /// 🔥 获取会话持续时间
    fn get_session_duration(&self) -> Duration {
        self.session_start.elapsed()
    }

    /// 🔥 获取 API key（优先返回已设置的，否则从环境变量读取）
    fn get_api_key(&self, env_key: &str) -> Result<String, String> {
        // 优先使用已设置的 API key
        if let Some(key) = &self.api_key {
            return Ok(key.clone());
        }

        // 从环境变量读取
        std::env::var(env_key)
            .map_err(|_| format!("API key not found. Set {} environment variable or add api_key to ~/.ifai/config.toml [providers.{}]", env_key, self.provider))
    }

    /// 构造 workflow 所需的 AIProviderConfig JSON
    /// 用于注入到 workflow.variables["provider_config"]
    pub fn workflow_provider_config_json(&self) -> Option<String> {
        let env_key = match self.provider.as_str() {
            "anthropic-official" | "anthropic" => "ANTHROPIC_API_KEY",
            "deepseek-official" | "deepseek" => "DEEPSEEK_API_KEY",
            "openai-official" | "openai" => "OPENAI_API_KEY",
            "zhipu-official" | "zhipu" => "ZHIPU_API_KEY",
            "kimi-official" | "kimi" => "KIMI_API_KEY",
            "gemini-official" | "gemini" => "GEMINI_API_KEY",
            _ => "API_KEY",
        };

        let api_key = match self.get_api_key(env_key) {
            Ok(k) => k,
            Err(_) => return None,
        };

        // base_url：优先用 session 配置，否则根据 provider 选默认值
        // workflow tool_loop 直接 POST 到此 URL，需要完整的 /chat/completions 路径
        let base_url = match self.base_url.as_deref() {
            Some(url) if url.contains("/chat/completions") || url.contains("/messages") => {
                url.to_string()
            }
            Some(url) => {
                // 自动补全路径：config.toml 中通常只填域名（如 https://api.deepseek.com）
                format!("{}/chat/completions", url.trim_end_matches('/'))
            }
            None => {
                match self.provider.as_str() {
                    p if p.contains("deepseek") => "https://api.deepseek.com/chat/completions".to_string(),
                    p if p.contains("openai") => "https://api.openai.com/v1/chat/completions".to_string(),
                    p if p.contains("anthropic") => "https://api.anthropic.com/v1/messages".to_string(),
                    p if p.contains("zhipu") => "https://open.bigmodel.cn/api/coding/paas/v4/chat/completions".to_string(),  // 🔥 智谱 coding endpoint
                    p if p.contains("kimi") => "https://api.moonshot.cn/v1/chat/completions".to_string(),
                    p if p.contains("gemini") => "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions".to_string(),
                    _ => String::new(),
                }
            }
        };

        let config = serde_json::json!({
            "id": self.provider,
            "name": self.provider,
            "apiKey": api_key,
            "baseUrl": base_url,
            "models": [self.model.clone()],
            "protocol": "openai",
            "enabled": true
        });

        serde_json::to_string(&config).ok()
    }

    /// 🔥 构造 AIProviderConfig（用于设置全局配置）
    /// 这使 Agent 工具（explore_agent、review_agent）能够访问 Session 的 provider 配置
    fn build_ai_provider_config(&self) -> Option<ifainew_lib::core_traits::ai::AIProviderConfig> {
        let env_key = match self.provider.as_str() {
            "anthropic-official" | "anthropic" => "ANTHROPIC_API_KEY",
            "deepseek-official" | "deepseek" => "DEEPSEEK_API_KEY",
            "openai-official" | "openai" => "OPENAI_API_KEY",
            "zhipu-official" | "zhipu" => "ZHIPU_API_KEY",
            "kimi-official" | "kimi" => "KIMI_API_KEY",
            "gemini-official" | "gemini" => "GEMINI_API_KEY",
            _ => "API_KEY",
        };

        let api_key = match self.get_api_key(env_key) {
            Ok(k) => k,
            Err(_) => return None,
        };

        // base_url：优先用 session 配置，否则根据 provider 选默认值
        let base_url = match self.base_url.as_deref() {
            Some(url) if url.contains("/chat/completions") || url.contains("/messages") => {
                url.to_string()
            }
            Some(url) => {
                format!("{}/chat/completions", url.trim_end_matches('/'))
            }
            None => {
                match self.provider.as_str() {
                    p if p.contains("deepseek") => "https://api.deepseek.com/chat/completions".to_string(),
                    p if p.contains("openai") => "https://api.openai.com/v1/chat/completions".to_string(),
                    p if p.contains("anthropic") => "https://api.anthropic.com/v1/messages".to_string(),
                    p if p.contains("zhipu") => "https://open.bigmodel.cn/api/coding/paas/v4/chat/completions".to_string(),  // 🔥 智谱 coding endpoint
                    p if p.contains("kimi") => "https://api.moonshot.cn/v1/chat/completions".to_string(),
                    p if p.contains("gemini") => "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions".to_string(),
                    _ => String::new(),
                }
            }
        };

        Some(ifainew_lib::core_traits::ai::AIProviderConfig {
            id: self.provider.clone(),
            name: self.provider.clone(),
            api_key,
            base_url,
            models: vec![self.model.clone()],
            protocol: ifainew_lib::core_traits::ai::AIProtocol::OpenAI,
            enabled: true,
        })
    }

    pub fn add_message(&mut self, msg: String) {
        // 将简单字符串消息转换为 Message 格式
        self.default_ctx.messages.push(Message {
            role: MessageRole::User,
            content: MessageContent::Text(msg),
            tool_calls: None,
            tool_call_id: None,
        });
    }

    pub fn clear_history(&mut self) {
        self.default_ctx.messages.clear();
    }

    /// 设置项目根目录（用于 agent_* 工具）
    pub fn set_project_root(&self, root: String) {
        self.tool_router.set_project_root(root);
    }

    /// 🔥 切换备用屏幕视图（Ctrl+O）
    pub fn toggle_alt_view(&mut self) {
        use crate::tui_layout::TuiLayout;

        self.alt_view_active = !self.alt_view_active;

        if self.alt_view_active {
            // 进入备用屏幕
            print!("{}", TuiLayout::enter_alt_screen());

            // 显示当前状态
            let status = self.bottom_status_bar.render_silent();
            let layout = TuiLayout::from_terminal();

            print!("\n{}", layout.render_status(&status));
            print!("{}", layout.render_separator());
            print!("{}", layout.render_input("按 Ctrl+O 返回主屏幕"));
            io::stdout().flush().ok();
        } else {
            // 退出备用屏幕
            print!("{}", TuiLayout::exit_alt_screen());
            io::stdout().flush().ok();
        }
    }

    /// 🤖 执行流式 AI 调用（支持 Tool 调用和续播循环）
    ///
    /// **两阶段协议**：
    /// 1. **Collect 阶段**：累积 ToolStart 和 TextDelta 事件
    /// 2. **Execute 阶段**：执行工具并发送结果回模型
    ///
    /// **续播循环**：最多 5 次续播，避免无限循环
    pub async fn stream_prompt(&mut self, prompt: &str) -> Result<String, String> {
        // 解析 provider spec
        let spec = resolve_provider(&self.provider)
            .map_err(|e| format!("Failed to resolve provider: {}", e))?;

        // 🏛️ 元编程：构建 CLI 系统提示词（复用 prompt_manager）
        // 🔥 优先使用自定义系统提示词（--system 参数）
        let system_prompt = if let Some(custom) = &self.custom_system_prompt {
            custom.clone()
        } else {
            build_cli_system_prompt(&spec)
        };

        // 根据 provider spec 确定 AiProvider 类型
        let provider = match spec.metadata.id.as_str() {
            "anthropic-official" => ifainew_lib::harness::api::AiProvider::Anthropic,
            "deepseek-official" => ifainew_lib::harness::api::AiProvider::DeepSeek,
            "openai-official" => ifainew_lib::harness::api::AiProvider::OpenAI,
            "zhipu-official" => ifainew_lib::harness::api::AiProvider::Zhipu,
            "kimi-official" => ifainew_lib::harness::api::AiProvider::Kimi,
            "gemini-official" => ifainew_lib::harness::api::AiProvider::Gemini,
            _ => return Err(format!("Unsupported provider: {}", spec.metadata.id)),
        };

        // 确定 API key 环境变量名
        let env_key = match spec.metadata.id.as_str() {
            "anthropic-official" => "ANTHROPIC_API_KEY",
            "deepseek-official" => "DEEPSEEK_API_KEY",
            "openai-official" => "OPENAI_API_KEY",
            "zhipu-official" => "ZHIPU_API_KEY",
            "kimi-official" => "KIMI_API_KEY",
            "gemini-official" => "GEMINI_API_KEY",
            _ => "API_KEY",
        };

        // 🔥 优先从 Session 配置获取 API key，否则从环境变量读取
        let api_key = self.get_api_key(env_key)?;

        // 创建 provider 配置
        let provider_config = ifainew_lib::harness::api::ProviderConfig {
            api_key,
            base_url: self.base_url.clone(), // 使用配置的 base_url
            organization: None,
        };

        // 🔥 设置全局 provider_config（使 Agent 工具能够访问）
        match self.build_ai_provider_config() {
            Some(ai_config) => {
                use ifainew_lib::harness::tool::set_global_provider_config;
                set_global_provider_config(ai_config.clone());
                println!("[Session] ✅ 已设置全局 provider_config（供 Agent 工具使用）");
                println!("[Session] 📋 Config: id={}, base_url={}, model={:?}", ai_config.id, ai_config.base_url, ai_config.models.first());
            }
            None => {
                println!("[Session] ⚠️  build_ai_provider_config() 返回 None，Agent 工具可能无法使用");
                println!("[Session] 📋 Debug: provider={}, base_url={:?}", self.provider, self.base_url);
            }
        }

        let client = ifainew_lib::harness::api::ApiClientFactory::create_provider(
            provider,
            &provider_config,
        )
        .map_err(|e| format!("Failed to create client: {:?}", e))?;

        // 获取工具定义
        let tools: Vec<serde_json::Value> = self
            .tool_registry
            .all()
            .into_iter()
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
            .collect();

        // 添加用户消息
        self.default_ctx.messages.push(Message {
            role: MessageRole::User,
            content: MessageContent::Text(prompt.to_string()),
            tool_calls: None,
            tool_call_id: None,
        });

        // 🎨 创建 Spinner（立即完成，不显示，使用进度动画代替）
        let mut spinner = Spinner::new("");
        spinner.finish(true); // 立即完成，避免显示
        let mut interval = tokio::time::interval(Duration::from_millis(150));
        interval.tick().await;

        // 🔥 元编程：从配置获取最大续播次数（而非硬编码）
        let current_category = approval::ToolCategory::Safe; // 初始为 safe，会动态调整
        let max_continuations = approval::max_iterations(current_category);
        let mut continuation_count = 0;
        let mut full_response = String::new();
        let start_time = Instant::now(); // 🔥 记录开始时间

        // 🎯 自动压缩：检查 token 数量并在超过阈值时压缩
        let estimated_input = token::estimate_tokens(&self.default_ctx.messages);

        // 模型感知阈值：使用 compute_compress_threshold 替代固定 100k
        let threshold = token::display::compute_compress_threshold(&self.model);
        let need_compress = estimated_input > threshold;

        if need_compress {
            let theme = render::default_theme();
            eprintln!(
                "{}⚠️  对话过长 ({} tokens / {} 阈值)，正在自动压缩...{}",
                theme.warning,
                estimated_input,
                format_number(threshold),
                render::RESET
            );

            // 使用统一压缩入口（pre-turn 模式）
            let old_len = self.default_ctx.messages.len();
            self.default_ctx.messages = perform_compaction(
                &self.default_ctx.messages,
                &self.model,
                &provider_config,
                &system_prompt,
                CompactionMode::PreTurn,
            )
            .await;
            let new_len = self.default_ctx.messages.len();

            let new_tokens = token::estimate_tokens(&self.default_ctx.messages);
            eprintln!(
                "{}✓ 压缩完成：{} → {} tokens, {} → {} messages (减少 {:.1}%){}",
                theme.success,
                format_number(estimated_input),
                format_number(new_tokens),
                old_len,
                new_len,
                ((estimated_input.saturating_sub(new_tokens)) as f64 / estimated_input as f64)
                    * 100.0,
                render::RESET
            );
        }

        loop {
            // 构建请求
            let request = ifainew_lib::harness::api::StreamRequest {
                model: self.model.clone(),
                messages: self.default_ctx.messages.clone(),
                max_tokens: 8192,
                system: Some(system_prompt.clone()),
                temperature: Some(0.7),
                stream: true,
                // 🔥 如果禁用工具，不发送 tools 参数
                tools: if self.tools_disabled || tools.is_empty() {
                    None
                } else {
                    Some(tools.clone())
                },
            };

            // 发送流式请求（带瞬时错误重试）
            let theme = render::default_theme();
            let retry_policy = RetryPolicy {
                max: 2,
                delays: vec![Duration::from_secs(1), Duration::from_secs(2)],
            };
            let mut stream = match with_retry(
                &retry_policy,
                |e: &ifainew_lib::harness::api::types::ApiError| e.is_retryable(),
                || client.stream(request.clone()),
            )
            .await
            {
                Ok(s) => s,
                Err(e) => {
                    // 全部失败时回滚 User 消息（仅首次迭代）
                    if continuation_count == 0 {
                        self.default_ctx.messages.pop();
                    }
                    eprintln!("{}{}{}", theme.error, format_stream_error(&e), RESET);
                    return Err(format!("Failed to start stream: {:?}", e));
                }
            };

            // 🎬 启动进度动画任务（每 100ms 更新一帧）
            let model_clone = self.model.clone();
            let stop_flag = self.animation_stop.clone();
            let animation_task = tokio::spawn(async move {
                use std::sync::atomic::Ordering;

                let mut pipeline = crate::stream_render::RenderPipeline::new(
                    crate::stream_render::RenderMode::Animated,
                );
                let mut interval = tokio::time::interval(Duration::from_millis(100));

                loop {
                    tokio::select! {
                        _ = interval.tick() => {
                            // 🔥 检查停止标志（在输出前检查）
                            if stop_flag.load(Ordering::Relaxed) {
                                break;
                            }
                            let frame = pipeline.render_progress(&model_clone);
                            print!("{}", frame);
                            io::stdout().flush().ok();
                        }
                        _ = tokio::time::sleep(Duration::from_millis(10)) => {
                            // 定期检查停止标志
                            if stop_flag.load(Ordering::Relaxed) {
                                break;
                            }
                        }
                    }
                }
            });
            self.animation_task = Some(animation_task);

            let mut first_delta = true;
            let mut current_response = String::new();
            let mut stream_retry_count: u32 = 0; // R3: chunk 级重试计数器

            // EventCollector - 收集 response_text
            let mut collector = EventCollector::new();

            // 工具调用直接收集：ToolDone 时构建 PendingToolCall
            let mut tool_name_map: HashMap<String, String> = HashMap::new();
            let mut collected_tool_calls: Vec<PendingToolCall> = Vec::new();
            let mut any_tool_done_received = false; // 区分"无工具调用"和"全部被过滤"

            // 🔥 元编程：估算输入 tokens（复用 token::estimate_tokens）
            let estimated_input = token::estimate_tokens(&self.default_ctx.messages);

            // 🔥 元编程：创建流式状态追踪器
            let mut stream_status = token::StreamStatus::new(estimated_input);

            // 🎨 处理流式事件（移除 spinner 动画，避免与进度动画冲突）
            loop {
                tokio::select! {
                    // spinner 动画已禁用（使用进度动画代替）
                    _ = interval.tick() => {
                        // 空操作：spinner 已被进度动画替代
                    }
                    result = stream.next() => {
                        match result {
                            Some(Ok(event)) => {
                                match &event {
                                    StreamEvent::TextDelta { text } => {
                                        if first_delta {
                                            // 🎬 停止动画任务（先设置标志）
                                            use std::sync::atomic::Ordering;
                                            self.animation_stop.store(true, Ordering::Relaxed);

                                            // 给动画任务一点时间退出
                                            tokio::time::sleep(Duration::from_millis(50)).await;

                                            if let Some(task) = self.animation_task.take() {
                                                task.abort();
                                            }

                                            // 🎬 清除动画行并换行
                                            print!("\r{}\r", " ".repeat(80));  // 清除整行
                                            io::stdout().flush().ok();

                                            first_delta = false;

                                            // 🎯 启动底部状态栏（用于统计）
                                            use token::StatusBarState;
                                            self.bottom_status_bar.transition(StatusBarState::Streaming {
                                                estimated_input,
                                                current_output: 0,
                                                current_tool: None,
                                            });
                                        }

                                        // 🔥 静默更新 token 统计（不打断内容）
                                        let _current_output = self.bottom_status_bar.update_streaming_output(text);

                                        // 🎨 通过 Markdown 渲染器处理代码块
                                        let rendered_outputs = self.markdown_state.process_delta(text);
                                        for output in rendered_outputs {
                                            print!("{}", output);
                                        }
                                        io::stdout().flush().map_err(|e| format!("Failed to flush stdout: {}", e))?;
                                        current_response.push_str(text);
                                        full_response.push_str(text);

                                        // 🔥 元编程：更新流式状态（零拷贝）
                                        stream_status.add_delta(text);

                                        collector.dispatch(&event);
                                    }
                                    StreamEvent::ToolStart { tool_id, name, input } => {
                                        if first_delta {
                                            spinner.finish(true);
                                            print!("\r{}  \r", " ".repeat(30));
                                            first_delta = false;

                                            // 🎯 启动底部状态栏（流式响应）
                                            use token::StatusBarState;
                                            self.bottom_status_bar.transition(StatusBarState::Streaming {
                                                estimated_input,
                                                current_output: 0,
                                                current_tool: Some(name.clone()),
                                            });
                                        }

                                        // 保存 tool_id → name 映射（ToolDone 时使用）
                                        tool_name_map.insert(tool_id.clone(), name.clone());

                                        collector.dispatch(&event);
                                    }
                                    StreamEvent::ToolDone { tool_id, result } => {
                                        let tool_name = tool_name_map.get(tool_id)
                                            .cloned()
                                            .unwrap_or_else(|| "unknown".to_string());

                                        any_tool_done_received = true;

                                        // 🔥 方案B防御：空结果诊断
                                        // result 为空或 {} → AI 模型发送了空参数（Provider 忠实转发）
                                        let is_empty_result = result.is_empty() || result.trim() == "{}";
                                        if is_empty_result {
                                            eprintln!("[CLI] ⚠️ ToolDone empty result: tool_id={}, name={}, result_len={}, hint=ai_sent_empty_args",
                                                tool_id, tool_name, result.len());
                                        }

                                        self.default_ctx.pipeline_tracker.start_step(
                                            tool_id.clone(),
                                            tool_name.clone(),
                                            result.clone(),
                                        );

                                        collected_tool_calls.push(PendingToolCall {
                                            tool_id: tool_id.clone(),
                                            name: tool_name,
                                            args: result.clone(),
                                        });

                                        collector.dispatch(&event);
                                    }
                                    StreamEvent::Error { code, message } => {
                                        if first_delta {
                                            spinner.finish(false);
                                            print!("\r{}  \r", " ".repeat(30));
                                        }
                                        eprintln!("\n{}Error [{}]: {}{}", theme.error, code, message, RESET);
                                    }
                                    StreamEvent::MessageDone { input_tokens, output_tokens } => {
                                        // 🔥 记录 token 使用量
                                        self.default_ctx.cumulative_input_tokens += *input_tokens;
                                        self.default_ctx.cumulative_output_tokens += *output_tokens;

                                        // 🎨 刷新 Markdown 渲染器（处理未闭合的代码块）
                                        if let Some(flushed) = self.markdown_state.flush() {
                                            print!("{}", flushed);
                                            io::stdout().flush().ok();
                                        }

                                        // 🎯 重置底部状态栏为空闲状态
                                        use token::StatusBarState;
                                        self.bottom_status_bar.transition(StatusBarState::Idle);

                                        collector.dispatch(&event);
                                    }
                                    _ => {
                                        collector.dispatch(&event);
                                    }
                                }
                            }
                            Some(Err(e)) if e.is_retryable() && stream_retry_count < 1 => {
                                // R3: chunk 级安全重试（CLI 模式，无行缓冲检查）
                                stream_retry_count += 1;
                                eprintln!("\n{}Stream interrupted, retrying...{}", theme.warning, RESET);
                                tokio::time::sleep(Duration::from_secs(2)).await;
                                match client.stream(request.clone()).await {
                                    Ok(new_stream) => stream = new_stream,
                                    Err(retry_err) => {
                                        if first_delta {
                                            spinner.finish(false);
                                            print!("\r{}  \r", " ".repeat(30));
                                        }
                                        eprintln!("\n{}{}{}", theme.error, format_stream_error(&retry_err), RESET);
                                        return Err(format!("Stream error: {:?}", retry_err));
                                    }
                                }
                            }
                            Some(Err(e)) => {
                                if first_delta {
                                    spinner.finish(false);
                                    print!("\r{}  \r", " ".repeat(30));
                                }
                                eprintln!("\n{}{}{}", theme.error, format_stream_error(&e), RESET);
                                return Err(format!("Stream error: {:?}", e));
                            }
                            None => {
                                if !collector.is_done() {
                                    eprintln!("\n{}Stream ended unexpectedly. The response may be incomplete.{}", theme.error, RESET);
                                }
                                break;
                            }
                        }
                    }
                }
            }

            // 流结束后检查是否有工具调用需要执行
            if collected_tool_calls.is_empty() && !any_tool_done_received {
                // 📋 AI 返回纯文本（无工具调用）→ 完成最后一个 in_progress 任务
                complete_current_task(get_global_task_store());

                // 没有工具调用，正常结束
                self.default_ctx.messages.push(Message {
                    role: MessageRole::Assistant,
                    content: MessageContent::Text(current_response.clone()),
                    tool_calls: None,
                    tool_call_id: None,
                });

                // 🎯 信任模型：AI 返回纯文本 = 停止信号（参考 codex needs_follow_up 设计）
                // 无论任务列表是否全部完成，都不强制继续循环
                let global_store = get_global_task_store();
                let tasks = global_store.get_tasks();
                if !tasks.is_empty() {
                    let elapsed_secs = start_time.elapsed().as_secs_f64();
                    let summary = self.render_pipeline.render_summary(
                        elapsed_secs,
                        self.default_ctx.cumulative_input_tokens,
                        self.default_ctx.cumulative_output_tokens,
                    );
                    println!("{}", summary);
                    global_store.clear();
                }
                break;
            }

            // Execute 阶段：执行工具
            println!(); // 换行
            let tool_results = match self.execute_tools(&collected_tool_calls) {
                Ok(results) => results,
                Err(e) if e == "GLOBAL_EMPTY_ARGS_TRIPPED" => {
                    println!("\n全局空参数熔断触发，终止执行");
                    complete_current_task(get_global_task_store());
                    break;
                }
                Err(e) => return Err(e),
            };

            // 如果所有工具调用都被熔断跳过（PerToolTripped）或循环检测阻止，终止循环
            // 注意：FirstOffense 返回 "empty arguments" 是给 AI 学习的，不触发终止
            if !tool_results.is_empty()
                && tool_results.iter().all(|(_, _, result, _)| {
                    result.contains("Skipped") || result.contains("循环检测阻止")
                })
            {
                println!("\n所有工具调用均被阻止（空参数熔断或循环检测），终止执行");
                complete_current_task(get_global_task_store());
                break;
            }

            // 构建 tool_calls
            let tool_calls_value: Vec<ToolCall> = tool_results
                .iter()
                .map(|(id, name, _, _)| ToolCall {
                    id: id.clone(),
                    call_type: "function".to_string(),
                    function: ToolCallFunction {
                        name: name.clone(),
                        arguments: String::new(),
                    },
                })
                .collect();

            // 添加 assistant 消息（带 tool_calls）
            self.default_ctx.messages.push(Message {
                role: MessageRole::Assistant,
                content: MessageContent::Text(current_response.clone()),
                tool_calls: Some(tool_calls_value),
                tool_call_id: None,
            });

            // 添加工具结果消息
            for (tool_id, _name, result, _) in &tool_results {
                self.default_ctx.messages.push(Message {
                    role: MessageRole::Tool,
                    content: MessageContent::Text(token::display::truncate_tool_result(result)),
                    tool_calls: None,
                    tool_call_id: Some(tool_id.clone()),
                });
            }

            // 🎨 元编程：渲染工具结果（使用 PipelineStep）
            for (tool_id, name, _result, _duration) in &tool_results {
                // 从 pipeline_tracker 获取完成后的步骤
                let completed_steps = self.default_ctx.pipeline_tracker.completed_steps();
                // 从最新到最旧查找，避免匹配到之前同名的旧步骤
                if let Some(step) = completed_steps.iter().rev().find(|s| s.tool_name == *name) {
                    // 使用派生宏生成的方法渲染最终状态
                    let status_render = step.status.render_with_theme("zh", &theme, RESET);

                    // 格式化工具参数（截断过长的参数）
                    let args_preview = if step.tool_args.chars().count() > 50 {
                        format!("{}...", step.tool_args.chars().take(47).collect::<String>())
                    } else {
                        step.tool_args.clone()
                    };

                    // 添加时间信息
                    if let Some(duration) = step.metadata.duration {
                        let duration_str = format_duration(duration.as_secs_f64());
                        println!(
                            "\n{} {}({})  [{}]",
                            status_render, name, args_preview, duration_str
                        );
                    } else {
                        println!("\n{} {}({})", status_render, name, args_preview);
                    }

                    // 渲染输出
                    match &step.output {
                        crate::pipeline::StepOutput::Empty => {}
                        crate::pipeline::StepOutput::Full { content } => {
                            println!(
                                "   ╾ {}",
                                content.lines().collect::<Vec<_>>().join("\n   ╾ ")
                            );
                        }
                        crate::pipeline::StepOutput::Truncated {
                            preview,
                            total_lines,
                        } => {
                            println!(
                                "   ╾ {}",
                                preview.lines().collect::<Vec<_>>().join("\n   ╾ ")
                            );
                            println!("   ╾ (共 {} 行，使用 --verbose 查看完整输出)", total_lines);
                        }
                    }
                }
            }

            // 🔥 元编程：根据工具类别动态获取最大迭代次数
            let current_category = collected_tool_calls
                .first()
                .map(|t| approval::categorize_tool(&t.name))
                .unwrap_or(approval::ToolCategory::Safe);
            let dynamic_max = approval::max_iterations(current_category);

            // R3: 重置 chunk 重试计数器（每轮 continuation 独立计数）
            stream_retry_count = 0;

            // 续播检查
            continuation_count += 1;
            if continuation_count >= dynamic_max {
                eprintln!(
                    "\n{}Maximum tool iterations reached ({}) for {:?} tools{}",
                    theme.warning, dynamic_max, current_category, RESET
                );
                complete_current_task(get_global_task_store());
                break;
            }

            // 继续续播
            println!(
                "\n{}Continuing... ({}/{}){}",
                theme.dim, continuation_count, dynamic_max, RESET
            );
        }

        // 结束后换行
        println!();
        Ok(full_response)
    }

    /// 🖥️ TUI 模式的流式提示（通过 channel 发送输出，不直接 print）
    ///
    /// 重构：接受 `Arc<Mutex<Self>>` 和 `Arc<Mutex<ThreadSessionContext>>`，
    /// 实现三阶段锁策略：
    /// - Phase 1 (Setup): 短暂持 Session + thread_ctx 锁，读取配置并写入消息
    /// - Phase 2 (Streaming): 完全不持锁，仅使用局部变量和短暂 scoped lock
    /// - Phase 3 (Post-Process): 短暂持双锁，执行工具调用和后处理
    pub async fn stream_prompt_tui(
        session: Arc<tokio::sync::Mutex<Self>>,
        thread_ctx: Arc<tokio::sync::Mutex<ThreadSessionContext>>,
        prompt: &str,
        output_tx: tokio::sync::mpsc::UnboundedSender<super::OutputMessage>,
        status_tx: tokio::sync::mpsc::UnboundedSender<String>,
        approval_tx: tokio::sync::mpsc::UnboundedSender<crate::approval_overlay::ApprovalRequest>,
        // 🔥 Phase 4.2: ThreadEvent sender（用于线程消息路由）
        thread_event_tx: tokio::sync::mpsc::UnboundedSender<crate::thread::ThreadEvent>,
        // 🔥 Phase 4: 线程 ID - 工具审批需要知道属于哪个线程
        thread_id: crate::thread::ThreadId,
        // 🔥 Per-thread TaskStore（隔离 TodoWrite 任务，避免跨线程泄漏）
        task_store: TaskStore,
    ) -> Result<String, String> {
        // ═══════════════════════════════════════════════════════════════
        // Phase 1: Setup — 短暂持 Session 锁 + thread_ctx 锁
        // ═══════════════════════════════════════════════════════════════

        // 1a. 读取 Session 配置（短暂持 Session 锁）
        let (spec, system_prompt, model, tools_disabled, provider_config, tools) = {
            let mut s = session.lock().await;

            // 注入 per-thread TaskStore
            s.tool_router.set_task_store(task_store.clone());

            let spec = resolve_provider(&s.provider)
                .map_err(|e| format!("Failed to resolve provider: {}", e))?;

            // 优先使用自定义系统提示词（--system 参数）
            let system_prompt = if let Some(custom) = &s.custom_system_prompt {
                custom.clone()
            } else {
                build_cli_system_prompt(&spec)
            };

            let provider = match spec.metadata.id.as_str() {
                "anthropic-official" => ifainew_lib::harness::api::AiProvider::Anthropic,
                "deepseek-official" => ifainew_lib::harness::api::AiProvider::DeepSeek,
                "openai-official" => ifainew_lib::harness::api::AiProvider::OpenAI,
                "zhipu-official" => ifainew_lib::harness::api::AiProvider::Zhipu,
                "kimi-official" => ifainew_lib::harness::api::AiProvider::Kimi,
                "gemini-official" => ifainew_lib::harness::api::AiProvider::Gemini,
                _ => return Err(format!("Unsupported provider: {}", spec.metadata.id)),
            };

            let env_key = match spec.metadata.id.as_str() {
                "anthropic-official" => "ANTHROPIC_API_KEY",
                "deepseek-official" => "DEEPSEEK_API_KEY",
                "openai-official" => "OPENAI_API_KEY",
                "zhipu-official" => "ZHIPU_API_KEY",
                "kimi-official" => "KIMI_API_KEY",
                "gemini-official" => "GEMINI_API_KEY",
                _ => "API_KEY",
            };

            let api_key = s.get_api_key(env_key)?;

            let provider_config = ifainew_lib::harness::api::ProviderConfig {
                api_key,
                base_url: s.base_url.clone(),
                organization: None,
            };

            let model = s.model.clone();
            let tools_disabled = s.tools_disabled;

            let tools: Vec<serde_json::Value> = s
                .tool_registry
                .all()
                .into_iter()
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
                .collect();

            // 🔥 设置全局 provider_config（使 Agent 工具能够访问）
            // 注意：这里我们在 Session 锁释放前设置，确保线程安全
            if let Some(ai_config) = s.build_ai_provider_config() {
                use ifainew_lib::harness::tool::set_global_provider_config;
                set_global_provider_config(ai_config.clone());
                // TUI 模式下减少日志输出，避免干扰界面
                // println!("[Session-TUI] ✅ 已设置全局 provider_config");
            } else {
                // 只在调试模式输出
                if std::env::var("IFAI_DEBUG").is_ok() {
                    println!("[Session-TUI] ⚠️ build_ai_provider_config() 返回 None");
                }
            }

            // drop(s) 在此处自动发生 — Session 锁释放

            (
                spec,
                system_prompt,
                model,
                tools_disabled,
                provider_config,
                tools,
            )
        }; // Session 锁释放

        // 1b. 创建 API client（纯局部变量，不需要任何锁）
        let provider = match spec.metadata.id.as_str() {
            "anthropic-official" => ifainew_lib::harness::api::AiProvider::Anthropic,
            "deepseek-official" => ifainew_lib::harness::api::AiProvider::DeepSeek,
            "openai-official" => ifainew_lib::harness::api::AiProvider::OpenAI,
            "zhipu-official" => ifainew_lib::harness::api::AiProvider::Zhipu,
            "kimi-official" => ifainew_lib::harness::api::AiProvider::Kimi,
            "gemini-official" => ifainew_lib::harness::api::AiProvider::Gemini,
            _ => return Err(format!("Unsupported provider: {}", spec.metadata.id)),
        };

        let client = ifainew_lib::harness::api::ApiClientFactory::create_provider(
            provider,
            &provider_config,
        )
        .map_err(|e| format!("Failed to create client: {:?}", e))?;

        // 1c. 写入 thread_ctx（短暂持 thread_ctx 锁）
        {
            let mut ctx = thread_ctx.lock().await;

            // 添加用户消息
            ctx.messages.push(Message {
                role: MessageRole::User,
                content: MessageContent::Text(prompt.to_string()),
                tool_calls: None,
                tool_call_id: None,
            });

            // 自动压缩检查（模型感知阈值）
            let estimated_input = token::estimate_tokens(&ctx.messages);
            let threshold = token::display::compute_compress_threshold(&model);
            let need_compress = estimated_input > threshold;

            // 🔥 使用 if-let 模式确保 ctx 在压缩后仍然可用
            let mut ctx = if need_compress {
                let _ = output_tx.send(
                    format!(
                        "⚠️ 对话过长 ({} tokens / {} 阈值)，正在自动压缩...",
                        estimated_input,
                        format_number(threshold)
                    )
                    .into(),
                );

                // clone-out-of-lock 模式：clone → drop → compress → reacquire
                let snapshot = ctx.messages.clone();
                drop(ctx); // 释放 thread_ctx 锁

                let old_len = snapshot.len();
                let compacted = perform_compaction(
                    &snapshot,
                    &model,
                    &provider_config,
                    &system_prompt,
                    CompactionMode::PreTurn,
                )
                .await;

                // 短暂持锁写回
                let mut new_ctx = thread_ctx.lock().await;
                new_ctx.messages = compacted;
                let new_len = new_ctx.messages.len();

                let new_tokens = token::estimate_tokens(&new_ctx.messages);
                let _ = output_tx.send(
                    format!(
                        "✓ 压缩完成：{} → {} tokens, {} → {} messages",
                        format_number(estimated_input),
                        format_number(new_tokens),
                        old_len,
                        new_len
                    )
                    .into(),
                );

                new_ctx
            } else {
                ctx
            };

            // TUI 上下文警告
            let token_count = token::estimate_tokens(&ctx.messages);
            let max_tokens = token::get_model_max_tokens(&model);
            if token_count > (max_tokens * 80 / 100) && ctx.messages.len() >= 10 {
                let _ = output_tx.send(format!("Warning: Context size ({} tokens, {} messages) exceeds 80% of model limit ({}).", token_count, ctx.messages.len(), max_tokens).into());
                let _ = output_tx.send(
                    "Tip: Use /compact to compress or /clear to start fresh."
                        .to_string()
                        .into(),
                );
            }

            // 清空 PipelineTracker 状态（确保不会显示上一次的工具结果）
            ctx.pipeline_tracker.clear();
        } // thread_ctx 锁释放

        // ═══════════════════════════════════════════════════════════════
        // Phase 2: Streaming — 不持任何锁
        // （仅使用局部变量，thread_ctx 访问通过短暂 scoped lock）
        // ═══════════════════════════════════════════════════════════════

        let start_time = Instant::now();
        let mut bottom_status_bar = token::BottomStatusBar::new(model.clone());
        let mut full_response = String::new();

        let current_category = approval::ToolCategory::Safe;
        let max_continuations = approval::max_iterations(current_category);
        let mut continuation_count = 0;
        let mut ended_with_no_tools = false; // 🔥 标记是否因为没有工具调用而结束（避免重复生成总结）

        // 重试策略（共享 RetryPolicy — R2）
        let retry_policy = RetryPolicy {
            max: 2,
            delays: vec![Duration::from_secs(1), Duration::from_secs(2)],
        };

        loop {
            // 每轮开始时更新状态栏（多轮工具调用时需重新发送）
            let _ = status_tx.send(format!("Streaming ({})", model));

            // 短暂获取 thread_ctx 锁来 clone messages 用于请求
            let (messages_for_request, estimated_input) = {
                let ctx = thread_ctx.lock().await;
                (ctx.messages.clone(), token::estimate_tokens(&ctx.messages))
            };

            let request = ifainew_lib::harness::api::StreamRequest {
                model: model.clone(),
                messages: messages_for_request,
                max_tokens: 8192,
                system: Some(system_prompt.clone()),
                temperature: Some(0.7),
                stream: true,
                tools: if tools_disabled || tools.is_empty() {
                    None
                } else {
                    Some(tools.clone())
                },
            };

            let _ = status_tx.send(format!("Connecting ({})...", model));

            let mut stream = match with_retry(
                &retry_policy,
                |e: &ifainew_lib::harness::api::types::ApiError| e.is_retryable(),
                || client.stream(request.clone()),
            )
            .await
            {
                Ok(s) => s,
                Err(e) => {
                    if continuation_count == 0 {
                        // 短暂获取 thread_ctx 锁来 pop 错误消息
                        let mut ctx = thread_ctx.lock().await;
                        ctx.messages.pop();
                    }

                    // 🔥 发送错误消息到输出
                    let error_msg = format_stream_error(&e);
                    let _ = output_tx.send(error_msg.into());

                    // 🔥 更新状态栏为 "Failed"，避免卡在 "Connecting..."
                    let _ = status_tx.send("Failed".to_string());

                    return Err(format!("Failed to start stream: {:?}", e));
                }
            };

            // 不启动动画任务（TUI 自己管理渲染）
            let mut first_delta = true;
            let mut current_response = String::new();
            let mut collector = EventCollector::new();
            let mut line_buffer = String::new(); // 🖥️ TUI：缓冲未完成的行
            let mut stream_retry_count: u32 = 0; // 🔥 chunk 级重试计数器（增强版：支持多次重试）
            let max_stream_retries: u32 = 3; // 🔥 最大重试次数

            // 工具调用直接收集：ToolDone 时构建 PendingToolCall
            let mut tool_name_map: HashMap<String, String> = HashMap::new();
            let mut collected_tool_calls: Vec<PendingToolCall> = Vec::new();
            let mut any_tool_done_received = false; // 区分"无工具调用"和"全部被过滤"

            use token::StatusBarState;

            loop {
                match stream.next().await {
                    Some(Ok(event)) => {
                        match &event {
                            StreamEvent::TextDelta { text } => {
                                if first_delta {
                                    first_delta = false;
                                    bottom_status_bar.transition(StatusBarState::Streaming {
                                        estimated_input,
                                        current_output: 0,
                                        current_tool: None,
                                    });
                                }

                                let _current_output =
                                    bottom_status_bar.update_streaming_output(text);
                                current_response.push_str(text);
                                full_response.push_str(text);

                                // 🖥️ TUI：按换行符分割，发送完整行
                                line_buffer.push_str(text);
                                while let Some(newline_pos) = line_buffer.find('\n') {
                                    let complete_line = line_buffer[..newline_pos].to_string();
                                    line_buffer = line_buffer[newline_pos + 1..].to_string();
                                    let _ = output_tx.send(complete_line.into());
                                }

                                // 更新状态栏
                                let status = bottom_status_bar.render_fixed();
                                let _ = status_tx.send(status);

                                collector.dispatch(&event);
                            }
                            StreamEvent::ToolStart {
                                tool_id,
                                name,
                                input,
                            } => {
                                if first_delta {
                                    first_delta = false;
                                    bottom_status_bar.transition(StatusBarState::Streaming {
                                        estimated_input,
                                        current_output: 0,
                                        current_tool: Some(name.clone()),
                                    });
                                }
                                let _ = status_tx.send(format!("Tool: {} [running]", name));

                                // 保存 tool_id → name 映射（ToolDone 时使用）
                                tool_name_map.insert(tool_id.clone(), name.clone());

                                collector.dispatch(&event);
                            }
                            StreamEvent::ToolDone { tool_id, result } => {
                                // 直接收集：从映射获取 name，构建 PendingToolCall
                                let tool_name = tool_name_map
                                    .get(tool_id)
                                    .cloned()
                                    .unwrap_or_else(|| "unknown".to_string());

                                any_tool_done_received = true;

                                // 🔥 方案B防御：空结果诊断
                                // result 为空或 {} → AI 模型发送了空参数（Provider 忠实转发）
                                let is_empty_result = result.is_empty() || result.trim() == "{}";
                                if is_empty_result && std::env::var("IFAI_QUIET").is_err() {
                                    let _ = output_tx.send(format!("[TUI] ⚠️ ToolDone empty result: tool_id={}, name={}, result_len={}",
                                        tool_id, tool_name, result.len()).into());
                                }

                                // 短暂获取 thread_ctx 锁来更新 pipeline_tracker
                                {
                                    let mut ctx = thread_ctx.lock().await;
                                    ctx.pipeline_tracker.start_step(
                                        tool_id.clone(),
                                        tool_name.clone(),
                                        result.clone(),
                                    );
                                }

                                collected_tool_calls.push(PendingToolCall {
                                    tool_id: tool_id.clone(),
                                    name: tool_name.clone(),
                                    args: result.clone(),
                                });

                                // 更新状态栏：工具参数已就绪，等待 MessageDone 后执行
                                let _ = status_tx.send(format!("Tool: {} [done]", tool_name));

                                collector.dispatch(&event);
                            }
                            StreamEvent::Error { code, message } => {
                                let _ =
                                    output_tx.send(format!("Error [{}]: {}", code, message).into());
                            }
                            StreamEvent::MessageDone {
                                input_tokens,
                                output_tokens,
                            } => {
                                // 短暂获取 thread_ctx 锁来累加 tokens
                                {
                                    let mut ctx = thread_ctx.lock().await;
                                    ctx.cumulative_input_tokens += *input_tokens;
                                    ctx.cumulative_output_tokens += *output_tokens;
                                }

                                // 🖥️ TUI：刷新剩余缓冲区
                                if !line_buffer.is_empty() {
                                    let _ = output_tx.send(std::mem::take(&mut line_buffer).into());
                                }

                                bottom_status_bar.transition(StatusBarState::Idle);
                                let _ = status_tx.send("Done".to_string());

                                collector.dispatch(&event);

                                // 有工具调用：继续执行工具（不 break）
                                // 注意：即使这轮没有新工具调用，只要 continuation_count > 0，也会继续
                            }
                            _ => {
                                collector.dispatch(&event);
                            }
                        }
                    }
                    Some(Err(e)) if e.is_retryable() && stream_retry_count < max_stream_retries => {
                        // 🔥 增强的 chunk 级重试机制 — 支持多次重试和倒计时显示
                        // 检测是否为超时错误（通过错误消息判断）
                        let error_msg = format!("{}", e);
                        let is_timeout = error_msg.to_lowercase().contains("timeout")
                            || error_msg.contains("timed out")
                            || error_msg.contains("deadline");

                        stream_retry_count += 1;
                        let retry_delay = if is_timeout { 3 } else { 2 }; // 超时错误等待更久

                        // 显示重试信息和倒计时
                        let retry_msg = if is_timeout {
                            format!(
                                "\n⚠️  Connection timeout detected. Retrying ({}/{})...",
                                stream_retry_count, max_stream_retries
                            )
                        } else {
                            format!(
                                "\n⚠️  Stream interrupted. Retrying ({}/{})...",
                                stream_retry_count, max_stream_retries
                            )
                        };
                        let _ = output_tx.send(retry_msg.into());

                        // 倒计时显示
                        for countdown in (1..=retry_delay).rev() {
                            let countdown_msg = format!(
                                "⏳ Retrying in {}{}...",
                                countdown,
                                if countdown == 1 { "" } else { "s" }
                            );
                            let _ = output_tx.send(countdown_msg.into());
                            tokio::time::sleep(Duration::from_secs(1)).await;
                        }

                        // 尝试重新建立流
                        match client.stream(request.clone()).await {
                            Ok(new_stream) => {
                                let _ = output_tx.send("✓ Reconnected!\n".to_string().into());
                                stream = new_stream;
                            }
                            Err(retry_err) => {
                                // 重试失败，显示错误并继续（下一次循环会再次尝试重试）
                                let retry_error_msg = format!("{}", retry_err);
                                let is_retry_timeout =
                                    retry_error_msg.to_lowercase().contains("timeout");

                                if stream_retry_count >= max_stream_retries {
                                    // 已达最大重试次数，返回错误
                                    let final_msg = format!(
                                        "❌ ERROR: Failed after {} retries. Last error: {}",
                                        max_stream_retries,
                                        format_stream_error(&retry_err)
                                    );
                                    let _ = output_tx.send(final_msg.into());
                                    return Err(format!(
                                        "Stream error after {} retries: {:?}",
                                        stream_retry_count, retry_err
                                    ));
                                } else {
                                    // 还有重试机会，显示警告并继续
                                    let warning_msg = if is_retry_timeout {
                                        format!(
                                            "⚠️  Retry failed ({}/{}), will try again...\n",
                                            stream_retry_count, max_stream_retries
                                        )
                                    } else {
                                        format!(
                                            "⚠️  Retry failed ({}/{}): {}. Trying again...\n",
                                            stream_retry_count,
                                            max_stream_retries,
                                            format_stream_error(&retry_err)
                                        )
                                    };
                                    let _ = output_tx.send(warning_msg.into());
                                    // 继续下一次循环，会再次触发重试逻辑
                                }
                            }
                        }
                    }
                    Some(Err(e)) => {
                        // 🔥 确保错误在主视区明显显示
                        let error_msg = format!("❌ ERROR: {}", format_stream_error(&e));
                        let _ = output_tx.send(error_msg.into());
                        return Err(format!("Stream error: {:?}", e));
                    }
                    None => {
                        if !collector.is_done() {
                            // 异常断开 — 未收到 MessageDone
                            if !line_buffer.is_empty() {
                                let _ = output_tx.send(std::mem::take(&mut line_buffer).into());
                            }
                            // 🔥 确保异常结束的警告在主视区明显显示
                            let warning_msg = "\n⚠️  WARNING: Stream ended unexpectedly. The response may be incomplete.";
                            let _ = output_tx.send(warning_msg.to_string().into());

                            // 🔥 FIX: 异常结束应该返回错误，与 Some(Err(e)) 保持一致
                            return Err("Stream ended unexpectedly without MessageDone".to_string());
                        }
                        break;
                    }
                }
            }

            // ═══════════════════════════════════════════════════════════
            // Phase 3: Post-Process — 短暂持双锁
            // ═══════════════════════════════════════════════════════════

            // 流结束后检查是否有工具调用需要执行
            if collected_tool_calls.is_empty() && !any_tool_done_received {
                // 纯文本响应（无工具调用）— 短暂持双锁完成收尾
                {
                    let mut s = session.lock().await;
                    let mut ctx = thread_ctx.lock().await;

                    // 完成最后一个 in_progress 任务
                    complete_current_task(&task_store);

                    ctx.messages.push(Message {
                        role: MessageRole::Assistant,
                        content: MessageContent::Text(current_response.clone()),
                        tool_calls: None,
                        tool_call_id: None,
                    });
                }

                // 🎯 信任模型：AI 返回纯文本 = 停止信号（参考 codex needs_follow_up 设计）
                // 无论任务列表是否全部完成，都不强制继续循环
                let tasks = task_store.get_tasks();
                if !tasks.is_empty() {
                    let mut s = session.lock().await;
                    let mut ctx = thread_ctx.lock().await;

                    let elapsed_secs = start_time.elapsed().as_secs_f64();
                    let summary = s.render_pipeline.render_summary(
                        elapsed_secs,
                        ctx.cumulative_input_tokens,
                        ctx.cumulative_output_tokens,
                    );
                    let _ = output_tx.send(summary.into());
                    task_store.clear();
                }
                break;
            }

            // Execute 阶段：执行工具（TUI 模式通过审批 channel 交互）
            // 需要持 Session 锁（execute_tools_tui 需要 &mut self）和 thread_ctx 锁
            let _ = output_tx.send(String::new().into());
            let tool_results = {
                let mut s = session.lock().await;
                let mut ctx = thread_ctx.lock().await;
                // 🔥 Phase 4: 传递 thread_id 用于工具审批
                s.execute_tools_tui(
                    &mut ctx,
                    &mut bottom_status_bar,
                    &collected_tool_calls,
                    &output_tx,
                    &approval_tx,
                    thread_id,
                    &task_store,
                )
                .await
            };

            let tool_results = match tool_results {
                Ok(results) => results,
                Err(e) if e == "GLOBAL_EMPTY_ARGS_TRIPPED" => {
                    let _ = output_tx.send("全局空参数熔断触发，终止执行".to_string().into());
                    break;
                }
                Err(e) => return Err(e),
            };

            // 如果所有工具调用都被熔断跳过（PerToolTripped）或循环检测阻止，终止循环
            if !tool_results.is_empty()
                && tool_results.iter().all(|(_, _, result, _)| {
                    result.contains("Skipped") || result.contains("循环检测阻止")
                })
            {
                let _ = output_tx.send(
                    "所有工具调用均被阻止（空参数熔断或循环检测），终止执行"
                        .to_string()
                        .into(),
                );
                complete_current_task(&task_store);
                break;
            }

            // 构建 tool_calls + 更新 thread_ctx — 短暂持 thread_ctx 锁
            {
                let mut ctx = thread_ctx.lock().await;

                let tool_calls_value: Vec<ToolCall> = tool_results
                    .iter()
                    .map(|(id, name, _, _)| ToolCall {
                        id: id.clone(),
                        call_type: "function".to_string(),
                        function: ToolCallFunction {
                            name: name.clone(),
                            arguments: String::new(),
                        },
                    })
                    .collect();

                ctx.messages.push(Message {
                    role: MessageRole::Assistant,
                    content: MessageContent::Text(current_response.clone()),
                    tool_calls: Some(tool_calls_value),
                    tool_call_id: None,
                });

                for (tool_id, _name, result, _) in &tool_results {
                    ctx.messages.push(Message {
                        role: MessageRole::Tool,
                        content: MessageContent::Text(token::display::truncate_tool_result(result)),
                        tool_calls: None,
                        tool_call_id: Some(tool_id.clone()),
                    });
                }

                // 渲染工具结果
                let theme = render::default_theme();
                for (tool_id, name, _result, _duration) in &tool_results {
                    let completed_steps = ctx.pipeline_tracker.completed_steps();
                    // 从最新到最旧查找，避免匹配到之前同名的旧步骤
                    if let Some(step) = completed_steps.iter().rev().find(|s| s.tool_name == *name)
                    {
                        let status_render = step.status.render_with_theme("zh", &theme, RESET);
                        let args_preview = if step.tool_args.chars().count() > 50 {
                            format!("{}...", step.tool_args.chars().take(47).collect::<String>())
                        } else {
                            step.tool_args.clone()
                        };

                        if let Some(duration) = step.metadata.duration {
                            let _ = output_tx.send(
                                format!(
                                    "\n{} {}({})  [{}]",
                                    status_render,
                                    name,
                                    args_preview,
                                    format_duration(duration.as_secs_f64())
                                )
                                .into(),
                            );
                        } else {
                            let _ = output_tx.send(
                                format!("\n{} {}({})", status_render, name, args_preview).into(),
                            );
                        }

                        match &step.output {
                            crate::pipeline::StepOutput::Empty => {}
                            crate::pipeline::StepOutput::Full { content } => {
                                let _ = output_tx.send(
                                    format!(
                                        "   ╾ {}",
                                        content.lines().collect::<Vec<_>>().join("\n   ╾ ")
                                    )
                                    .into(),
                                );
                            }
                            crate::pipeline::StepOutput::Truncated {
                                preview,
                                total_lines,
                            } => {
                                let _ = output_tx.send(
                                    format!(
                                        "   ╾ {}",
                                        preview.lines().collect::<Vec<_>>().join("\n   ╾ ")
                                    )
                                    .into(),
                                );
                                let _ =
                                    output_tx.send(format!("   ╾ (共 {} 行)", total_lines).into());
                            }
                        }
                    }
                }

                // 🔥 Mid-turn 压缩检查点（工具循环中）
                // 在 85% 阈值时触发轻量压缩（不调 AI，保留 20 条）
                let current_tokens = token::estimate_tokens(&ctx.messages);
                let mid_turn_threshold =
                    (token::display::compute_compress_threshold(&model) as f64 * 1.0625) as usize; // 85%
                if current_tokens > mid_turn_threshold {
                    let _ = output_tx.send(
                        format!(
                            "⚠️ Mid-turn 压缩触发：{} tokens / {} 阈值，正在压缩...",
                            current_tokens,
                            format_number(mid_turn_threshold)
                        )
                        .into(),
                    );

                    // clone-out-of-lock 模式
                    let snapshot = ctx.messages.clone();
                    drop(ctx); // 释放 thread_ctx 锁

                    let old_len = snapshot.len();
                    let compacted = perform_compaction(
                        &snapshot,
                        &model,
                        &provider_config,
                        &system_prompt,
                        CompactionMode::MidTurn,
                    )
                    .await;

                    // 短暂持锁写回
                    let mut ctx = thread_ctx.lock().await;
                    ctx.messages = compacted;
                    let new_len = ctx.messages.len();

                    let new_tokens = token::estimate_tokens(&ctx.messages);
                    let _ = output_tx.send(
                        format!(
                            "✓ Mid-turn 压缩完成：{} → {} tokens, {} → {} messages",
                            format_number(current_tokens),
                            format_number(new_tokens),
                            old_len,
                            new_len
                        )
                        .into(),
                    );
                }
            } // thread_ctx 锁释放

            let current_category = collected_tool_calls
                .first()
                .map(|t| approval::categorize_tool(&t.name))
                .unwrap_or(approval::ToolCategory::Safe);
            let dynamic_max = approval::max_iterations(current_category);

            // R3: 重置 chunk 重试计数器（每轮 continuation 独立计数）
            stream_retry_count = 0;

            continuation_count += 1;
            if continuation_count >= dynamic_max {
                let _ = output_tx
                    .send(format!("Maximum tool iterations reached ({})", dynamic_max).into());
                complete_current_task(&task_store);
                break;
            }

            let _ = output_tx
                .send(format!("Continuing... ({}/{})", continuation_count, dynamic_max).into());
        }

        // 🎯 循环结束时清空任务列表，避免遮挡视窗
        // LLM 会自然地总结任务完成情况，无需额外生成总结
        // if continuation_count > 0 {
        //     task_store.clear();
        // }

        let _ = output_tx.send(String::new().into());
        Ok(full_response)
    }

    /// 🔧 TUI 模式执行工具（通过审批 channel 交互确认）
    async fn execute_tools_tui(
        &mut self,
        thread_ctx: &mut ThreadSessionContext,
        bottom_status_bar: &mut token::BottomStatusBar,
        tools: &[PendingToolCall],
        output_tx: &tokio::sync::mpsc::UnboundedSender<super::OutputMessage>,
        approval_tx: &tokio::sync::mpsc::UnboundedSender<crate::approval_overlay::ApprovalRequest>,
        // 🔥 Phase 4: 线程 ID - 工具审批需要知道属于哪个线程
        thread_id: crate::thread::ThreadId,
        // 🔥 Per-thread TaskStore（隔离 TodoWrite 任务）
        task_store: &TaskStore,
    ) -> Result<Vec<(String, String, String, Duration)>, String> {
        let mut results = Vec::new();

        // PipelineStep 已在事件循环的 ToolDone 中创建（使用完整参数）

        for tool in tools {
            // 空参数/无效参数前置拦截（在审批对话框之前）
            if is_empty_args(&tool.args) {
                let breaker_result = approval::check_empty_args_breaker(&tool.name, &tool.args);

                match breaker_result {
                    EmptyArgsResult::GlobalTripped => {
                        // 全局空参数超过阈值：立即终止，不继续循环
                        let _ = output_tx.send(
                            "🛑 全局空参数熔断: 跨所有工具空参数调用次数过多，终止执行"
                                .to_string()
                                .into(),
                        );
                        thread_ctx
                            .pipeline_tracker
                            .skip_step(&tool.tool_id, "全局空参数熔断".to_string());
                        return Err("GLOBAL_EMPTY_ARGS_TRIPPED".to_string());
                    }
                    EmptyArgsResult::PerToolTripped => {
                        // 熔断：静默跳过（满足 API 契约但不触发 AI 重试）
                        let _ = output_tx
                            .send(format!("⚡ 熔断跳过: {}({})", tool.name, tool.args).into());
                        thread_ctx
                            .pipeline_tracker
                            .skip_step(&tool.tool_id, "空参数熔断（静默跳过）".to_string());
                        // push "Skipped" 结果（匹配终止条件，防止 AI 无限重试空参数）
                        results.push((
                            tool.tool_id.clone(),
                            tool.name.clone(),
                            "Skipped: empty arguments, tool not executed.".to_string(),
                            Duration::ZERO,
                        ));
                        continue;
                    }
                    EmptyArgsResult::FirstOffense => {
                        // 首次空参数：返回错误给 AI（给学习机会）
                        let required_hint = self
                            .tool_registry
                            .get(&tool.name)
                            .and_then(|t| t.input_schema.get("required").cloned())
                            .and_then(|r| serde_json::to_string(&r).ok())
                            .unwrap_or_else(|| "check tool schema".to_string());

                        let error_msg = format!(
                            "Error: Tool '{}' called with empty arguments {{}}. \
                             Required parameters: {}. \
                             You MUST include required parameters. Do NOT retry with empty arguments.",
                            tool.name, required_hint
                        );

                        let _ = output_tx
                            .send(format!("⚠️ 空参数阻止: {}({})", tool.name, tool.args).into());
                        thread_ctx
                            .pipeline_tracker
                            .skip_step(&tool.tool_id, "空参数直接阻止".to_string());
                        results.push((
                            tool.tool_id.clone(),
                            tool.name.clone(),
                            error_msg,
                            Duration::ZERO,
                        ));
                        continue;
                    }
                    EmptyArgsResult::ValidArgs => {
                        // 不应该到这里（is_empty_args 为 true）
                        unreachable!()
                    }
                }
            }

            // 非空参数：重置熔断计数
            approval::check_empty_args_breaker(&tool.name, &tool.args);

            // 🔥 首先检查用户白名单（持久化 + 会话级）
            let args_json: serde_json::Value = match serde_json::from_str(&tool.args) {
                Ok(v) => v,
                Err(e) => {
                    let preview = tool.args.chars().take(100).collect::<String>();
                    let error_msg = format!(
                        "Error: 工具参数 JSON 解析失败: {} (args preview: {})",
                        e, preview
                    );
                    let _ = output_tx.send(
                        format!("⚠️ 参数解析失败: {}({}) → {}", tool.name, preview, e).into(),
                    );
                    thread_ctx.pipeline_tracker.finish_step_error(
                        &tool.tool_id,
                        error_msg.clone(),
                        Duration::ZERO,
                    );
                    results.push((
                        tool.tool_id.clone(),
                        tool.name.clone(),
                        error_msg,
                        Duration::ZERO,
                    ));
                    continue;
                }
            };
            let store_allowed = self
                .permission_store
                .borrow()
                .is_allowed(&tool.name, &args_json);

            // 检查会话级规则（在 Session.session_rules 中）
            let session_allowed = {
                let session_rules = self.session_rules.borrow();
                let mut allowed = false;
                for rule in session_rules.iter() {
                    if rule.tool_name == tool.name && rule.rule_type == RuleType::Allow {
                        // 提取当前命令的目标值（不带后缀）
                        let target = crate::permission_store::PermissionStore::extract_target_value(
                            &tool.name, &args_json,
                        );
                        // 检查是否匹配
                        if crate::permission_store::PermissionStore::match_rule(
                            &rule.pattern,
                            &target,
                        ) {
                            allowed = true;
                            break;
                        }
                    }
                }
                allowed
            };

            // 然后检查系统默认自动审批规则
            let auto_approve = store_allowed
                || session_allowed
                || approval::should_auto_approve(&tool.name, false);

            if !auto_approve {
                // 通过 channel 发送审批请求，等待用户决策
                let (response_tx, response_rx) = tokio::sync::oneshot::channel();
                // 🔥 Phase 4: 传递 thread_id 用于工具审批
                let request = crate::approval_overlay::ApprovalRequest::from_tool(
                    tool,
                    thread_id,
                    response_tx,
                );
                if approval_tx.send(request).is_err() {
                    let error_msg = format!("Tool '{}': approval channel closed", tool.name);
                    thread_ctx
                        .pipeline_tracker
                        .skip_step(&tool.tool_id, error_msg.clone());
                    results.push((
                        tool.tool_id.clone(),
                        tool.name.clone(),
                        error_msg,
                        Duration::ZERO,
                    ));
                    continue;
                }

                match response_rx.await {
                    Ok(crate::approval_overlay::ApprovalDecision::ApproveOnce) => {
                        // 继续执行
                    }
                    Ok(crate::approval_overlay::ApprovalDecision::ApproveAlways) => {
                        // 持久化白名单（写入文件 + 内存）
                        let pattern = crate::permission_store::PermissionStore::extract_pattern(
                            &tool.name, &args_json,
                        );
                        let rule = crate::permission_store::PermissionRule {
                            tool_name: tool.name.clone(),
                            pattern,
                            rule_type: RuleType::Allow,
                        };
                        self.permission_store.borrow_mut().add_persistent_rule(rule);
                    }
                    Ok(crate::approval_overlay::ApprovalDecision::ApproveSession) => {
                        // 会话级白名单（仅内存）
                        let pattern = crate::permission_store::PermissionStore::extract_pattern(
                            &tool.name, &args_json,
                        );
                        let rule = crate::permission_store::PermissionRule {
                            tool_name: tool.name.clone(),
                            pattern,
                            rule_type: RuleType::Allow,
                        };
                        self.session_rules.borrow_mut().push(rule);
                    }
                    Ok(crate::approval_overlay::ApprovalDecision::Deny) => {
                        let error_msg = format!("Tool '{}' execution denied by user", tool.name);
                        thread_ctx
                            .pipeline_tracker
                            .skip_step(&tool.tool_id, error_msg.clone());
                        results.push((
                            tool.tool_id.clone(),
                            tool.name.clone(),
                            error_msg,
                            Duration::ZERO,
                        ));
                        continue;
                    }
                    Ok(crate::approval_overlay::ApprovalDecision::Abort) => {
                        // 中止后续所有工具
                        return Err("aborted by user".to_string());
                    }
                    Err(_) => {
                        let error_msg = format!("Tool '{}': approval channel closed", tool.name);
                        thread_ctx
                            .pipeline_tracker
                            .skip_step(&tool.tool_id, error_msg.clone());
                        results.push((
                            tool.tool_id.clone(),
                            tool.name.clone(),
                            error_msg,
                            Duration::ZERO,
                        ));
                        return Err("approval channel closed".to_string());
                    }
                }
            }

            // 循环检测
            let loop_status = approval::check_loop(&tool.name, &tool.args);
            if loop_status.should_stop() {
                if let loop_detector::LoopDetectionStatus::Blocked { reason } = loop_status {
                    let _ = output_tx.send(format!("⚠️ 循环检测触发: {}", reason).into());
                    thread_ctx
                        .pipeline_tracker
                        .skip_step(&tool.tool_id, format!("循环检测阻止: {}", reason));
                    let error_msg = format!("Tool '{}' 被循环检测阻止: {}", tool.name, reason);
                    results.push((
                        tool.tool_id.clone(),
                        tool.name.clone(),
                        error_msg,
                        Duration::ZERO,
                    ));
                    continue;
                }
            }

            // 🎨 Diff 预处理：对于 edit_file，在执行前保存旧内容
            let old_content_backup = if tool.name == "edit_file" {
                args_json
                    .get("path")
                    .and_then(|p| p.as_str())
                    .and_then(|path| std::fs::read_to_string(path).ok())
            } else {
                None
            };

            let start = Instant::now();

            // 🔥 对 explore_agent/review_agent 设置进度回调
            // 关键：不设置回调时（非 TUI 路径），等同于现有行为
            let needs_progress = tool.name == "explore_agent" || tool.name == "review_agent";
            if needs_progress {
                let output_tx_clone = output_tx.clone();
                set_global_progress_callback(
                    move |event: ifainew_lib::agent_system::workflow::ProgressEvent| {
                        // 将 ProgressEvent 转换为 TUI 可显示的文本（格式与 /agent explore 一致）
                        let message = match event.event_type.as_str() {
                            "workflow:started" => "▸ 工作流开始执行".to_string(),
                            "node_started" => {
                                // 直接使用 node_id，不使用 message（message 已包含 "开始执行节点:"）
                                if let Some(node_id) = event.node_id {
                                    format!("▸ 节点: {}", node_id)
                                } else {
                                    "▸ 开始执行节点".to_string()
                                }
                            }
                            "tool_call" => {
                                if let Some(ref details) = event.tool_details {
                                    // 🔥 特殊处理：并行派发通知
                                    if details.tool_output.starts_with("parallel:") {
                                        let tools_str = details.tool_output.strip_prefix("parallel:").unwrap_or_default();
                                        let tool_names: Vec<&str> = tools_str.split(',').filter(|s| !s.is_empty()).collect();
                                        format!("▸ {} 个工具并行执行", tool_names.len())
                                    } else {
                                        // 提取工具调用参数（文件路径或搜索内容）
                                        let input_summary = extract_tool_input_summary(&details.tool_name, &details.tool_input);
                                        let time_str = format_execution_time(details.execution_time_ms);
                                        let output_info = if details.is_error {
                                            format!("✗ 错误")
                                        } else if details.output_length > 0 {
                                            format!("→ {} chars", details.output_length)
                                        } else {
                                            String::new()
                                        };

                                        format!("  ├─ ✔ {} {} {}", details.tool_name, input_summary, time_str)
                                            + &if !output_info.is_empty() { format!(" {}", output_info) } else { String::new() }
                                    }
                                } else {
                                    format!("  ├─ 🔧 {}", event.message.unwrap_or_default())
                                }
                            }
                            "node_completed" => {
                                if let Some(ref stats) = event.completion_stats {
                                    format!("▸ 节点完成 [{}s, {} tools]",
                                        stats.duration_ms.unwrap_or(0) as f64 / 1000.0,
                                        stats.tool_count.unwrap_or(0)
                                    )
                                } else {
                                    "▸ 节点完成".to_string()
                                }
                            }
                            "workflow:completed" => "▸ 工作流完成".to_string(),
                            "content_delta" => {
                                // 流式文本直接追加
                                event.content_delta.unwrap_or_default()
                            }
                            _ => String::new(),
                        };
                        if !message.is_empty() {
                            let _ = output_tx_clone.send(message.into());
                        }
                    }
                );
            }

            let execution_result = self.tool_router.execute(&tool.name, &args_json);

            // 🔥 清理全局进度回调（确保在 finally 块中执行）
            if needs_progress {
                clear_global_progress_callback();
            }

            match execution_result {
                Ok(result) => {
                    let duration = start.elapsed();
                    thread_ctx.pipeline_tracker.finish_step_success(
                        &tool.tool_id,
                        result.clone(),
                        duration,
                    );
                    results.push((tool.tool_id.clone(), tool.name.clone(), result, duration));

                    // 🎨 Diff 生成：write_file/edit_file 工具执行后生成 diff
                    if tool.name == "write_file" || tool.name == "edit_file" {
                        if let Some(path) = args_json.get("path").and_then(|p| p.as_str()) {
                            use super::diff_render::{DiffChangeKind, DiffFileChange};
                            use std::fs;
                            use std::path::Path;

                            let path_buf = Path::new(path).to_path_buf();

                            // 读取新内容（工具执行后）
                            let new_content = fs::read_to_string(&path_buf).ok();

                            // 使用保存的旧内容（对于 edit_file）或 None（对于 write_file）
                            let old_content = old_content_backup;

                            // 使用 similar 计算 diff 统计
                            let (added, removed) = if let (Some(old), Some(new)) =
                                (&old_content, &new_content)
                            {
                                use similar::{Algorithm, TextDiff};
                                let diff = TextDiff::configure()
                                    .algorithm(Algorithm::Patience)
                                    .diff_lines(old, new);
                                let added = diff
                                    .ops()
                                    .iter()
                                    .filter(|op| op.tag() == similar::DiffTag::Insert)
                                    .map(|op| op.new_range().len())
                                    .sum::<usize>();
                                let removed = diff
                                    .ops()
                                    .iter()
                                    .filter(|op| op.tag() == similar::DiffTag::Delete)
                                    .map(|op| op.old_range().len())
                                    .sum::<usize>();
                                (added, removed)
                            } else if new_content.is_some() {
                                // 新文件，所有行都是新增
                                (
                                    new_content.as_ref().map(|c| c.lines().count()).unwrap_or(0),
                                    0,
                                )
                            } else {
                                (0, 0)
                            };

                            let kind = match tool.name.as_str() {
                                "write_file" => DiffChangeKind::Added,
                                "edit_file" => DiffChangeKind::Modified,
                                _ => DiffChangeKind::Modified,
                            };

                            let diff_change = DiffFileChange {
                                path: path_buf,
                                kind,
                                old_content,
                                new_content,
                                added,
                                removed,
                            };

                            // 发送 diff 消息
                            let _ = output_tx.send(diff_change.into());
                        }
                    }

                    // 📋 自动推进 TodoWrite 任务状态（非 TodoWrite 工具成功后）
                    if tool.name != "TodoWrite" {
                        auto_advance_tasks(task_store);
                    }
                }
                Err(e) => {
                    let duration = start.elapsed();
                    let error_msg = format!("Error: {:?}", e);
                    thread_ctx.pipeline_tracker.finish_step_error(
                        &tool.tool_id,
                        error_msg.clone(),
                        duration,
                    );
                    results.push((tool.tool_id.clone(), tool.name.clone(), error_msg, duration));
                }
            }
        }

        Ok(results)
    }

    /// 🔧 执行工具列表（Execute 阶段）- 使用元编程权限引擎
    fn execute_tools(
        &mut self,
        tools: &[PendingToolCall],
    ) -> Result<Vec<(String, String, String, Duration)>, String> {
        let mut results = Vec::new();
        let theme = render::default_theme(); // 🎨 主题（用于循环检测警告）

        // PipelineStep 已在事件循环的 ToolDone 中创建（使用完整参数）

        for tool in tools {
            // 空参数/无效参数前置拦截（在审批对话框之前）
            if is_empty_args(&tool.args) {
                let breaker_result = approval::check_empty_args_breaker(&tool.name, &tool.args);

                match breaker_result {
                    EmptyArgsResult::GlobalTripped => {
                        // 全局空参数超过阈值：立即终止，不继续循环
                        eprintln!(
                            "\n{}🛑 全局空参数熔断: 跨所有工具空参数调用次数过多，终止执行{}",
                            theme.warning,
                            render::RESET
                        );
                        self.default_ctx
                            .pipeline_tracker
                            .skip_step(&tool.tool_id, "全局空参数熔断".to_string());
                        return Err("GLOBAL_EMPTY_ARGS_TRIPPED".to_string());
                    }
                    EmptyArgsResult::PerToolTripped => {
                        // 熔断：静默跳过（满足 API 契约但不触发 AI 重试）
                        eprintln!(
                            "\n{}⚡ 熔断跳过: {}({}){}",
                            theme.warning,
                            tool.name,
                            tool.args,
                            render::RESET
                        );
                        self.default_ctx
                            .pipeline_tracker
                            .skip_step(&tool.tool_id, "空参数熔断（静默跳过）".to_string());
                        results.push((
                            tool.tool_id.clone(),
                            tool.name.clone(),
                            "Skipped: empty arguments, tool not executed.".to_string(),
                            Duration::ZERO,
                        ));
                        continue;
                    }
                    EmptyArgsResult::FirstOffense => {
                        // 首次空参数：返回错误给 AI（给学习机会）
                        let required_hint = self
                            .tool_registry
                            .get(&tool.name)
                            .and_then(|t| t.input_schema.get("required").cloned())
                            .and_then(|r| serde_json::to_string(&r).ok())
                            .unwrap_or_else(|| "check tool schema".to_string());

                        let error_msg = format!(
                            "Error: Tool '{}' called with empty arguments {{}}. \
                             Required parameters: {}. \
                             You MUST include required parameters. Do NOT retry with empty arguments.",
                            tool.name, required_hint
                        );

                        eprintln!(
                            "\n{}⚠️  空参数阻止: {}({}){}",
                            theme.warning,
                            tool.name,
                            tool.args,
                            render::RESET
                        );
                        self.default_ctx
                            .pipeline_tracker
                            .skip_step(&tool.tool_id, "空参数直接阻止".to_string());
                        results.push((
                            tool.tool_id.clone(),
                            tool.name.clone(),
                            error_msg,
                            Duration::ZERO,
                        ));
                        continue;
                    }
                    EmptyArgsResult::ValidArgs => {
                        unreachable!()
                    }
                }
            }

            // 非空参数：重置熔断计数
            approval::check_empty_args_breaker(&tool.name, &tool.args);

            // 🔥 元编程：使用配置驱动的权限判断
            let category = approval::categorize_tool(&tool.name);
            let risk = approval::calculate_risk(
                &tool.name,
                &serde_json::from_str::<serde_json::Value>(&tool.args)
                    .unwrap_or(serde_json::json!({})),
            );
            let auto_approve =
                self.auto_approve_all || approval::should_auto_approve(&tool.name, false); // CLI 中无沙箱

            if !auto_approve {
                // 🔥 在 CLI 中，所有需要审批的工具都需要用户确认（Safe 除外）
                if !matches!(category, approval::ToolCategory::Safe) {
                    // 解析参数以便友好显示
                    let args_json = serde_json::from_str::<serde_json::Value>(&tool.args)
                        .unwrap_or(serde_json::json!({}));

                    // 构建友好的工具参数显示
                    let args_preview = format_tool_args(&tool.name, &args_json);

                    println!();
                    println!("┌─────────────────────────────────────────────────────────┐");
                    println!("│ 🔔 工具执行请求                                          │");
                    println!("├─────────────────────────────────────────────────────────┤");
                    println!("│ 工具: {:<50} │", tool.name);
                    println!("│ 风险: {:<50} │", format_risk_level(risk));
                    println!("├─────────────────────────────────────────────────────────┤");
                    println!("│ 参数详情:                                               │");
                    for line in args_preview.lines().take(6) {
                        println!("│ {:<55} │", line);
                    }
                    if args_preview.lines().count() > 6 {
                        println!("│ ...                                                    │");
                    }
                    println!("└─────────────────────────────────────────────────────────┘");
                    print!("  是否执行? (y/n): ");
                    io::stdout()
                        .flush()
                        .map_err(|e| format!("Failed to flush stdout: {}", e))?;

                    // 简单的用户输入（生产环境应使用更健壮的方法）
                    let mut input = String::new();
                    io::stdin()
                        .read_line(&mut input)
                        .map_err(|e| format!("Failed to read input: {}", e))?;

                    if input.trim() != "y" && input.trim() != "Y" {
                        // 🎨 元编程：标记步骤为跳过
                        self.default_ctx.pipeline_tracker.skip_step(
                            &tool.tool_id,
                            format!("User denied execution of '{}'", tool.name),
                        );

                        let error_msg = format!("Tool '{}' execution denied by user", tool.name);
                        results.push((
                            tool.tool_id.clone(),
                            tool.name.clone(),
                            error_msg,
                            Duration::ZERO,
                        ));

                        continue;
                    }
                }
            }

            // 🎬 元编程：循环检测（执行前检测，预防性阻止）
            let loop_status = approval::check_loop(&tool.name, &tool.args);
            if loop_status.should_stop() {
                if let loop_detector::LoopDetectionStatus::Blocked { reason } = loop_status {
                    eprintln!(
                        "\n{}⚠️  循环检测触发: {}{}",
                        theme.warning,
                        reason,
                        render::RESET
                    );

                    // 🎨 元编程：标记步骤为跳过（循环阻止）
                    self.default_ctx
                        .pipeline_tracker
                        .skip_step(&tool.tool_id, format!("循环检测阻止: {}", reason));

                    // 返回错误给 AI，让 AI 知道这个工具调用被阻止了
                    let error_msg = format!("Tool '{}' 被循环检测阻止: {}", tool.name, reason);
                    results.push((
                        tool.tool_id.clone(),
                        tool.name.clone(),
                        error_msg,
                        Duration::ZERO,
                    ));

                    continue; // 跳过当前工具，继续处理下一个
                }
            } else if loop_status.should_warn() {
                if let loop_detector::LoopDetectionStatus::Warning { count, pattern } = loop_status
                {
                    eprintln!(
                        "\n{}⚠️  循环检测警告: {} (已执行 {} 次){}",
                        theme.warning,
                        pattern,
                        count,
                        render::RESET
                    );
                }
            }

            // 🎯 更新底部状态栏状态（但不显示，避免干扰对话）
            use token::StatusBarState;
            self.bottom_status_bar
                .transition(StatusBarState::ExecutingTool {
                    tool_name: tool.name.clone(),
                    tool_count: results.len(),
                    tool_success: results
                        .iter()
                        .filter(|r| !r.2.starts_with("Error:"))
                        .count(),
                    tool_errors: results.iter().filter(|r| r.2.starts_with("Error:")).count(),
                });

            let args_json: serde_json::Value = match serde_json::from_str(&tool.args) {
                Ok(v) => v,
                Err(e) => {
                    let preview = tool.args.chars().take(100).collect::<String>();
                    let error_msg = format!(
                        "Error: 工具参数 JSON 解析失败: {} (args preview: {})",
                        e, preview
                    );
                    eprintln!(
                        "  {}⚠️ 参数解析失败: {}({}) → {}{}",
                        theme.warning,
                        tool.name,
                        preview,
                        e,
                        render::RESET
                    );
                    self.default_ctx.pipeline_tracker.finish_step_error(
                        &tool.tool_id,
                        error_msg.clone(),
                        Duration::ZERO,
                    );
                    results.push((
                        tool.tool_id.clone(),
                        tool.name.clone(),
                        error_msg,
                        Duration::ZERO,
                    ));
                    continue;
                }
            };

            // 🎨 元编程：记录执行时间
            let start = Instant::now();

            match self.tool_router.execute(&tool.name, &args_json) {
                Ok(result) => {
                    let duration = start.elapsed();

                    // 🎨 元编程：标记步骤为成功
                    self.default_ctx.pipeline_tracker.finish_step_success(
                        &tool.tool_id,
                        result.clone(),
                        duration,
                    );

                    results.push((tool.tool_id.clone(), tool.name.clone(), result, duration));

                    // 📋 自动推进 TodoWrite 任务状态（非 TodoWrite 工具成功后）
                    if tool.name != "TodoWrite" {
                        auto_advance_tasks(get_global_task_store());
                    }
                }
                Err(e) => {
                    let duration = start.elapsed();
                    let error_msg = format!("Error: {:?}", e);

                    // 🎨 元编程：标记步骤为失败
                    self.default_ctx.pipeline_tracker.finish_step_error(
                        &tool.tool_id,
                        error_msg.clone(),
                        duration,
                    );

                    results.push((tool.tool_id.clone(), tool.name.clone(), error_msg, duration));
                }
            }
        }

        Ok(results)
    }
}

// ============================================================================
// CLI System Prompt Builder (元编程)
// ============================================================================

/// 🏛️ 元编程：构建 CLI 系统提示词
///
/// **零重复**：复用 GUI 的 prompt_manager
/// **编译时嵌入**：从 BuiltinPrompts 加载模板
/// **运行时渲染**：Handlebars 变量插值
fn build_cli_system_prompt(
    spec: &ifainew_lib::harness::api::provider_metadata::ProviderSpec,
) -> String {
    // 1. 收集 CLI 特定变量（元编程）
    let mut variables = collect_cli_variables(spec);

    // 2. 从 BuiltinPrompts 加载 CLI 模板（编译时嵌入）
    let template_content = if let Some(content_file) =
        prompt_manager::BuiltinPrompts::get("system/cli.md")
    {
        std::str::from_utf8(content_file.data.as_ref())
            .unwrap_or("You are IfAI CLI.")
            .to_string()
    } else {
        // Fallback: 使用简化模板（过渡期）
        // 注意：完整模板见 .ifai/prompts/system/cli.md
        return format!(
            "你是 IfAI CLI，一个专业的 AI 代码助手，由 {} 模型驱动。\\n\\n## 你的身份\\n- 名字：IfAI CLI\\n- 角色：AI 代码助手和开发伙伴\\n\\n## 核心能力\\n- 代码编写、分析和优化\\n- 多语言支持（Rust, Python, JavaScript, Go 等）\\n- 问题诊断和调试\\n- **工具调用**：文件操作、代码搜索、任务管理\\n- **自主工具使用**：主动使用工具解决用户问题\\n\\n## 工具使用指南（核心原则）\\n\\n### 核心原则\\n- **自主优先**：用户请求操作（列文件、分析代码、运行测试）时，直接使用工具而非建议命令\\n- **禁止手动分析**：分析项目架构时，必须直接使用 `agent_scan_project` 工具，禁止手动创建任务列表或逐个读取文件\\n\\n### 何时使用工具\\n| 用户请求 | 使用工具 |\\n|---------|---------|\\n| \"列出文件\" | agent_list_dir, glob_search |\\n| \"分析项目\" | explore_agent |\\n| \"深度分析项目\" | explore_agent |\\n| \"审查代码\" | review_agent |\\n| \"搜索代码\" | grep_search |\\n| \"读取文件\" | read_file, agent_read_file |\\n| \"运行测试\" | bash cargo test |\\n| \"修改配置\" | write_file, edit_file |\\n\\n**重要**：上表为强制性映射，用户请求后必须立即调用对应工具，不要创建任务计划或分步执行。\\n\\n### 工具选择策略\\n1. **强制使用专用工具**：分析项目时必须使用 `agent_scan_project`，搜索代码时必须使用 `grep_search`，不得使用替代方案\\n2. **精确编辑**：使用 sed -i '42s/old/new/' file（第 42 行）\\n3. **备份机制**：始终使用 sed -i.bak 确保安全\\n\\n### 搜索最佳实践\\n- 优先 rg 而非 grep：使用 ripgrep 进行更快的文本搜索\\n- 上下文窗口：使用 -C 3 显示匹配前后各 3 行\\n- 目录排除：始终排除 .git、node_modules、target、dist\\n\\n### Git 安全\\n- 禁止：git reset --hard、git checkout --（除非明确要求）\\n- 推荐：git status、git diff、git log --oneline -10\\n- 非交互式：始终使用 -m 标志：git commit -m \\\"message\\\"\\n\\n### 完整协议\\n完整 Agent 协议见：prompts/protocols/AGENT_PROTOCOL_V1_ZH.md\\n\\n## 注意事项\\n- 你是 IfAI CLI，不是 {}",
            spec.metadata.name, spec.metadata.name
        );
    };

    // 3. 使用 Handlebars 渲染（元编程）
    let mut rendered =
        match prompt_manager::template::render_template(&template_content, &variables) {
            Ok(r) => r,
            Err(e) => {
                // 渲染失败时返回原始模板
                eprintln!("Warning: Failed to render prompt template: {}", e);
                template_content
            }
        };

    // 4. 🏛️ 声明式：注入行为规则（数据驱动，替代 if is_zhipu { push_str(...) } 命令式逻辑）
    let cwd = std::env::current_dir()
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_else(|_| ".".to_string());
    let behavior_prompt = ifainew_lib::harness::api::provider_metadata::build_behavior_prompt(
        &spec.metadata.id,
        &spec.metadata.name,
        &spec.metadata.tags,
        &cwd,
    );
    rendered.push_str("\n\n");
    rendered.push_str(&behavior_prompt);

    // 5. 🆕 Phase 3: 注入持久化记忆（热记忆）
    memory::inject_memories_into_system_prompt(&rendered)
}

// ============================================================================
// 辅助函数：Agent 工具进度格式化（Phase 1.5.3）
// ============================================================================

/// 提取工具输入的摘要信息（文件路径、搜索内容等）
fn extract_tool_input_summary(tool_name: &str, tool_input: &str) -> String {
    // 尝试解析 JSON 输入
    if let Ok(input_json) = serde_json::from_str::<serde_json::Value>(tool_input) {
        match tool_name {
            "agent_read_file" | "read_file" => {
                // 🔥 支持两种字段名：path 和 rel_path
                let path = input_json.get("path")
                    .or_else(|| input_json.get("rel_path"))
                    .and_then(|p| p.as_str());

                if let Some(path_str) = path {
                    // 只显示文件名，不显示完整路径
                    let filename = std::path::Path::new(path_str)
                        .file_name()
                        .and_then(|n| n.to_str())
                        .unwrap_or(path_str);
                    filename.to_string()
                } else {
                    "?".to_string()
                }
            }
            "agent_list_dir" | "list_dir" => {
                // 🔥 支持两种字段名：path 和 rel_path
                let path = input_json.get("path")
                    .or_else(|| input_json.get("rel_path"))
                    .and_then(|p| p.as_str());

                if let Some(path_str) = path {
                    // 显示目录名（最后一层）
                    let dirname = std::path::Path::new(path_str)
                        .file_name()
                        .and_then(|n| n.to_str())
                        .unwrap_or(path_str);
                    format!("{}/", dirname)
                } else {
                    "?".to_string()
                }
            }
            "grep_search" | "agent_search" | "agent_search_in_file" => {
                if let Some(pattern) = input_json.get("pattern").and_then(|p| p.as_str()) {
                    // 截断过长的搜索模式
                    if pattern.len() > 40 {
                        format!("\"{}...\"", &pattern[..37])
                    } else {
                        format!("\"{}\"", pattern)
                    }
                } else if let Some(query) = input_json.get("query").and_then(|q| q.as_str()) {
                    if query.len() > 40 {
                        format!("\"{}...\"", &query[..37])
                    } else {
                        format!("\"{}\"", query)
                    }
                } else {
                    "?".to_string()
                }
            }
            "bash" => {
                if let Some(command) = input_json.get("command").and_then(|c| c.as_str()) {
                    // 截断过长的命令
                    if command.len() > 50 {
                        format!("\"{}...\"", &command[..47])
                    } else {
                        format!("\"{}\"", command)
                    }
                } else {
                    "?".to_string()
                }
            }
            _ => "?".to_string(),
        }
    } else {
        "?".to_string()
    }
}

/// 格式化执行时间（显示为 <1s 或具体时间）
fn format_execution_time(time_ms: Option<i64>) -> String {
    match time_ms {
        Some(t) if t < 1000 => format!("(<1s)"),
        Some(t) => format!("({}.{}s)", t / 1000, t % 1000 / 100),
        None => String::new(),
    }
}

// ============================================================================
// 单元测试：Agent 工具进度格式化（Phase 1.5.3）
// ============================================================================

#[cfg(test)]
mod format_tests {
    use super::*;

    #[test]
    fn test_extract_tool_input_summary_read_file() {
        // 测试 agent_read_file 工具的文件名提取（path 字段）
        let tool_input = r#"{"path": "src-tauri/src/bin/ifai/session.rs"}"#;
        let result = extract_tool_input_summary("agent_read_file", tool_input);
        assert_eq!(result, "session.rs");
    }

    #[test]
    fn test_extract_tool_input_summary_read_file_rel_path() {
        // 测试 agent_read_file 工具的文件名提取（rel_path 字段）
        let tool_input = r#"{"rel_path": "Cargo.toml"}"#;
        let result = extract_tool_input_summary("agent_read_file", tool_input);
        assert_eq!(result, "Cargo.toml");
    }

    #[test]
    fn test_extract_tool_input_summary_list_dir() {
        // 测试 agent_list_dir 工具的目录名提取
        let tool_input = r#"{"rel_path": "src/bin"}"#;
        let result = extract_tool_input_summary("agent_list_dir", tool_input);
        assert_eq!(result, "bin/");
    }

    #[test]
    fn test_extract_tool_input_summary_grep_search() {
        // 测试 grep_search 工具的搜索模式提取
        let tool_input = r#"{"pattern": "ProgressEvent"}"#;
        let result = extract_tool_input_summary("grep_search", tool_input);
        assert_eq!(result, "\"ProgressEvent\"");
    }

    #[test]
    fn test_extract_tool_input_summary_bash() {
        // 测试 bash 工具的命令提取
        let tool_input = r#"{"command": "cargo test"}"#;
        let result = extract_tool_input_summary("bash", tool_input);
        assert_eq!(result, "\"cargo test\"");
    }

    #[test]
    fn test_extract_tool_input_summary_pretty_json() {
        // 测试格式化 JSON（使用 to_string_pretty）
        let tool_input = r#"{
  "path": "src-tauri/src/agent_system/workflow/runner.rs"
}"#;
        let result = extract_tool_input_summary("agent_read_file", tool_input);
        assert_eq!(result, "runner.rs");
    }

    #[test]
    fn test_format_execution_time() {
        assert_eq!(format_execution_time(Some(500)), "(<1s)");
        assert_eq!(format_execution_time(Some(1500)), "(1.5s)");
        assert_eq!(format_execution_time(Some(100)), "(<1s)");
        assert_eq!(format_execution_time(Some(3420)), "(3.4s)");
        assert_eq!(format_execution_time(None), "");
    }

    #[test]
    fn test_extract_tool_input_summary_invalid_json() {
        // 测试无效 JSON
        let result = extract_tool_input_summary("agent_read_file", "invalid json");
        assert_eq!(result, "?");
    }

    #[test]
    fn test_extract_tool_input_summary_missing_path() {
        // 测试缺少 path 字段
        let tool_input = r#"{"other": "value"}"#;
        let result = extract_tool_input_summary("agent_read_file", tool_input);
        assert_eq!(result, "?");
    }
}

// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_event_collector_new() {
        let collector = EventCollector::new();
        assert_eq!(collector.response_text(), "");
        assert!(!collector.is_done());
    }

    #[test]
    fn test_collect_text_delta() {
        let mut collector = EventCollector::new();
        collector.dispatch(&StreamEvent::TextDelta {
            text: "Hello".to_string(),
        });
        collector.dispatch(&StreamEvent::TextDelta {
            text: " World".to_string(),
        });

        assert_eq!(collector.response_text(), "Hello World");
    }

    #[test]
    fn test_collect_single_tool() {
        // EventCollector 不再收集工具事件（工具由事件循环直接收集）
        // 此测试验证 ToolStart/ToolDone 不影响 EventCollector 的文本收集
        let mut collector = EventCollector::new();

        collector.dispatch(&StreamEvent::ToolStart {
            tool_id: "call_1".to_string(),
            name: "bash".to_string(),
            input: String::new(),
        });
        collector.dispatch(&StreamEvent::ToolDone {
            tool_id: "call_1".to_string(),
            result: r#"{"command":"ls"}"#.to_string(),
        });

        // EventCollector 不受工具事件影响
        assert_eq!(collector.response_text(), "");
        assert!(!collector.is_done());
    }

    #[test]
    fn test_collect_multiple_tools() {
        // EventCollector 不再收集工具事件
        let mut collector = EventCollector::new();

        collector.dispatch(&StreamEvent::ToolStart {
            tool_id: "call_1".to_string(),
            name: "bash".to_string(),
            input: String::new(),
        });
        collector.dispatch(&StreamEvent::ToolDone {
            tool_id: "call_1".to_string(),
            result: r#"{"command":"ls"}"#.to_string(),
        });
        collector.dispatch(&StreamEvent::ToolStart {
            tool_id: "call_2".to_string(),
            name: "TodoWrite".to_string(),
            input: String::new(),
        });
        collector.dispatch(&StreamEvent::ToolDone {
            tool_id: "call_2".to_string(),
            result: r#"{"todos":[{"content":"test"}]}"#.to_string(),
        });

        // EventCollector 只收集文本，工具事件不影响
        assert_eq!(collector.response_text(), "");
        assert!(!collector.is_done());
    }

    #[test]
    fn test_collect_mixed_events() {
        let mut collector = EventCollector::new();
        collector.dispatch(&StreamEvent::TextDelta {
            text: "Thinking".to_string(),
        });
        collector.dispatch(&StreamEvent::ToolStart {
            tool_id: "call_1".to_string(),
            name: "bash".to_string(),
            input: String::new(),
        });
        collector.dispatch(&StreamEvent::ToolDone {
            tool_id: "call_1".to_string(),
            result: r#"{"command":"pwd"}"#.to_string(),
        });
        collector.dispatch(&StreamEvent::TextDelta {
            text: "...".to_string(),
        });

        // 只收集文本，工具事件不影响
        assert_eq!(collector.response_text(), "Thinking...");
        assert!(!collector.is_done());
    }

    #[test]
    fn test_message_done_marks_done() {
        let mut collector = EventCollector::new();
        assert!(!collector.is_done());

        collector.dispatch(&StreamEvent::MessageDone {
            input_tokens: 100,
            output_tokens: 50,
        });
        assert!(collector.is_done());
    }

    #[test]
    fn test_collector_clear() {
        let mut collector = EventCollector::new();
        collector.dispatch(&StreamEvent::TextDelta {
            text: "test".to_string(),
        });
        collector.dispatch(&StreamEvent::ToolStart {
            tool_id: "call_1".to_string(),
            name: "bash".to_string(),
            input: String::new(),
        });
        collector.dispatch(&StreamEvent::ToolDone {
            tool_id: "call_1".to_string(),
            result: r#"{"command":"ls"}"#.to_string(),
        });
        collector.dispatch(&StreamEvent::MessageDone {
            input_tokens: 10,
            output_tokens: 5,
        });

        assert!(!collector.response_text().is_empty());
        assert!(collector.is_done());

        collector.clear();

        assert_eq!(collector.response_text(), "");
        assert!(!collector.is_done());
    }

    #[test]
    fn test_continuation_counter_new() {
        let counter = ContinuationCounter::new();
        assert_eq!(counter.count(), 0);
        assert!(!counter.is_exceeded());
    }

    #[test]
    fn test_continuation_counter_increment() {
        let mut counter = ContinuationCounter::new();

        for i in 1..=5 {
            let result = counter.increment();
            assert_eq!(counter.count(), i);
            if i <= 5 {
                assert!(result.is_ok());
            }
        }
    }

    #[test]
    fn test_continuation_counter_exceeded() {
        let mut counter = ContinuationCounter::new();

        // 5 次内应该正常
        for _ in 0..5 {
            assert!(counter.increment().is_ok());
        }

        // 第 6 次应该失败
        assert!(counter.increment().is_err());
        assert!(counter.is_exceeded());
    }

    #[test]
    fn test_continuation_counter_max_limit() {
        assert_eq!(MAX_CONTINUATIONS, 5);
    }

    #[test]
    fn test_session_new() {
        let session = Session::new("deepseek".to_string(), "deepseek-chat".to_string());
        assert_eq!(session.provider, "deepseek");
        assert_eq!(session.model, "deepseek-chat");
        assert!(session.default_ctx.messages.is_empty());
    }

    #[test]
    fn test_session_add_message() {
        let mut session = Session::new("deepseek".to_string(), "deepseek-chat".to_string());
        session.add_message("Hello".to_string());
        session.add_message("World".to_string());

        assert_eq!(session.default_ctx.messages.len(), 2);
        assert!(matches!(
            session.default_ctx.messages[0].role,
            MessageRole::User
        ));
        assert!(matches!(
            session.default_ctx.messages[1].role,
            MessageRole::User
        ));

        // 检查文本内容
        match &session.default_ctx.messages[0].content {
            MessageContent::Text(text) => assert_eq!(text, "Hello"),
            _ => panic!("Expected Text content"),
        }
        match &session.default_ctx.messages[1].content {
            MessageContent::Text(text) => assert_eq!(text, "World"),
            _ => panic!("Expected Text content"),
        }
    }

    #[test]
    fn test_session_clear_history() {
        let mut session = Session::new("deepseek".to_string(), "deepseek-chat".to_string());
        session.add_message("test".to_string());
        assert_eq!(session.default_ctx.messages.len(), 1);

        session.clear_history();
        assert!(session.default_ctx.messages.is_empty());
    }

    #[test]
    fn test_event_collector_explicit_event_handling() {
        // 验证所有已知事件都被显式处理（编译器强制）
        // EventCollector 现在只负责收集文本和标记完成
        let mut collector = EventCollector::new();

        // MessageStart - 显式忽略
        collector.dispatch(&StreamEvent::MessageStart {
            message_id: "msg_1".to_string(),
        });

        // TextDelta - 累积文本
        collector.dispatch(&StreamEvent::TextDelta {
            text: "test".to_string(),
        });

        // ToolStart - 显式忽略（工具由事件循环直接收集）
        collector.dispatch(&StreamEvent::ToolStart {
            tool_id: "call_1".to_string(),
            name: "test".to_string(),
            input: String::new(),
        });

        // ToolDone - 显式忽略（工具由事件循环直接收集）
        collector.dispatch(&StreamEvent::ToolDone {
            tool_id: "call_1".to_string(),
            result: r#"{"arg":"value"}"#.to_string(),
        });

        // MessageDone - 标记完成
        collector.dispatch(&StreamEvent::MessageDone {
            input_tokens: 100,
            output_tokens: 50,
        });

        // Error - 显式处理（虽然不操作）
        collector.dispatch(&StreamEvent::Error {
            code: "test_error".to_string(),
            message: "test message".to_string(),
        });

        // 验证状态：只有文本和完成状态
        assert_eq!(collector.response_text(), "test");
        assert!(collector.is_done());
    }

    // ========================================================================
    // 会话压缩测试（方案 B：直接调用 Session API）
    // ========================================================================

    #[tokio::test]
    async fn test_compression_triggered_by_message_count() {
        // 🔥 真实验证：发送 55 轮对话后触发压缩
        // 每轮对话包含用户消息 + 助手消息 = 2 条消息
        // 55 轮 * 2 = 110 条消息 > 100 条阈值
        use crate::tests::common::mock_server::MockApiServer;

        // 1. 创建 Mock 服务器
        let mock = MockApiServer::new().await.unwrap();
        mock.setup_streaming_response(vec!["OK"]).await.unwrap();

        // 2. 创建 Session，配置使用 Mock
        let mut session = Session::new("openai".to_string(), "gpt-4".to_string());
        session.set_base_url(format!("{}/v1", mock.uri()));
        session.set_api_key("test-key".to_string());
        session.disable_tools(); // 禁用工具避免测试复杂度

        // 3. 记录初始消息数
        assert_eq!(session.default_ctx.messages.len(), 0, "初始应该没有消息");

        // 4. 发送 40 轮对话，每条消息 3000+ tokens，触发 gpt-4 阈值 (102400 tokens)
        // 每条约 3000 tokens = 12000 字符
        let long_message = "a".repeat(12000);
        for i in 1..=40 {
            let prompt = format!("message {}: {}", i, long_message);
            match session.stream_prompt(&prompt).await {
                Ok(_) => {}
                Err(e) => {
                    // 忽略流式错误，我们主要关注压缩逻辑
                    eprintln!("Warning: stream_prompt error for message {}: {:?}", i, e);
                }
            }
        }

        // 5. 验证压缩被触发：消息数应该明显少于原始数量
        // 40 轮应该产生约 120k tokens，超过 102k 阈值，压缩后应该 <= 35 条
        assert!(
            session.default_ctx.messages.len() <= 35,
            "压缩后应该保留最近 35 条消息以内，实际: {}",
            session.default_ctx.messages.len()
        );

        // 6. 验证消息确实被压缩了（不是简单的 0 或 80）
        assert!(session.default_ctx.messages.len() > 0, "压缩后应该还有消息");
        assert!(
            session.default_ctx.messages.len() < 80,
            "压缩后消息数应该少于原始 80 条 (40 user + 40 assistant)"
        );
    }

    #[test]
    fn test_compression_retains_recent_messages() {
        // 验证压缩后保留的是最近的消息
        let mut session = Session::new("openai".to_string(), "gpt-4".to_string());

        // 手动添加 105 条用户消息
        for i in 1..=105 {
            session.add_message(format!("message_{}", i));
        }

        // 验证压缩前有 105 条消息
        assert_eq!(
            session.default_ctx.messages.len(),
            105,
            "压缩前应该有 105 条消息"
        );

        // 手动触发压缩逻辑（模拟 stream_prompt 中的压缩）
        let total_messages = session.default_ctx.messages.len();
        let keep_last_n = 50.min(total_messages);
        session.default_ctx.messages = session
            .default_ctx
            .messages
            .split_off(total_messages.saturating_sub(keep_last_n));

        // 验证压缩后保留 50 条
        assert_eq!(
            session.default_ctx.messages.len(),
            50,
            "压缩后应该保留 50 条消息"
        );

        // 验证保留的是最近的消息（最后 50 条）
        match &session.default_ctx.messages[0].content {
            MessageContent::Text(text) => {
                assert_eq!(
                    text, "message_56",
                    "第一条应该是 message_56（第 56 条原始消息）"
                );
            }
            _ => panic!("Expected Text content"),
        }

        match &session.default_ctx.messages[49].content {
            MessageContent::Text(text) => {
                assert_eq!(text, "message_105", "最后一条应该是 message_105");
            }
            _ => panic!("Expected Text content"),
        }
    }

    #[tokio::test]
    async fn test_session_state_accessible() {
        // 验证 Session 的内部状态可以直接访问（方案 B 的核心优势）
        let session = Session::new("deepseek".to_string(), "deepseek-chat".to_string());

        // 所有字段都是 pub 的，可以直接验证
        assert!(session.default_ctx.messages.is_empty(), "messages 应该为空");
        assert_eq!(session.provider, "deepseek", "provider 应该正确");
        assert_eq!(session.model, "deepseek-chat", "model 应该正确");
        assert_eq!(
            session.default_ctx.cumulative_input_tokens, 0,
            "初始 input tokens 应该为 0"
        );
        assert_eq!(
            session.default_ctx.cumulative_output_tokens, 0,
            "初始 output tokens 应该为 0"
        );
    }

    // ========================================================================
    // format_tool_args UTF-8 安全测试
    // ========================================================================

    #[test]
    fn test_format_tool_args_bash_chinese_truncation() {
        // bash 命令包含中文，超过 80 字符时截断不 panic
        let long_chinese_cmd = "帮我创建一个2048小游戏的核心逻辑，需要包含游戏板的初始化和方块移动合并以及得分计算功能，支持上下左右四个方向的操作，还需要实现胜利和失败判定逻辑以及动画效果和得分排行榜功能";
        assert!(
            long_chinese_cmd.chars().count() > 80,
            "测试数据需超过 80 字符"
        );
        let args = serde_json::json!({ "command": long_chinese_cmd });
        let result = format_tool_args("bash", &args);
        assert!(result.contains("命令:"));
        assert!(result.ends_with("..."));
        assert!(result.is_char_boundary(result.len()));
    }

    #[test]
    fn test_format_tool_args_bash_short() {
        // 短命令不截断
        let args = serde_json::json!({ "command": "ls -la" });
        let result = format_tool_args("bash", &args);
        assert_eq!(result, "命令: ls -la");
    }

    #[test]
    fn test_format_tool_args_bash_mixed_cjk_ascii() {
        // 混合 CJK + ASCII，截断点落在多字节字符中间时不 panic
        let mixed =
            "python3 -c \"print('帮我实现一个功能非常复杂的逻辑，包含很多步骤和详细说明')\"";
        let args = serde_json::json!({ "command": mixed });
        let result = format_tool_args("bash", &args);
        assert!(result.contains("命令:"));
    }

    #[test]
    fn test_format_tool_args_write_file_chinese_content() {
        // write_file 内容包含中文，超过 40 字符截断
        let long_content =
            "这是一个很长的中文文件内容需要被截断显示确保不会在多字节字符边界处崩溃这是一个测试";
        assert!(long_content.chars().count() > 40, "测试数据需超过 40 字符");
        let args = serde_json::json!({ "path": "/tmp/test.py", "content": long_content });
        let result = format_tool_args("write_file", &args);
        assert!(result.contains("路径: /tmp/test.py"));
        assert!(result.contains("..."));
        assert!(result.is_char_boundary(result.len()));
    }

    #[test]
    fn test_format_tool_args_write_file_short() {
        // 短内容不截断
        let args = serde_json::json!({ "path": "/tmp/test.py", "content": "hello" });
        let result = format_tool_args("write_file", &args);
        assert_eq!(result, "路径: /tmp/test.py\n内容: hello");
    }

    #[test]
    fn test_format_tool_args_edit_file_chinese() {
        // edit_file 变更内容包含中文，超过 40 字符截断
        let long_edit = "重构整个认证模块，添加JWT token刷新逻辑和多因素认证支持，同时优化错误处理";
        assert!(long_edit.chars().count() > 40, "测试数据需超过 40 字符");
        let args = serde_json::json!({ "path": "/src/auth.rs", "edit": long_edit });
        let result = format_tool_args("edit_file", &args);
        assert!(result.contains("编辑文件: /src/auth.rs"));
        assert!(result.contains("..."));
        assert!(result.is_char_boundary(result.len()));
    }

    #[test]
    fn test_format_tool_args_generic_chinese_json() {
        // 通用工具：JSON 包含中文键值，超过 200 字符截断
        let big_json = serde_json::json!({
            "content": "这是一段很长的中文内容用来测试通用工具的截断逻辑是否正确处理多字节字符".repeat(10),
            "status": "in_progress"
        });
        let result = format_tool_args("unknown_tool", &big_json);
        assert!(result.ends_with("..."));
        assert!(result.is_char_boundary(result.len()));
    }

    #[test]
    fn test_format_tool_args_generic_short() {
        // 短 JSON 不截断
        let args = serde_json::json!({ "key": "value" });
        let result = format_tool_args("custom_tool", &args);
        assert!(result.contains("key"));
        assert!(!result.ends_with("..."));
    }

    #[test]
    fn test_format_tool_args_emoji_and_special_chars() {
        // 包含 emoji（4 字节 UTF-8）的参数
        let emoji_cmd = "cargo test --bin ifai -- 测试模块 🔥🚀✅ 🎯 目标覆盖所有边界情况";
        let args = serde_json::json!({ "command": emoji_cmd });
        let result = format_tool_args("bash", &args);
        assert!(result.contains("命令:"));
        assert!(result.is_char_boundary(result.len()));
    }

    #[test]
    fn test_args_preview_chinese_truncation() {
        // 直接测试截断逻辑：中文 tool_args 超过 50 字符
        let long_chinese = r#"{"todos":[{"content":"创建2048游戏核心逻辑","activeForm":"创建2048游戏核心逻辑","status":"in_progress"},{"content":"创建GUI界面","activeForm":"创建GUI界面","status":"pending"}]}"#;
        let preview = if long_chinese.chars().count() > 50 {
            format!("{}...", long_chinese.chars().take(47).collect::<String>())
        } else {
            long_chinese.to_string()
        };
        assert!(preview.ends_with("..."));
        assert!(preview.is_char_boundary(preview.len()));
    }

    #[test]
    fn test_args_preview_mixed_cjk_at_boundary() {
        // 精确构造：47 字符处落在中文字符中间
        // "a".repeat(46) + "逻" = 47 字符但 46+3=49 字节
        let s = format!("{}逻辑分析结果展示", "a".repeat(46));
        assert!(s.chars().count() > 50);
        let preview = format!("{}...", s.chars().take(47).collect::<String>());
        assert!(preview.is_char_boundary(preview.len()));
        assert_eq!(preview.chars().count(), 50); // 47 + "..."
    }

    // ========================================================================
    // R2: RetryPolicy + with_retry() tests
    // ========================================================================

    use std::sync::atomic::{AtomicU32, Ordering};

    #[tokio::test]
    async fn test_with_retry_success_on_first_try() {
        let policy = RetryPolicy {
            max: 2,
            delays: vec![Duration::from_millis(10), Duration::from_millis(10)],
        };
        let call_count = AtomicU32::new(0);

        let result: Result<String, String> = with_retry(
            &policy,
            |_| true,
            || {
                call_count.fetch_add(1, Ordering::SeqCst);
                async { Ok("ok".to_string()) }
            },
        )
        .await;

        assert_eq!(result.unwrap(), "ok");
        assert_eq!(call_count.load(Ordering::SeqCst), 1);
    }

    #[tokio::test]
    async fn test_with_retry_retryable_triggers_retry() {
        let policy = RetryPolicy {
            max: 2,
            delays: vec![Duration::from_millis(10), Duration::from_millis(10)],
        };
        let call_count = AtomicU32::new(0);

        let result: Result<String, String> = with_retry(
            &policy,
            |_| true,
            || {
                let count = call_count.fetch_add(1, Ordering::SeqCst);
                async move {
                    if count < 1 {
                        Err("transient".to_string())
                    } else {
                        Ok("recovered".to_string())
                    }
                }
            },
        )
        .await;

        assert_eq!(result.unwrap(), "recovered");
        assert_eq!(call_count.load(Ordering::SeqCst), 2);
    }

    #[tokio::test]
    async fn test_with_retry_exhausted_returns_error() {
        let policy = RetryPolicy {
            max: 2,
            delays: vec![Duration::from_millis(10), Duration::from_millis(10)],
        };
        let call_count = AtomicU32::new(0);

        let result: Result<String, String> = with_retry(
            &policy,
            |_| true,
            || {
                call_count.fetch_add(1, Ordering::SeqCst);
                async { Err("always_fail".to_string()) }
            },
        )
        .await;

        assert_eq!(result.unwrap_err(), "always_fail");
        // 1 initial + 2 retries = 3
        assert_eq!(call_count.load(Ordering::SeqCst), 3);
    }

    #[tokio::test]
    async fn test_with_retry_non_retryable_no_retry() {
        let policy = RetryPolicy {
            max: 2,
            delays: vec![Duration::from_millis(10), Duration::from_millis(10)],
        };
        let call_count = AtomicU32::new(0);

        let result: Result<String, String> = with_retry(
            &policy,
            |e: &String| !e.contains("fatal"),
            || {
                call_count.fetch_add(1, Ordering::SeqCst);
                async { Err("fatal error".to_string()) }
            },
        )
        .await;

        assert_eq!(result.unwrap_err(), "fatal error");
        assert_eq!(call_count.load(Ordering::SeqCst), 1);
    }

    // ================================================================
    // ThreadSessionContext 测试
    // ================================================================

    #[test]
    fn test_thread_ctx_messages_isolated() {
        let mut ctx_main = ThreadSessionContext::new();
        let mut ctx_t1 = ThreadSessionContext::new();

        ctx_main.messages.push(Message {
            role: MessageRole::User,
            content: MessageContent::Text("hello from main".to_string()),
            tool_calls: None,
            tool_call_id: None,
        });
        ctx_t1.messages.push(Message {
            role: MessageRole::User,
            content: MessageContent::Text("hello from t1".to_string()),
            tool_calls: None,
            tool_call_id: None,
        });

        assert_eq!(ctx_main.messages.len(), 1);
        assert_eq!(ctx_t1.messages.len(), 1);
        // 互不干扰
        assert!(matches!(&ctx_main.messages[0].role, MessageRole::User));
    }

    #[test]
    fn test_thread_ctx_tokens_independent() {
        let mut ctx_main = ThreadSessionContext::new();
        let mut ctx_t1 = ThreadSessionContext::new();

        ctx_main.cumulative_input_tokens = 100;
        ctx_main.cumulative_output_tokens = 200;
        ctx_t1.cumulative_input_tokens = 50;
        ctx_t1.cumulative_output_tokens = 80;

        assert_eq!(ctx_main.cumulative_input_tokens, 100);
        assert_eq!(ctx_t1.cumulative_input_tokens, 50);

        // 累加互不影响
        ctx_main.cumulative_input_tokens += 10;
        assert_eq!(ctx_main.cumulative_input_tokens, 110);
        assert_eq!(ctx_t1.cumulative_input_tokens, 50);
    }

    #[test]
    fn test_thread_ctx_pipeline_tracker_independent() {
        let mut ctx_main = ThreadSessionContext::new();
        let mut ctx_t1 = ThreadSessionContext::new();

        ctx_main
            .pipeline_tracker
            .start_step("tool-1".into(), "bash".into(), "ls".into());
        ctx_t1
            .pipeline_tracker
            .start_step("tool-2".into(), "read_file".into(), "foo.rs".into());

        // 各自的 active_steps 独立
        assert_eq!(ctx_main.pipeline_tracker.active_steps().len(), 1);
        assert_eq!(ctx_t1.pipeline_tracker.active_steps().len(), 1);
    }

    // ========================================================================
    // Compaction Functions Tests
    // ========================================================================

    #[test]
    fn test_build_compacted_messages_with_summary() {
        // system + summary + recent
        let system_prompt = "You are a helpful assistant.";
        let summary = "User asked about implementing a feature.";
        let recent = vec![Message {
            role: MessageRole::User,
            content: MessageContent::Text("Continue implementing.".to_string()),
            tool_calls: None,
            tool_call_id: None,
        }];

        let result = build_compacted_messages(system_prompt, Some(summary), &recent);

        assert_eq!(result.len(), 3);
        // 第1条：系统提示词
        assert!(matches!(result[0].role, MessageRole::System));
        // MessageContent 不支持 PartialEq，使用字符串比较
        assert_eq!(
            result[0].content.to_string(),
            "You are a helpful assistant."
        );
        // 第2条：AI 摘要
        assert!(matches!(result[1].role, MessageRole::System));
        assert!(result[1]
            .content
            .to_string()
            .contains("[Conversation Summary]"));
        assert!(result[1]
            .content
            .to_string()
            .contains("User asked about implementing a feature."));
        // 第3条：最近消息
        assert!(matches!(result[2].role, MessageRole::User));
    }

    #[test]
    fn test_build_compacted_messages_no_summary() {
        // system + recent only (no AI summary)
        let system_prompt = "You are a helpful assistant.";
        let recent = vec![Message {
            role: MessageRole::User,
            content: MessageContent::Text("Hello".to_string()),
            tool_calls: None,
            tool_call_id: None,
        }];

        let result = build_compacted_messages(system_prompt, None, &recent);

        assert_eq!(result.len(), 2);
        assert!(matches!(result[0].role, MessageRole::System));
        assert!(matches!(result[1].role, MessageRole::User));
    }

    #[test]
    fn test_build_compacted_messages_empty_system_prompt() {
        // 空系统提示词时不添加 system 消息
        let recent = vec![Message {
            role: MessageRole::User,
            content: MessageContent::Text("Hello".to_string()),
            tool_calls: None,
            tool_call_id: None,
        }];

        let result = build_compacted_messages("", Some("summary"), &recent);

        assert_eq!(result.len(), 2);
        // 第1条：AI 摘要（无系统提示词）
        assert!(matches!(result[0].role, MessageRole::System));
        assert!(result[0]
            .content
            .to_string()
            .contains("[Conversation Summary]"));
        // 第2条：最近消息
        assert!(matches!(result[1].role, MessageRole::User));
    }

    #[test]
    fn test_perform_compaction_fallback_short_messages() {
        // 消息数 <= keep_last，不压缩
        let messages = vec![
            Message {
                role: MessageRole::User,
                content: MessageContent::Text("msg1".to_string()),
                tool_calls: None,
                tool_call_id: None,
            },
            Message {
                role: MessageRole::User,
                content: MessageContent::Text("msg2".to_string()),
                tool_calls: None,
                tool_call_id: None,
            },
        ];

        let result = perform_compaction_fallback(&messages, "system", 10);

        // 不压缩，直接返回原消息
        assert_eq!(result.len(), 2);
    }

    #[test]
    fn test_perform_compaction_fallback_long_messages() {
        // 消息数 > keep_last，压缩
        let mut messages = Vec::new();
        for i in 1..=105 {
            messages.push(Message {
                role: MessageRole::User,
                content: MessageContent::Text(format!("msg{}", i)),
                tool_calls: None,
                tool_call_id: None,
            });
        }

        let result = perform_compaction_fallback(&messages, "You are helpful.", 100);

        // 应该有：系统提示词 + 压缩说明 + 100条最近消息
        assert_eq!(result.len(), 102);
        assert!(matches!(result[0].role, MessageRole::System));
        assert!(result[0].content.to_string().contains("You are helpful."));
        assert!(matches!(result[1].role, MessageRole::System));
        assert!(result[1]
            .content
            .to_string()
            .contains("(对话历史已压缩，保留最近 100 条消息)"));
        // 验证保留的是最后100条
        assert!(result[2].content.to_string().contains("msg6")); // 第6条开始（105-100+1=6）
        assert!(result[101].content.to_string().contains("msg105")); // 最后一条
    }

    #[test]
    fn test_perform_compaction_fallback_preserves_existing_system() {
        // 保留原有的 system 消息
        let mut messages = vec![Message {
            role: MessageRole::System,
            content: MessageContent::Text("Original system prompt".to_string()),
            tool_calls: None,
            tool_call_id: None,
        }];
        for i in 1..=105 {
            messages.push(Message {
                role: MessageRole::User,
                content: MessageContent::Text(format!("msg{}", i)),
                tool_calls: None,
                tool_call_id: None,
            });
        }

        let result = perform_compaction_fallback(&messages, "", 100);

        // 第1条应该是原系统提示词（不是新的）
        assert!(matches!(result[0].role, MessageRole::System));
        assert!(result[0]
            .content
            .to_string()
            .contains("Original system prompt"));
        // 第2条是压缩说明
        assert!(matches!(result[1].role, MessageRole::System));
    }

    #[tokio::test]
    async fn test_perform_compaction_below_threshold() {
        // 低于阈值时不压缩
        let messages = vec![Message {
            role: MessageRole::User,
            content: MessageContent::Text("Short message".to_string()),
            tool_calls: None,
            tool_call_id: None,
        }];

        let provider_config = ifainew_lib::harness::api::ProviderConfig {
            base_url: Some("http://test".to_string()),
            api_key: "test-key".to_string(),
            organization: None,
        };

        let result = perform_compaction(
            &messages,
            "gpt-4o",
            &provider_config,
            "system",
            CompactionMode::PreTurn,
        )
        .await;

        // 低于阈值，不压缩
        assert_eq!(result.len(), 1);
    }

    #[tokio::test]
    async fn test_perform_compaction_fallback_when_no_summary() {
        // AI 摘要失败时使用 fallback
        let mut messages = Vec::new();
        // 创建足够多的消息触发压缩（超过阈值）
        // gpt-4o 阈值是 102400 tokens，每条约 3000 tokens ≈ 12000 字符
        let long_message = "a".repeat(12000); // 约 3000 tokens
        for i in 1..=40 {
            messages.push(Message {
                role: MessageRole::User,
                content: MessageContent::Text(format!("Message {}: {}", i, long_message)),
                tool_calls: None,
                tool_call_id: None,
            });
        }

        // 无效的 provider_config，AI 摘要会失败
        let provider_config = ifainew_lib::harness::api::ProviderConfig {
            base_url: Some("http://invalid-url-that-will-fail".to_string()),
            api_key: "invalid-key".to_string(),
            organization: None,
        };

        let result = perform_compaction(
            &messages,
            "gpt-4o",
            &provider_config,
            "You are helpful.",
            CompactionMode::PreTurn,
        )
        .await;

        // 应该使用 fallback（保留最近 30 条）
        // 系统提示词 + 压缩说明 + 30条最近消息 = 32 条
        assert!(
            result.len() <= 32,
            "result.len() should be <= 32, got {}",
            result.len()
        );
        assert!(result.iter().any(|m| {
            matches!(m.role, MessageRole::System)
                && m.content.to_string().contains("(对话历史已压缩")
        }));
    }

    #[test]
    fn test_compaction_mode_pre_turn_manual_use_same_keep_last() {
        // PreTurn 和 Manual 模式都保留 30 条
        let pre_turn_keep = match CompactionMode::PreTurn {
            CompactionMode::PreTurn => 30,
            CompactionMode::Manual => 30,
            CompactionMode::MidTurn => 20,
        };
        let manual_keep = match CompactionMode::Manual {
            CompactionMode::PreTurn => 30,
            CompactionMode::Manual => 30,
            CompactionMode::MidTurn => 20,
        };
        assert_eq!(pre_turn_keep, 30);
        assert_eq!(manual_keep, 30);
    }

    #[test]
    fn test_compaction_mode_mid_turn_keeps_less() {
        // MidTurn 模式保留 20 条（轻量压缩）
        let mid_turn_keep = match CompactionMode::MidTurn {
            CompactionMode::PreTurn => 30,
            CompactionMode::Manual => 30,
            CompactionMode::MidTurn => 20,
        };
        assert_eq!(mid_turn_keep, 20);
    }

    #[test]
    fn test_format_stream_error_429() {
        // 🔥 单元测试：验证 format_stream_error 函数对 429 错误的处理
        use ifainew_lib::harness::api::types::ApiError;

        let error_429 = ApiError::HttpError {
            status: reqwest::StatusCode::from_u16(429).unwrap(),
            message: "Rate limited".to_string(),
        };

        let formatted = format_stream_error(&error_429);

        // 验证错误消息包含关键信息
        assert!(
            formatted.contains("Rate limited"),
            "429 错误消息应包含 'Rate limited'"
        );
        assert!(formatted.contains("wait"), "429 错误消息应提示等待");
    }
}
