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
use std::time::Duration;
use std::collections::HashMap;
use std::sync::Arc;
use futures_util::stream::StreamExt;
use serde_json::json;
use ifainew_lib::harness::api::types::{StreamEvent, Message, MessageRole, MessageContent, ToolCall, ToolCallFunction};
use ifainew_lib::harness::tool::{ToolRegistry, ToolRouter};
use crate::provider::resolve_provider;
use crate::render::{self, RESET, Spinner};
use crate::prompts::build_system_prompt;
use crate::permission::{self as approval, ToolCategory, RiskLevel};

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

/// 会话状态
pub struct Session {
    pub messages: Vec<Message>,
    pub provider: String,
    pub model: String,
    pub tool_registry: ToolRegistry,
    pub tool_router: Arc<ToolRouter>,
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
        }
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

        // 构建系统提示词
        let system_prompt = build_system_prompt(&spec);

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

        // 创建 provider 配置
        let provider_config = ifainew_lib::harness::api::ProviderConfig {
            api_key: std::env::var(env_key)
                .unwrap_or_else(|_| {
                    let fallback_key = format!("{}_API_KEY",
                        spec.metadata.name.to_uppercase().replace(" ", "_").replace("-", "_"));
                    std::env::var(&fallback_key).unwrap_or_else(|_| "".to_string())
                }),
            base_url: None,
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
                tools: if tools.is_empty() { None } else { Some(tools.clone()) },
            };

            // 发送流式请求
            let mut stream = client.stream(request).await
                .map_err(|e| format!("Failed to start stream: {:?}", e))?;

            let theme = render::default_theme();
            let mut first_delta = true;
            let mut current_response = String::new();

            // EventCollector - 两阶段协议
            let mut collector = EventCollector::new();

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
                                        }
                                        print!("{}", text);
                                        io::stdout().flush().map_err(|e| format!("Failed to flush stdout: {}", e))?;
                                        current_response.push_str(text);
                                        full_response.push_str(text);
                                        collector.dispatch(&event);
                                    }
                                    StreamEvent::ToolStart { tool_id, name, input } => {
                                        if first_delta {
                                            spinner.finish(true);
                                            print!("\r{}  \r", " ".repeat(30));
                                            first_delta = false;
                                        }
                                        // 渲染工具开始
                                        println!("\n{}", render::render_tool_start(name, input, &theme));
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
            let tool_calls_value: Vec<ToolCall> = tool_results.iter().map(|(id, name, _)| {
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
            for (tool_id, _name, result) in &tool_results {
                self.messages.push(Message {
                    role: MessageRole::Tool,
                    content: MessageContent::Text(result.clone()),
                    tool_calls: None,
                    tool_call_id: Some(tool_id.clone()),
                });
            }

            // 渲染工具结果
            for (tool_id, name, result) in &tool_results {
                let success = !result.contains("Error") && !result.contains("error");
                println!("{}", render::render_tool_result(name, result, success, &theme));
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
    fn execute_tools(&self, tools: &[PendingToolCall]) -> Result<Vec<(String, String, String)>, String> {
        let mut results = Vec::new();

        for tool in tools {
            // 🔥 元编程：使用配置驱动的权限判断
            let category = approval::categorize_tool(&tool.name);
            let risk = approval::calculate_risk(&tool.name, &serde_json::from_str::<serde_json::Value>(&tool.args).unwrap_or(serde_json::json!({})));
            let auto_approve = approval::should_auto_approve(&tool.name, false);  // CLI 中无沙箱

            // 🔥 DEBUG: 输出权限检查信息
            eprintln!("[DEBUG] Tool: {}, Category: {:?}, AutoApprove: {}", tool.name, category, auto_approve);

            if !auto_approve {
                // 🔥 在 CLI 中，所有需要审批的工具都需要用户确认（Safe 除外）
                if !matches!(category, approval::ToolCategory::Safe) {
                    println!("\nWarning: Tool '{}' requires confirmation.", tool.name);
                    print!("Execute? (y/n): ");
                    io::stdout().flush().map_err(|e| format!("Failed to flush stdout: {}", e))?;

                    // 简单的用户输入（生产环境应使用更健壮的方法）
                    let mut input = String::new();
                    io::stdin().read_line(&mut input).map_err(|e| format!("Failed to read input: {}", e))?;

                    if input.trim() != "y" && input.trim() != "Y" {
                        let error_msg = format!("Tool '{}' execution denied by user", tool.name);
                        results.push((tool.tool_id.clone(), tool.name.clone(), error_msg));
                        continue;
                    }
                }
            }

            let args_json: serde_json::Value = serde_json::from_str(&tool.args)
                .map_err(|e| format!("Failed to parse tool args: {}", e))?;

            match self.tool_router.execute(&tool.name, &args_json) {
                Ok(result) => {
                    results.push((tool.tool_id.clone(), tool.name.clone(), result));
                }
                Err(e) => {
                    let error_msg = format!("Error: {:?}", e);
                    results.push((tool.tool_id.clone(), tool.name.clone(), error_msg));
                }
            }
        }

        Ok(results)
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

        collector.dispatch(&StreamEvent::MessageDone { tokens_used: 100 });
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
        collector.dispatch(&StreamEvent::MessageDone { tokens_used: 100 });

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
