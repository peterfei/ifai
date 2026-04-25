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
use futures_util::stream::StreamExt;
use serde_json::json;
use ifainew_lib::harness::api::types::{StreamEvent, Message, MessageRole, MessageContent, ToolCall, ToolCallFunction};
use ifainew_lib::harness::tool::{ToolRegistry, ToolRouter};
use ifainew_lib::prompt_manager;
use crate::provider::resolve_provider;
use crate::render::{self, RESET, Spinner};
use crate::prompt_vars::collect_cli_variables;
use crate::permission::{self as approval, ToolCategory, RiskLevel};
use crate::token;  // 🔥 元编程：Token 状态栏
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
                if cmd.len() > 80 {
                    format!("命令: {}...", &cmd[..77])
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
            let preview = if content.len() > 40 {
                format!("{}... ({} 字符)", &content[..37], content.len())
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
            let preview = if edit.len() > 40 {
                format!("{}...", &edit[..37])
            } else {
                format!("{}", edit)
            };
            format!("编辑文件: {}\n变更: {}", path, preview)
        }
        _ => {
            // 通用格式化
            let json_str = serde_json::to_string_pretty(args).unwrap_or_default();
            if json_str.len() > 200 {
                format!("{}...", &json_str[..197])
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
    /// 🎨 Pipeline 跟踪器
    pipeline_tracker: PipelineTracker,
}

impl Session {
    pub fn new(provider: String, model: String) -> Self {
        let tool_registry = ToolRegistry::new();
        let tool_router = Arc::new(ToolRouter::new());

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
            pipeline_tracker: PipelineTracker::new(),
        }
    }

    /// 🔥 设置 API key（从 EffectiveConfig 读取）
    pub fn set_api_key(&mut self, api_key: String) {
        self.api_key = Some(api_key);
    }

    /// 🔥 设置 Base URL（从 EffectiveConfig 读取）
    pub fn set_base_url(&mut self, base_url: String) {
        self.base_url = Some(base_url);
    }

    /// 🔥 禁用工具调用（--no-tool 标志）
    pub fn disable_tools(&mut self) {
        self.tools_disabled = true;
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
        let system_prompt = build_cli_system_prompt(&spec);

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

        // 🎨 创建 Spinner 和定时器
        let mut spinner = Spinner::new("thinking");
        let mut interval = tokio::time::interval(Duration::from_millis(150));
        interval.tick().await;

        // 🔥 元编程：从配置获取最大续播次数（而非硬编码）
        let current_category = approval::ToolCategory::Safe;  // 初始为 safe，会动态调整
        let max_continuations = approval::max_iterations(current_category);
        let mut continuation_count = 0;
        let mut full_response = String::new();

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

            let theme = render::default_theme();
            let mut first_delta = true;
            let mut current_response = String::new();

            // EventCollector - 两阶段协议
            let mut collector = EventCollector::new();

            // 🔥 元编程：估算输入 tokens（复用 token::estimate_tokens）
            let estimated_input = token::estimate_tokens(&self.messages);

            // 🔥 元编程：创建流式状态追踪器
            let mut stream_status = token::StreamStatus::new(estimated_input);

            // 🎨 使用 tokio::select! 同时处理流和 spinner 动画
            loop {
                tokio::select! {
                    _ = interval.tick() => {
                        if first_delta {
                            let frame = spinner.tick();
                            print!("\r{}", frame);
                            io::stdout().flush().ok();
                        }
                    }
                    result = stream.next() => {
                        match result {
                            Some(Ok(event)) => {
                                match &event {
                                    StreamEvent::TextDelta { text } => {
                                        if first_delta {
                                            spinner.finish(true);
                                            print!("\r{}  \r", " ".repeat(30));
                                            first_delta = false;

                                            // 🔥 显示初始状态栏（响应开始时）
                                            println!("{}", stream_status.render(&self.model, &theme));
                                        }

                                        // 🔥 正常输出文本（不干扰状态栏）
                                        print!("{}", text);
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
                                        self.cumulative_input_tokens += input_tokens;
                                        self.cumulative_output_tokens += output_tokens;

                                        // 🔥 元编程：清除状态行并显示最终摘要
                                        print!("\r{}\r", " ".repeat(80));
                                        println!("{}", stream_status.render_summary(&self.model, *input_tokens, *output_tokens, &theme));

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
                break;
            }

            // Execute 阶段：执行工具
            println!(); // 换行
            let tool_results = self.execute_tools(collector.pending_tools())?;

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
                if let Some(step) = completed_steps.iter().find(|s| s.tool_name == *name) {
                    // 使用派生宏生成的方法渲染最终状态
                    let status_render = step.status.render_with_theme("zh", &theme, RESET);

                    // 格式化工具参数（截断过长的参数）
                    let args_preview = if step.tool_args.len() > 50 {
                        format!("{}...", &step.tool_args[..47])
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

        println!(); // 结束后换行
        Ok(full_response)
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

            // 🎬 元编程：显示进行中状态（带动画）
            let args_preview = if tool.args.len() > 50 {
                format!("{}...", &tool.args[..47])
            } else {
                tool.args.clone()
            };

            // 使用当前动画帧显示进行中状态
            let progress_frame = render::current_progress_frame();
            println!("\n{}{} {}({}{})  [进行中]{}",
                render::BOLD,
                render::color_256(69),  // brand color
                progress_frame,
                tool.name,
                args_preview,
                render::RESET
            );

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

                    // 🎬 元编程：循环检测（声明式 API）
                    let loop_status = approval::check_loop(&tool.name, &tool.args);
                    if loop_status.should_stop() {
                        if let loop_detector::LoopDetectionStatus::Blocked { reason } = loop_status {
                            eprintln!("\n{}⚠️  循环检测: {}{}",
                                theme.warning, reason, render::RESET);
                            // 跳出工具循环
                            break;
                        }
                    } else if loop_status.should_warn() {
                        if let loop_detector::LoopDetectionStatus::Warning { count, pattern } = loop_status {
                            eprintln!("\n{}⚠️  警告: {} ({} 次){}",
                                theme.warning, pattern, count, render::RESET);
                        }
                    }

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
}
