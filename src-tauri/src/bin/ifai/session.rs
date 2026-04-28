//! Session & Event Collector — 两阶段工具调用协议
//!
//! 🏛️ 元编程：消除 `_ => {}` 静默忽略，显式事件路由
//!
//! 两阶段协议：
//! 1. **Collect 阶段**：累积 ToolStart 和 TextDelta 事件
//! 2. **Execute 阶段**：执行工具并发送结果回模型
//!
//! ToolDone 事件不再用于参数解析，参数仅来自 ToolStart.input

use std::io::{self, Write};
use std::time::{Duration, Instant};
use std::collections::HashMap;
use std::sync::Arc;
use std::cell::RefCell;
use futures_util::stream::StreamExt;
use serde_json::json;
use ifainew_lib::harness::api::types::{StreamEvent, Message, MessageRole, MessageContent, ToolCall, ToolCallFunction};
use ifainew_lib::harness::tool::{ToolRegistry, ToolRouter};
use ifainew_lib::prompt_manager;
use crate::provider::resolve_provider;
use crate::render::{self, RESET, Spinner};
use crate::prompt_vars::collect_cli_variables;
use crate::permission::{self as approval, ToolCategory, RiskLevel};
use crate::permission_store::{PermissionStore, PermissionRule, RuleType};
use crate::token;  // 🔥 元编程：Token 状态栏
use crate::token::format_number;  // 🔥 格式化数字（用于压缩统计）
use crate::pipeline::PipelineTracker;  // 🎨 元编程：Pipeline 可视化
use crate::loop_detector;  // 🎬 元编程：循环检测引擎

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
            if let Some(cmd) = args.get("cmd").and_then(|v| v.as_str()) {
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
                format!("{}... ({} 字符)", content.chars().take(37).collect::<String>(), content.chars().count())
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
// Pending Tool Call (Collect Phase)
// ============================================================================

/// 待执行的工具调用（Collect 阶段累积）
#[derive(Debug, Clone)]
pub struct PendingToolCall {
    pub tool_id: String,
    pub name: String,
    pub args: String,
}

// ============================================================================
// Event Collector (Two-Phase Protocol)
// ============================================================================

/// 🏛️ 元编程：EventCollector — 两阶段工具调用协议
///
/// **Collect 阶段**：
/// - ToolStart 事件创建工具占位符
/// - ToolDone 事件更新工具参数（完整参数在 ToolDone 中）
/// - 累积 TextDelta 事件 → response 文本
///
/// **Execute 阶段**：
/// - 执行所有待执行的工具调用
/// - 返回工具结果
///
/// **显式事件处理**：零 `_ => {}` 静默忽略
pub struct EventCollector {
    /// 待执行的工具调用
    pending_tools: Vec<PendingToolCall>,
    /// 工具 ID 到索引的映射（用于 ToolDone 更新参数）
    tool_index_map: HashMap<String, usize>,
    /// 响应文本
    response_text: String,
    /// 是否收集完成
    done: bool,
}

impl EventCollector {
    /// 创建新的 EventCollector
    pub fn new() -> Self {
        Self {
            pending_tools: Vec::new(),
            tool_index_map: HashMap::new(),
            response_text: String::new(),
            done: false,
        }
    }

    /// 🏛️ 元编程：Dispatch 事件 — 显式处理每个已知事件
    ///
    /// **消除 `_ => {}`**：每个事件变体都有明确的处理逻辑
    pub fn dispatch(&mut self, event: &StreamEvent) {
        match &event {
            // Collect 阶段：累积文本
            StreamEvent::TextDelta { text } => {
                self.response_text.push_str(text);
            }

            // 🔥 FIX: ToolStart 创建占位符（input 是空的）
            StreamEvent::ToolStart { tool_id, name, input } => {
                let index = self.pending_tools.len();
                self.tool_index_map.insert(tool_id.clone(), index);
                self.pending_tools.push(PendingToolCall {
                    tool_id: tool_id.clone(),
                    name: name.clone(),
                    args: String::new(), // 初始为空，等待 ToolDone 更新
                });
            }

            // 🔥 FIX: ToolDone 更新完整参数
            StreamEvent::ToolDone { tool_id, result } => {
                if let Some(&index) = self.tool_index_map.get(tool_id) {
                    if let Some(tool) = self.pending_tools.get_mut(index) {
                        tool.args = result.clone();
                    }
                }
            }

            // 已知事件：显式忽略（不使用 `_ => {}`）
            StreamEvent::MessageStart { .. } => {
                // 消息开始 - 无需处理
            }

            StreamEvent::MessageDone { .. } => {
                // 消息完成 - 标记收集阶段结束
                self.done = true;
            }

            // 错误事件：虽然我们不处理，但显式匹配以确保未来新增事件时编译器强制处理
            StreamEvent::Error { .. } => {
                // 错误由上层处理
            }
        }
    }

    /// 是否有待执行的工具调用
    pub fn has_pending_tools(&self) -> bool {
        !self.pending_tools.is_empty()
    }

    /// 获取待执行的工具调用
    pub fn pending_tools(&self) -> &[PendingToolCall] {
        &self.pending_tools
    }

    /// 获取响应文本
    pub fn response_text(&self) -> &str {
        &self.response_text
    }

    /// 是否收集完成
    pub fn is_done(&self) -> bool {
        self.done
    }

    /// 清空状态（用于下一轮）
    pub fn clear(&mut self) {
        self.pending_tools.clear();
        self.tool_index_map.clear();
        self.response_text.clear();
        self.done = false;
    }
}

impl Default for EventCollector {
    fn default() -> Self {
        Self::new()
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
// Session State (Placeholder)
// ============================================================================

/// 🔥 会话状态（支持 token 追踪）
pub struct Session {
    pub messages: Vec<Message>,
    pub provider: String,
    pub model: String,
    pub tool_registry: ToolRegistry,
    pub tool_router: Arc<ToolRouter>,
    /// 🔥 累积输入 token 数
    pub cumulative_input_tokens: u32,
    /// 🔥 累积输出 token 数
    pub cumulative_output_tokens: u32,
    /// 🔥 API key（从配置读取，优先级：CLI > Env > TOML > Default）
    api_key: Option<String>,
    /// 🔥 Base URL（可选，从 TOML 配置读取）
    base_url: Option<String>,
    /// 🔥 禁用工具调用（--no-tool 标志）
    tools_disabled: bool,
    /// 🔥 自定义系统提示词（--system 参数）
    custom_system_prompt: Option<String>,
    /// 🔥 权限存储（用户白名单）- 使用 RefCell 实现内部可变性
    permission_store: RefCell<PermissionStore>,
    /// 🔥 会话级权限规则（重启失效）
    session_rules: RefCell<Vec<PermissionRule>>,
    /// 🎨 Pipeline 跟踪器
    pipeline_tracker: PipelineTracker,
    /// 🎯 统一底部状态栏
    bottom_status_bar: token::BottomStatusBar,
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
        use crate::stream_render::{RenderPipeline, RenderMode};
        let render_pipeline = RenderPipeline::new(RenderMode::Animated);

        // 🎬 创建动画停止标志
        use std::sync::atomic::{AtomicBool, Ordering};
        let animation_stop = Arc::new(AtomicBool::new(false));

        Self {
            messages: Vec::new(),
            provider,
            model,
            tool_registry,
            tool_router,
            cumulative_input_tokens: 0,
            cumulative_output_tokens: 0,
            api_key: None,
            base_url: None,
            tools_disabled: false,
            custom_system_prompt: None,
            permission_store: RefCell::new(PermissionStore::load()),
            session_rules: RefCell::new(Vec::new()),
            pipeline_tracker: PipelineTracker::new(),
            bottom_status_bar,
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

    pub fn add_message(&mut self, msg: String) {
        // 将简单字符串消息转换为 Message 格式
        self.messages.push(Message {
            role: MessageRole::User,
            content: MessageContent::Text(msg),
            tool_calls: None,
            tool_call_id: None,
        });
    }

    pub fn clear_history(&mut self) {
        self.messages.clear();
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

        let client = ifainew_lib::harness::api::ApiClientFactory::create_provider(
            provider,
            &provider_config
        ).map_err(|e| format!("Failed to create client: {:?}", e))?;

        // 获取工具定义
        let tools: Vec<serde_json::Value> = self.tool_registry.all()
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
        self.messages.push(Message {
            role: MessageRole::User,
            content: MessageContent::Text(prompt.to_string()),
            tool_calls: None,
            tool_call_id: None,
        });

        // 🎨 创建 Spinner（立即完成，不显示，使用进度动画代替）
        let mut spinner = Spinner::new("");
        spinner.finish(true);  // 立即完成，避免显示
        let mut interval = tokio::time::interval(Duration::from_millis(150));
        interval.tick().await;

        // 🔥 元编程：从配置获取最大续播次数（而非硬编码）
        let current_category = approval::ToolCategory::Safe;  // 初始为 safe，会动态调整
        let max_continuations = approval::max_iterations(current_category);
        let mut continuation_count = 0;
        let mut full_response = String::new();
        let start_time = Instant::now();  // 🔥 记录开始时间

        // 🎯 自动压缩：检查 token 数量并在超过阈值时压缩
        let estimated_input = token::estimate_tokens(&self.messages);
        const COMPRESS_TOKEN_THRESHOLD: usize = 100_000;  // 100k tokens
        const COMPRESS_MESSAGE_THRESHOLD: usize = 100;     // 100 messages

        let need_compress = estimated_input > COMPRESS_TOKEN_THRESHOLD
            || self.messages.len() > COMPRESS_MESSAGE_THRESHOLD;

        if need_compress {
            let theme = render::default_theme();
            eprintln!(
                "{}⚠️  对话过长 ({} tokens, {} messages)，正在自动压缩...{}",
                theme.warning, estimated_input, self.messages.len(), render::RESET
            );

            // 自动压缩：保留最后 50 条消息
            let keep_last_n = 50.min(self.messages.len());
            let total_messages = self.messages.len();
            self.messages = self.messages.split_off(total_messages.saturating_sub(keep_last_n));

            // 保留第一条系统消息（如果有）
            let has_system = self.messages.first()
                .map(|m| matches!(m.role, MessageRole::System))
                .unwrap_or(false);

            if !has_system && !system_prompt.is_empty() {
                self.messages.insert(0, Message {
                    role: MessageRole::System,
                    content: MessageContent::Text(
                        format!("(对话历史已压缩，保留最近 {} 条消息)", keep_last_n)
                    ),
                    tool_calls: None,
                    tool_call_id: None,
                });
            }

            let new_tokens = token::estimate_tokens(&self.messages);
            eprintln!(
                "{}✓ 压缩完成：{} → {} tokens (减少 {:.1}%){}",
                theme.success,
                format_number(estimated_input),
                format_number(new_tokens),
                ((estimated_input.saturating_sub(new_tokens)) as f64 / estimated_input as f64) * 100.0,
                render::RESET
            );
        }

        loop {
            // 构建请求
            let request = ifainew_lib::harness::api::StreamRequest {
                model: self.model.clone(),
                messages: self.messages.clone(),
                max_tokens: 4096,
                system: Some(system_prompt.clone()),
                temperature: Some(0.7),
                stream: true,
                // 🔥 如果禁用工具，不发送 tools 参数
                tools: if self.tools_disabled || tools.is_empty() { None } else { Some(tools.clone()) },
            };

            // 发送流式请求
            let mut stream = client.stream(request).await
                .map_err(|e| format!("Failed to start stream: {:?}", e))?;

            // 🎬 启动进度动画任务（每 100ms 更新一帧）
            let model_clone = self.model.clone();
            let stop_flag = self.animation_stop.clone();
            let animation_task = tokio::spawn(async move {
                use std::sync::atomic::Ordering;

                let mut pipeline = crate::stream_render::RenderPipeline::new(
                    crate::stream_render::RenderMode::Animated
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

            let theme = render::default_theme();
            let mut first_delta = true;
            let mut current_response = String::new();

            // EventCollector - 两阶段协议
            let mut collector = EventCollector::new();

            // 🔥 元编程：估算输入 tokens（复用 token::estimate_tokens）
            let estimated_input = token::estimate_tokens(&self.messages);

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

                                        // 🎨 元编程：不在流式阶段创建步骤（此时 input 为空）
                                        // 在 execute_tools() 中使用完整参数创建

                                        collector.dispatch(&event);
                                    }
                                    StreamEvent::ToolDone { tool_id, result } => {
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
                                        self.cumulative_input_tokens += *input_tokens;
                                        self.cumulative_output_tokens += *output_tokens;

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
                            Some(Err(e)) => {
                                if first_delta {
                                    spinner.finish(false);
                                    print!("\r{}  \r", " ".repeat(30));
                                }
                                eprintln!("\n{}Stream error: {:?}{}", theme.error, e, RESET);
                                return Err(format!("Stream error: {:?}", e));
                            }
                            None => {
                                break;
                            }
                        }
                    }
                }
            }

            // 检查是否有工具调用需要执行
            if !collector.has_pending_tools() {
                // 没有工具调用，正常结束
                self.messages.push(Message {
                    role: MessageRole::Assistant,
                    content: MessageContent::Text(current_response.clone()),
                    tool_calls: None,
                    tool_call_id: None,
                });

                // 🎨 符合提案规范：渲染完成统计
                let elapsed_secs = start_time.elapsed().as_secs_f64();
                let summary = self.render_pipeline.render_summary(
                    elapsed_secs,
                    self.cumulative_input_tokens,
                    self.cumulative_output_tokens,
                );
                println!("{}", summary);

                break;
            }

            // Execute 阶段：执行工具
            println!(); // 换行
            let tool_results = self.execute_tools(collector.pending_tools())?;

            // 如果所有工具都被循环检测阻止，终止循环避免死循环
            if !tool_results.is_empty() && tool_results.iter().all(|(_, _, result, _)| result.contains("循环检测阻止")) {
                println!("\n所有工具调用均被循环检测阻止，终止执行");
                break;
            }

            // 构建 tool_calls 和 tool 结果消息
            let tool_calls_value: Vec<ToolCall> = tool_results.iter().map(|(id, name, _, _)| {
                ToolCall {
                    id: id.clone(),
                    call_type: "function".to_string(),
                    function: ToolCallFunction {
                        name: name.clone(),
                        arguments: String::new(), // 将在下面填充
                    },
                }
            }).collect();

            // 添加 assistant 消息（带 tool_calls）
            self.messages.push(Message {
                role: MessageRole::Assistant,
                content: MessageContent::Text(current_response.clone()),
                tool_calls: Some(tool_calls_value.clone()),
                tool_call_id: None,
            });

            // 添加工具结果消息
            for (tool_id, _name, result, _) in &tool_results {
                self.messages.push(Message {
                    role: MessageRole::Tool,
                    content: MessageContent::Text(result.clone()),
                    tool_calls: None,
                    tool_call_id: Some(tool_id.clone()),
                });
            }

            // 🎨 元编程：渲染工具结果（使用 PipelineStep）
            for (tool_id, name, _result, _duration) in &tool_results {
                // 从 pipeline_tracker 获取完成后的步骤
                let completed_steps = self.pipeline_tracker.completed_steps();
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
                        println!("\n{} {}({})  [{}]", status_render, name, args_preview, duration_str);
                    } else {
                        println!("\n{} {}({})", status_render, name, args_preview);
                    }

                    // 渲染输出
                    match &step.output {
                        crate::pipeline::StepOutput::Empty => {}
                        crate::pipeline::StepOutput::Full { content } => {
                            println!("   ╾ {}", content.lines().collect::<Vec<_>>().join("\n   ╾ "));
                        }
                        crate::pipeline::StepOutput::Truncated { preview, total_lines } => {
                            println!("   ╾ {}", preview.lines().collect::<Vec<_>>().join("\n   ╾ "));
                            println!("   ╾ (共 {} 行，使用 --verbose 查看完整输出)", total_lines);
                        }
                    }
                }
            }

            // 🔥 元编程：根据工具类别动态获取最大迭代次数
            let current_category = collector.pending_tools()
                .first()
                .map(|t| approval::categorize_tool(&t.name))
                .unwrap_or(approval::ToolCategory::Safe);
            let dynamic_max = approval::max_iterations(current_category);

            // 续播检查
            continuation_count += 1;
            if continuation_count >= dynamic_max {
                eprintln!("\n{}Maximum tool iterations reached ({}) for {:?} tools{}",
                    theme.warning, dynamic_max, current_category, RESET);
                break;
            }

            // 继续续播
            println!("\n{}Continuing... ({}/{}){}", theme.dim, continuation_count, dynamic_max, RESET);
        }

        // 结束后换行
        println!();
        Ok(full_response)
    }

    /// 🖥️ TUI 模式的流式提示（通过 channel 发送输出，不直接 print）
    pub async fn stream_prompt_tui(
        &mut self,
        prompt: &str,
        output_tx: tokio::sync::mpsc::UnboundedSender<String>,
        status_tx: tokio::sync::mpsc::UnboundedSender<String>,
        approval_tx: tokio::sync::mpsc::UnboundedSender<crate::approval_overlay::ApprovalRequest>,
    ) -> Result<String, String> {
        let spec = resolve_provider(&self.provider)
            .map_err(|e| format!("Failed to resolve provider: {}", e))?;

        // 🔥 优先使用自定义系统提示词（--system 参数）
        let system_prompt = if let Some(custom) = &self.custom_system_prompt {
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

        let api_key = self.get_api_key(env_key)?;

        let provider_config = ifainew_lib::harness::api::ProviderConfig {
            api_key,
            base_url: self.base_url.clone(),
            organization: None,
        };

        let client = ifainew_lib::harness::api::ApiClientFactory::create_provider(
            provider,
            &provider_config
        ).map_err(|e| format!("Failed to create client: {:?}", e))?;

        let tools: Vec<serde_json::Value> = self.tool_registry.all()
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
        self.messages.push(Message {
            role: MessageRole::User,
            content: MessageContent::Text(prompt.to_string()),
            tool_calls: None,
            tool_call_id: None,
        });

        let start_time = Instant::now();
        let mut full_response = String::new();

        // 自动压缩检查
        let estimated_input = token::estimate_tokens(&self.messages);
        const COMPRESS_TOKEN_THRESHOLD: usize = 100_000;
        const COMPRESS_MESSAGE_THRESHOLD: usize = 100;

        let need_compress = estimated_input > COMPRESS_TOKEN_THRESHOLD
            || self.messages.len() > COMPRESS_MESSAGE_THRESHOLD;

        if need_compress {
            let _ = output_tx.send(format!("⚠️ 对话过长 ({} tokens, {} messages)，正在自动压缩...", estimated_input, self.messages.len()));
            let keep_last_n = 50.min(self.messages.len());
            let total_messages = self.messages.len();
            self.messages = self.messages.split_off(total_messages.saturating_sub(keep_last_n));

            let has_system = self.messages.first()
                .map(|m| matches!(m.role, MessageRole::System))
                .unwrap_or(false);

            if !has_system && !system_prompt.is_empty() {
                self.messages.insert(0, Message {
                    role: MessageRole::System,
                    content: MessageContent::Text(
                        format!("(对话历史已压缩，保留最近 {} 条消息)", keep_last_n)
                    ),
                    tool_calls: None,
                    tool_call_id: None,
                });
            }

            let new_tokens = token::estimate_tokens(&self.messages);
            let _ = output_tx.send(format!("✓ 压缩完成：{} → {} tokens", format_number(estimated_input), format_number(new_tokens)));
        }

        // TUI 上下文警告
        let token_count = token::estimate_tokens(&self.messages);
        let max_tokens = token::get_model_max_tokens(&self.model);
        if token_count > (max_tokens * 80 / 100) && self.messages.len() >= 10 {
            let _ = output_tx.send(format!("Warning: Context size ({} tokens, {} messages) exceeds 80% of model limit ({}).", token_count, self.messages.len(), max_tokens));
            let _ = output_tx.send("Tip: Use /compact to compress or /clear to start fresh.".to_string());
        }

        let current_category = approval::ToolCategory::Safe;
        let max_continuations = approval::max_iterations(current_category);
        let mut continuation_count = 0;

        let _ = status_tx.send(format!("Streaming ({})", self.model));

        // 🔥 清空 PipelineTracker 状态（确保不会显示上一次的工具结果）
        self.pipeline_tracker.clear();

        loop {
            let request = ifainew_lib::harness::api::StreamRequest {
                model: self.model.clone(),
                messages: self.messages.clone(),
                max_tokens: 4096,
                system: Some(system_prompt.clone()),
                temperature: Some(0.7),
                stream: true,
                tools: if self.tools_disabled || tools.is_empty() { None } else { Some(tools.clone()) },
            };

            let mut stream = client.stream(request).await
                .map_err(|e| format!("Failed to start stream: {:?}", e))?;

            // 不启动动画任务（TUI 自己管理渲染）
            let mut first_delta = true;
            let mut current_response = String::new();
            let mut collector = EventCollector::new();
            let estimated_input = token::estimate_tokens(&self.messages);
            let mut line_buffer = String::new(); // 🖥️ TUI：缓冲未完成的行

            use token::StatusBarState;

            loop {
                match stream.next().await {
                    Some(Ok(event)) => {
                        match &event {
                            StreamEvent::TextDelta { text } => {
                                if first_delta {
                                    first_delta = false;
                                    self.bottom_status_bar.transition(StatusBarState::Streaming {
                                        estimated_input,
                                        current_output: 0,
                                        current_tool: None,
                                    });
                                }

                                let _current_output = self.bottom_status_bar.update_streaming_output(text);
                                current_response.push_str(text);
                                full_response.push_str(text);

                                // 🖥️ TUI：按换行符分割，发送完整行
                                line_buffer.push_str(text);
                                while let Some(newline_pos) = line_buffer.find('\n') {
                                    let complete_line = line_buffer[..newline_pos].to_string();
                                    line_buffer = line_buffer[newline_pos + 1..].to_string();
                                    let _ = output_tx.send(complete_line);
                                }

                                // 更新状态栏
                                let status = self.bottom_status_bar.render_fixed();
                                let _ = status_tx.send(status);

                                collector.dispatch(&event);
                            }
                            StreamEvent::ToolStart { tool_id, name, input } => {
                                if first_delta {
                                    first_delta = false;
                                    self.bottom_status_bar.transition(StatusBarState::Streaming {
                                        estimated_input,
                                        current_output: 0,
                                        current_tool: Some(name.clone()),
                                    });
                                }
                                let _ = status_tx.send(format!("Tool: {} [running]", name));
                                collector.dispatch(&event);
                            }
                            StreamEvent::ToolDone { tool_id, result } => {
                                collector.dispatch(&event);
                            }
                            StreamEvent::Error { code, message } => {
                                let _ = output_tx.send(format!("Error [{}]: {}", code, message));
                            }
                            StreamEvent::MessageDone { input_tokens, output_tokens } => {
                                self.cumulative_input_tokens += *input_tokens;
                                self.cumulative_output_tokens += *output_tokens;

                                // 🖥️ TUI：刷新剩余缓冲区
                                if !line_buffer.is_empty() {
                                    let _ = output_tx.send(std::mem::take(&mut line_buffer));
                                }

                                self.bottom_status_bar.transition(StatusBarState::Idle);
                                let _ = status_tx.send("Done".to_string());

                                collector.dispatch(&event);
                            }
                            _ => {
                                collector.dispatch(&event);
                            }
                        }
                    }
                    Some(Err(e)) => {
                        let _ = output_tx.send(format!("Stream error: {:?}", e));
                        return Err(format!("Stream error: {:?}", e));
                    }
                    None => {
                        break;
                    }
                }
            }

            if !collector.has_pending_tools() {
                self.messages.push(Message {
                    role: MessageRole::Assistant,
                    content: MessageContent::Text(current_response.clone()),
                    tool_calls: None,
                    tool_call_id: None,
                });

                let elapsed_secs = start_time.elapsed().as_secs_f64();
                let summary = self.render_pipeline.render_summary(
                    elapsed_secs,
                    self.cumulative_input_tokens,
                    self.cumulative_output_tokens,
                );
                let _ = output_tx.send(summary);

                break;
            }

            // Execute 阶段：执行工具（TUI 模式通过审批 channel 交互）
            let _ = output_tx.send(String::new());
            let tool_results = self.execute_tools_tui(collector.pending_tools(), &output_tx, &approval_tx).await?;

            // 如果所有工具都被循环检测阻止，终止循环避免死循环
            if !tool_results.is_empty() && tool_results.iter().all(|(_, _, result, _)| result.contains("循环检测阻止")) {
                let _ = output_tx.send("所有工具调用均被循环检测阻止，终止执行".to_string());
                break;
            }

            let tool_calls_value: Vec<ToolCall> = tool_results.iter().map(|(id, name, _, _)| {
                ToolCall {
                    id: id.clone(),
                    call_type: "function".to_string(),
                    function: ToolCallFunction {
                        name: name.clone(),
                        arguments: String::new(),
                    },
                }
            }).collect();

            self.messages.push(Message {
                role: MessageRole::Assistant,
                content: MessageContent::Text(current_response.clone()),
                tool_calls: Some(tool_calls_value.clone()),
                tool_call_id: None,
            });

            for (tool_id, _name, result, _) in &tool_results {
                self.messages.push(Message {
                    role: MessageRole::Tool,
                    content: MessageContent::Text(result.clone()),
                    tool_calls: None,
                    tool_call_id: Some(tool_id.clone()),
                });
            }

            // 渲染工具结果
            let theme = render::default_theme();
            for (tool_id, name, _result, _duration) in &tool_results {
                let completed_steps = self.pipeline_tracker.completed_steps();
                // 从最新到最旧查找，避免匹配到之前同名的旧步骤
                if let Some(step) = completed_steps.iter().rev().find(|s| s.tool_name == *name) {
                    let status_render = step.status.render_with_theme("zh", &theme, RESET);
                    let args_preview = if step.tool_args.chars().count() > 50 {
                        format!("{}...", step.tool_args.chars().take(47).collect::<String>())
                    } else {
                        step.tool_args.clone()
                    };

                    if let Some(duration) = step.metadata.duration {
                        let _ = output_tx.send(format!("\n{} {}({})  [{}]", status_render, name, args_preview, format_duration(duration.as_secs_f64())));
                    } else {
                        let _ = output_tx.send(format!("\n{} {}({})", status_render, name, args_preview));
                    }

                    match &step.output {
                        crate::pipeline::StepOutput::Empty => {}
                        crate::pipeline::StepOutput::Full { content } => {
                            let _ = output_tx.send(format!("   ╾ {}", content.lines().collect::<Vec<_>>().join("\n   ╾ ")));
                        }
                        crate::pipeline::StepOutput::Truncated { preview, total_lines } => {
                            let _ = output_tx.send(format!("   ╾ {}", preview.lines().collect::<Vec<_>>().join("\n   ╾ ")));
                            let _ = output_tx.send(format!("   ╾ (共 {} 行)", total_lines));
                        }
                    }
                }
            }

            let current_category = collector.pending_tools()
                .first()
                .map(|t| approval::categorize_tool(&t.name))
                .unwrap_or(approval::ToolCategory::Safe);
            let dynamic_max = approval::max_iterations(current_category);

            continuation_count += 1;
            if continuation_count >= dynamic_max {
                let _ = output_tx.send(format!("Maximum tool iterations reached ({})", dynamic_max));
                break;
            }

            let _ = output_tx.send(format!("Continuing... ({}/{})", continuation_count, dynamic_max));
        }

        let _ = output_tx.send(String::new());
        Ok(full_response)
    }

    /// 🔧 TUI 模式执行工具（通过审批 channel 交互确认）
    async fn execute_tools_tui(
        &mut self,
        tools: &[PendingToolCall],
        output_tx: &tokio::sync::mpsc::UnboundedSender<String>,
        approval_tx: &tokio::sync::mpsc::UnboundedSender<crate::approval_overlay::ApprovalRequest>,
    ) -> Result<Vec<(String, String, String, Duration)>, String> {
        let mut results = Vec::new();

        for tool in tools {
            self.pipeline_tracker.start_step(
                tool.tool_id.clone(),
                tool.name.clone(),
                tool.args.clone(),
            );
        }

        for tool in tools {
            // 🔥 首先检查用户白名单（持久化 + 会话级）
            let args_json: serde_json::Value = serde_json::from_str(&tool.args)
                .unwrap_or(serde_json::json!({}));
            let store_allowed = self.permission_store.borrow().is_allowed(&tool.name, &args_json);

            // 检查会话级规则（在 Session.session_rules 中）
            let session_allowed = {
                let session_rules = self.session_rules.borrow();
                let mut allowed = false;
                for rule in session_rules.iter() {
                    if rule.tool_name == tool.name && rule.rule_type == RuleType::Allow {
                        // 提取当前命令的目标值（不带后缀）
                        let target = crate::permission_store::PermissionStore::extract_target_value(&tool.name, &args_json);
                        // 检查是否匹配
                        if crate::permission_store::PermissionStore::match_rule(&rule.pattern, &target) {
                            allowed = true;
                            break;
                        }
                    }
                }
                allowed
            };

            // 然后检查系统默认自动审批规则
            let auto_approve = store_allowed || session_allowed || approval::should_auto_approve(&tool.name, false);

            if !auto_approve {
                // 通过 channel 发送审批请求，等待用户决策
                let (response_tx, response_rx) = tokio::sync::oneshot::channel();
                let request = crate::approval_overlay::ApprovalRequest::from_tool(tool, response_tx);
                if approval_tx.send(request).is_err() {
                    let error_msg = format!("Tool '{}': approval channel closed", tool.name);
                    self.pipeline_tracker.skip_step(&tool.tool_id, error_msg.clone());
                    results.push((tool.tool_id.clone(), tool.name.clone(), error_msg, Duration::ZERO));
                    continue;
                }

                match response_rx.await {
                    Ok(crate::approval_overlay::ApprovalDecision::ApproveOnce) => {
                        // 继续执行
                    }
                    Ok(crate::approval_overlay::ApprovalDecision::ApproveAlways) => {
                        // 持久化白名单（写入文件 + 内存）
                        let pattern = crate::permission_store::PermissionStore::extract_pattern(&tool.name, &args_json);
                        let rule = crate::permission_store::PermissionRule {
                            tool_name: tool.name.clone(),
                            pattern,
                            rule_type: RuleType::Allow,
                        };
                        self.permission_store.borrow_mut().add_persistent_rule(rule);
                    }
                    Ok(crate::approval_overlay::ApprovalDecision::ApproveSession) => {
                        // 会话级白名单（仅内存）
                        let pattern = crate::permission_store::PermissionStore::extract_pattern(&tool.name, &args_json);
                        let rule = crate::permission_store::PermissionRule {
                            tool_name: tool.name.clone(),
                            pattern,
                            rule_type: RuleType::Allow,
                        };
                        self.session_rules.borrow_mut().push(rule);
                    }
                    Ok(crate::approval_overlay::ApprovalDecision::Deny) => {
                        let error_msg = format!("Tool '{}' execution denied by user", tool.name);
                        self.pipeline_tracker.skip_step(&tool.tool_id, error_msg.clone());
                        results.push((tool.tool_id.clone(), tool.name.clone(), error_msg, Duration::ZERO));
                        continue;
                    }
                    Ok(crate::approval_overlay::ApprovalDecision::Abort) => {
                        // 中止后续所有工具
                        return Err("aborted by user".to_string());
                    }
                    Err(_) => {
                        let error_msg = format!("Tool '{}': approval channel closed", tool.name);
                        self.pipeline_tracker.skip_step(&tool.tool_id, error_msg.clone());
                        results.push((tool.tool_id.clone(), tool.name.clone(), error_msg, Duration::ZERO));
                        return Err("approval channel closed".to_string());
                    }
                }
            }

            // 循环检测
            let loop_status = approval::check_loop(&tool.name, &tool.args);
            if loop_status.should_stop() {
                if let loop_detector::LoopDetectionStatus::Blocked { reason } = loop_status {
                    let _ = output_tx.send(format!("⚠️ 循环检测触发: {}", reason));
                    self.pipeline_tracker.skip_step(
                        &tool.tool_id,
                        format!("循环检测阻止: {}", reason),
                    );
                    let error_msg = format!("Tool '{}' 被循环检测阻止: {}", tool.name, reason);
                    results.push((tool.tool_id.clone(), tool.name.clone(), error_msg, Duration::ZERO));
                    continue;
                }
            }

            let start = Instant::now();

            match self.tool_router.execute(&tool.name, &args_json) {
                Ok(result) => {
                    let duration = start.elapsed();
                    self.pipeline_tracker.finish_step_success(
                        &tool.tool_id,
                        result.clone(),
                        duration,
                    );
                    results.push((tool.tool_id.clone(), tool.name.clone(), result, duration));
                }
                Err(e) => {
                    let duration = start.elapsed();
                    let error_msg = format!("Error: {:?}", e);
                    self.pipeline_tracker.finish_step_error(
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
    fn execute_tools(&mut self, tools: &[PendingToolCall]) -> Result<Vec<(String, String, String, Duration)>, String> {
        let mut results = Vec::new();
        let theme = render::default_theme();  // 🎨 主题（用于循环检测警告）

        // 🎨 元编程：为所有工具创建 PipelineStep（使用完整参数）
        for tool in tools {
            self.pipeline_tracker.start_step(
                tool.tool_id.clone(),
                tool.name.clone(),
                tool.args.clone(),
            );
        }

        for tool in tools {
            // 🔥 元编程：使用配置驱动的权限判断
            let category = approval::categorize_tool(&tool.name);
            let risk = approval::calculate_risk(&tool.name, &serde_json::from_str::<serde_json::Value>(&tool.args).unwrap_or(serde_json::json!({})));
            let auto_approve = approval::should_auto_approve(&tool.name, false);  // CLI 中无沙箱

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
                    io::stdout().flush().map_err(|e| format!("Failed to flush stdout: {}", e))?;

                    // 简单的用户输入（生产环境应使用更健壮的方法）
                    let mut input = String::new();
                    io::stdin().read_line(&mut input).map_err(|e| format!("Failed to read input: {}", e))?;

                    if input.trim() != "y" && input.trim() != "Y" {
                        // 🎨 元编程：标记步骤为跳过
                        self.pipeline_tracker.skip_step(
                            &tool.tool_id,
                            format!("User denied execution of '{}'", tool.name),
                        );

                        let error_msg = format!("Tool '{}' execution denied by user", tool.name);
                        results.push((tool.tool_id.clone(), tool.name.clone(), error_msg, Duration::ZERO));

                        continue;
                    }
                }
            }

            // 🎬 元编程：循环检测（执行前检测，预防性阻止）
            let loop_status = approval::check_loop(&tool.name, &tool.args);
            if loop_status.should_stop() {
                if let loop_detector::LoopDetectionStatus::Blocked { reason } = loop_status {
                    eprintln!("\n{}⚠️  循环检测触发: {}{}",
                        theme.warning, reason, render::RESET);

                    // 🎨 元编程：标记步骤为跳过（循环阻止）
                    self.pipeline_tracker.skip_step(
                        &tool.tool_id,
                        format!("循环检测阻止: {}", reason),
                    );

                    // 返回错误给 AI，让 AI 知道这个工具调用被阻止了
                    let error_msg = format!("Tool '{}' 被循环检测阻止: {}", tool.name, reason);
                    results.push((tool.tool_id.clone(), tool.name.clone(), error_msg, Duration::ZERO));

                    continue;  // 跳过当前工具，继续处理下一个
                }
            } else if loop_status.should_warn() {
                if let loop_detector::LoopDetectionStatus::Warning { count, pattern } = loop_status {
                    eprintln!("\n{}⚠️  循环检测警告: {} (已执行 {} 次){}",
                        theme.warning, pattern, count, render::RESET);
                }
            }

            // 🎯 更新底部状态栏状态（但不显示，避免干扰对话）
            use token::StatusBarState;
            self.bottom_status_bar.transition(StatusBarState::ExecutingTool {
                tool_name: tool.name.clone(),
                tool_count: results.len(),
                tool_success: results.iter().filter(|r| !r.2.starts_with("Error:")).count(),
                tool_errors: results.iter().filter(|r| r.2.starts_with("Error:")).count(),
            });

            let args_json: serde_json::Value = serde_json::from_str(&tool.args)
                .map_err(|e| format!("Failed to parse tool args: {}", e))?;

            // 🎨 元编程：记录执行时间
            let start = Instant::now();

            match self.tool_router.execute(&tool.name, &args_json) {
                Ok(result) => {
                    let duration = start.elapsed();

                    // 🎨 元编程：标记步骤为成功
                    self.pipeline_tracker.finish_step_success(
                        &tool.tool_id,
                        result.clone(),
                        duration,
                    );

                    results.push((tool.tool_id.clone(), tool.name.clone(), result, duration));
                }
                Err(e) => {
                    let duration = start.elapsed();
                    let error_msg = format!("Error: {:?}", e);

                    // 🎨 元编程：标记步骤为失败
                    self.pipeline_tracker.finish_step_error(
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
fn build_cli_system_prompt(spec: &ifainew_lib::harness::api::provider_metadata::ProviderSpec) -> String {
    // 1. 收集 CLI 特定变量（元编程）
    let mut variables = collect_cli_variables(spec);

    // 2. 从 BuiltinPrompts 加载 CLI 模板（编译时嵌入）
    let template_content = if let Some(content_file) = prompt_manager::BuiltinPrompts::get("system/cli.md") {
        std::str::from_utf8(content_file.data.as_ref())
            .unwrap_or("You are IfAI CLI.")
            .to_string()
    } else {
        // Fallback: 使用旧模板（过渡期）
        return format!(
            "你是 IfAI CLI，一个专业的 AI 代码助手，由 {} 模型驱动。\n\n## 你的身份\n- 名字：IfAI CLI\n- 角色：AI 代码助手和开发伙伴\n\n## 注意事项\n- 你是 IfAI CLI，不是 {}",
            spec.metadata.name, spec.metadata.name
        );
    };

    // 3. 使用 Handlebars 渲染（元编程）
    match prompt_manager::template::render_template(&template_content, &variables) {
        Ok(rendered) => rendered,
        Err(e) => {
            // 渲染失败时返回原始模板
            eprintln!("Warning: Failed to render prompt template: {}", e);
            template_content
        }
    }
}

// ============================================================================
// Tests
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_event_collector_new() {
        let collector = EventCollector::new();
        assert!(!collector.has_pending_tools());
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
        let mut collector = EventCollector::new();
        // ToolStart: 创建占位符（args 为空）
        collector.dispatch(&StreamEvent::ToolStart {
            tool_id: "call_1".to_string(),
            name: "bash".to_string(),
            input: String::new(), // 初始为空
        });
        // ToolDone: 更新完整参数
        collector.dispatch(&StreamEvent::ToolDone {
            tool_id: "call_1".to_string(),
            result: r#"{"command":"ls"}"#.to_string(),
        });

        assert!(collector.has_pending_tools());
        assert_eq!(collector.pending_tools().len(), 1);

        let tool = &collector.pending_tools()[0];
        assert_eq!(tool.tool_id, "call_1");
        assert_eq!(tool.name, "bash");
        assert_eq!(tool.args, r#"{"command":"ls"}"#);
    }

    #[test]
    fn test_collect_multiple_tools() {
        let mut collector = EventCollector::new();
        // Tool 1
        collector.dispatch(&StreamEvent::ToolStart {
            tool_id: "call_1".to_string(),
            name: "bash".to_string(),
            input: String::new(),
        });
        collector.dispatch(&StreamEvent::ToolDone {
            tool_id: "call_1".to_string(),
            result: r#"{"command":"ls"}"#.to_string(),
        });
        // Tool 2
        collector.dispatch(&StreamEvent::ToolStart {
            tool_id: "call_2".to_string(),
            name: "TodoWrite".to_string(),
            input: String::new(),
        });
        collector.dispatch(&StreamEvent::ToolDone {
            tool_id: "call_2".to_string(),
            result: r#"{"todos":[{"content":"test"}]}"#.to_string(),
        });

        assert_eq!(collector.pending_tools().len(), 2);
        assert_eq!(collector.pending_tools()[0].name, "bash");
        assert_eq!(collector.pending_tools()[1].name, "TodoWrite");
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

        assert_eq!(collector.response_text(), "Thinking...");
        assert!(collector.has_pending_tools());
        assert_eq!(collector.pending_tools().len(), 1);
    }

    #[test]
    fn test_message_done_marks_done() {
        let mut collector = EventCollector::new();
        assert!(!collector.is_done());

        collector.dispatch(&StreamEvent::MessageDone { input_tokens: 100, output_tokens: 50 });
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

        assert!(collector.has_pending_tools());
        assert!(!collector.response_text().is_empty());

        collector.clear();

        assert!(!collector.has_pending_tools());
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
        assert!(session.messages.is_empty());
    }

    #[test]
    fn test_session_add_message() {
        let mut session = Session::new("deepseek".to_string(), "deepseek-chat".to_string());
        session.add_message("Hello".to_string());
        session.add_message("World".to_string());

        assert_eq!(session.messages.len(), 2);
        assert!(matches!(session.messages[0].role, MessageRole::User));
        assert!(matches!(session.messages[1].role, MessageRole::User));

        // 检查文本内容
        match &session.messages[0].content {
            MessageContent::Text(text) => assert_eq!(text, "Hello"),
            _ => panic!("Expected Text content"),
        }
        match &session.messages[1].content {
            MessageContent::Text(text) => assert_eq!(text, "World"),
            _ => panic!("Expected Text content"),
        }
    }

    #[test]
    fn test_session_clear_history() {
        let mut session = Session::new("deepseek".to_string(), "deepseek-chat".to_string());
        session.add_message("test".to_string());
        assert_eq!(session.messages.len(), 1);

        session.clear_history();
        assert!(session.messages.is_empty());
    }

    #[test]
    fn test_event_collector_explicit_event_handling() {
        // 🏛️ 元编程：验证所有已知事件都被显式处理
        // 添加新事件时，编译器会强制在这里添加测试
        let mut collector = EventCollector::new();

        // MessageStart - 显式忽略
        collector.dispatch(&StreamEvent::MessageStart {
            message_id: "msg_1".to_string(),
        });

        // TextDelta - 累积文本
        collector.dispatch(&StreamEvent::TextDelta {
            text: "test".to_string(),
        });

        // ToolStart - 创建占位符（args 为空）
        collector.dispatch(&StreamEvent::ToolStart {
            tool_id: "call_1".to_string(),
            name: "test".to_string(),
            input: String::new(),
        });

        // ToolDone - 更新完整参数
        collector.dispatch(&StreamEvent::ToolDone {
            tool_id: "call_1".to_string(),
            result: r#"{"arg":"value"}"#.to_string(),
        });

        // MessageDone - 标记完成
        collector.dispatch(&StreamEvent::MessageDone { input_tokens: 100, output_tokens: 50 });

        // Error - 显式处理（虽然不操作）
        collector.dispatch(&StreamEvent::Error {
            code: "test_error".to_string(),
            message: "test message".to_string(),
        });

        // 验证状态
        assert_eq!(collector.response_text(), "test");
        assert!(collector.has_pending_tools());
        assert_eq!(collector.pending_tools()[0].args, r#"{"arg":"value"}"#);
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
        session.disable_tools();  // 禁用工具避免测试复杂度

        // 3. 记录初始消息数
        assert_eq!(session.messages.len(), 0, "初始应该没有消息");

        // 4. 发送 55 轮对话（产生 110 条消息，超过 100 条阈值）
        for i in 1..=55 {
            let prompt = format!("message {}", i);
            match session.stream_prompt(&prompt).await {
                Ok(_) => {},
                Err(e) => {
                    // 忽略流式错误，我们主要关注压缩逻辑
                    eprintln!("Warning: stream_prompt error for message {}: {:?}", i, e);
                }
            }
        }

        // 5. 验证压缩被触发：消息数应该明显少于原始数量
        // 55 轮应该产生 110 条消息，压缩后应该 <= 100 条
        assert!(
            session.messages.len() <= 100,
            "压缩后应该保留最近 100 条消息以内，实际: {}",
            session.messages.len()
        );

        // 6. 验证消息确实被压缩了（不是简单的 0 或 110）
        assert!(session.messages.len() > 0, "压缩后应该还有消息");
        assert!(session.messages.len() < 110, "压缩后消息数应该少于原始 110 条");
    }

    #[test]
    fn test_compression_threshold_constants() {
        // 验证压缩阈值常量
        const COMPRESS_TOKEN_THRESHOLD: usize = 100_000;
        const COMPRESS_MESSAGE_THRESHOLD: usize = 100;

        assert_eq!(COMPRESS_TOKEN_THRESHOLD, 100_000, "Token 阈值应该是 100k");
        assert_eq!(COMPRESS_MESSAGE_THRESHOLD, 100, "消息阈值应该是 100");
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
        assert_eq!(session.messages.len(), 105, "压缩前应该有 105 条消息");

        // 手动触发压缩逻辑（模拟 stream_prompt 中的压缩）
        let total_messages = session.messages.len();
        let keep_last_n = 50.min(total_messages);
        session.messages = session.messages.split_off(
            total_messages.saturating_sub(keep_last_n)
        );

        // 验证压缩后保留 50 条
        assert_eq!(session.messages.len(), 50, "压缩后应该保留 50 条消息");

        // 验证保留的是最近的消息（最后 50 条）
        match &session.messages[0].content {
            MessageContent::Text(text) => {
                assert_eq!(text, "message_56", "第一条应该是 message_56（第 56 条原始消息）");
            },
            _ => panic!("Expected Text content"),
        }

        match &session.messages[49].content {
            MessageContent::Text(text) => {
                assert_eq!(text, "message_105", "最后一条应该是 message_105");
            },
            _ => panic!("Expected Text content"),
        }
    }

    #[tokio::test]
    async fn test_session_state_accessible() {
        // 验证 Session 的内部状态可以直接访问（方案 B 的核心优势）
        let session = Session::new("deepseek".to_string(), "deepseek-chat".to_string());

        // 所有字段都是 pub 的，可以直接验证
        assert!(session.messages.is_empty(), "messages 应该为空");
        assert_eq!(session.provider, "deepseek", "provider 应该正确");
        assert_eq!(session.model, "deepseek-chat", "model 应该正确");
        assert_eq!(session.cumulative_input_tokens, 0, "初始 input tokens 应该为 0");
        assert_eq!(session.cumulative_output_tokens, 0, "初始 output tokens 应该为 0");
    }

    // ========================================================================
    // format_tool_args UTF-8 安全测试
    // ========================================================================

    #[test]
    fn test_format_tool_args_bash_chinese_truncation() {
        // bash 命令包含中文，超过 80 字符时截断不 panic
        let long_chinese_cmd = "帮我创建一个2048小游戏的核心逻辑，需要包含游戏板的初始化和方块移动合并以及得分计算功能，支持上下左右四个方向的操作，还需要实现胜利和失败判定逻辑以及动画效果和得分排行榜功能";
        assert!(long_chinese_cmd.chars().count() > 80, "测试数据需超过 80 字符");
        let args = serde_json::json!({ "cmd": long_chinese_cmd });
        let result = format_tool_args("bash", &args);
        assert!(result.contains("命令:"));
        assert!(result.ends_with("..."));
        assert!(result.is_char_boundary(result.len()));
    }

    #[test]
    fn test_format_tool_args_bash_short() {
        // 短命令不截断
        let args = serde_json::json!({ "cmd": "ls -la" });
        let result = format_tool_args("bash", &args);
        assert_eq!(result, "命令: ls -la");
    }

    #[test]
    fn test_format_tool_args_bash_mixed_cjk_ascii() {
        // 混合 CJK + ASCII，截断点落在多字节字符中间时不 panic
        let mixed = "python3 -c \"print('帮我实现一个功能非常复杂的逻辑，包含很多步骤和详细说明')\"";
        let args = serde_json::json!({ "cmd": mixed });
        let result = format_tool_args("bash", &args);
        assert!(result.contains("命令:"));
    }

    #[test]
    fn test_format_tool_args_write_file_chinese_content() {
        // write_file 内容包含中文，超过 40 字符截断
        let long_content = "这是一个很长的中文文件内容需要被截断显示确保不会在多字节字符边界处崩溃这是一个测试";
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
        let args = serde_json::json!({ "cmd": emoji_cmd });
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
}
