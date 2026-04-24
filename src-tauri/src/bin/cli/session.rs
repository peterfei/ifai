//! Session & Event Collector — 两阶段工具调用协议
//!
//! 🏛️ 元编程：消除 `_ => {}` 静默忽略，显式事件路由
//!
//! 两阶段协议：
//! 1. **Collect 阶段**：累积 ToolStart 和 TextDelta 事件
//! 2. **Execute 阶段**：执行工具并发送结果回模型
//!
//! ToolDone 事件不再用于参数解析，参数仅来自 ToolStart.input

use ifainew_lib::harness::api::types::StreamEvent;

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

impl PendingToolCall {
    fn from_event(event: &StreamEvent) -> Option<Self> {
        match event {
            StreamEvent::ToolStart { tool_id, name, input } => {
                Some(PendingToolCall {
                    tool_id: tool_id.clone(),
                    name: name.clone(),
                    args: input.clone(),
                })
            }
            _ => None,
        }
    }
}

// ============================================================================
// Event Collector (Two-Phase Protocol)
// ============================================================================

/// 🏛️ 元编程：EventCollector — 两阶段工具调用协议
///
/// **Collect 阶段**：
/// - 累积 ToolStart 事件 → PendingToolCall
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
            response_text: String::new(),
            done: false,
        }
    }

    /// 🏛️ 元编程：Dispatch 事件 — 显式处理每个已知事件
    ///
    /// **消除 `_ => {}`**：每个事件变体都有明确的处理逻辑
    pub fn dispatch(&mut self, event: &StreamEvent) {
        match &event {
            // Collect 阶段：累积文本和工具调用
            StreamEvent::TextDelta { text } => {
                self.response_text.push_str(text);
            }
            StreamEvent::ToolStart { .. } => {
                if let Some(tool) = PendingToolCall::from_event(event) {
                    self.pending_tools.push(tool);
                }
            }

            // 已知事件：显式忽略（不使用 `_ => {}`）
            StreamEvent::MessageStart { .. } => {
                // 消息开始 - 无需处理
            }
            StreamEvent::ToolDone { .. } => {
                // ToolDone 不再用于参数解析 - 参数来自 ToolStart.input
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

/// 会话状态（占位符，完整实现在 main.rs 整合时）
#[derive(Debug)]
pub struct Session {
    pub messages: Vec<String>,
    pub provider: String,
    pub model: String,
}

impl Session {
    pub fn new(provider: String, model: String) -> Self {
        Self {
            messages: Vec::new(),
            provider,
            model,
        }
    }

    pub fn add_message(&mut self, msg: String) {
        self.messages.push(msg);
    }

    pub fn clear_history(&mut self) {
        self.messages.clear();
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
        collector.dispatch(&StreamEvent::ToolStart {
            tool_id: "call_1".to_string(),
            name: "bash".to_string(),
            input: r#"{"command":"ls"}"#.to_string(),
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
        collector.dispatch(&StreamEvent::ToolStart {
            tool_id: "call_1".to_string(),
            name: "bash".to_string(),
            input: r#"{"command":"ls"}"#.to_string(),
        });
        collector.dispatch(&StreamEvent::ToolStart {
            tool_id: "call_2".to_string(),
            name: "TodoWrite".to_string(),
            input: r#"{"todos":[{"content":"test"}]}"#.to_string(),
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
            input: r#"{"command":"pwd"}"#.to_string(),
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
    fn test_tool_start_creates_pending_tool() {
        let event = StreamEvent::ToolStart {
            tool_id: "test_id".to_string(),
            name: "test_tool".to_string(),
            input: "test_args".to_string(),
        };

        let pending = PendingToolCall::from_event(&event);
        assert!(pending.is_some());

        let tool = pending.unwrap();
        assert_eq!(tool.tool_id, "test_id");
        assert_eq!(tool.name, "test_tool");
        assert_eq!(tool.args, "test_args");
    }

    #[test]
    fn test_non_tool_event_returns_none() {
        let event = StreamEvent::TextDelta {
            text: "test".to_string(),
        };

        let pending = PendingToolCall::from_event(&event);
        assert!(pending.is_none());
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
            input: "{}".to_string(),
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
        assert_eq!(session.messages[0], "Hello");
        assert_eq!(session.messages[1], "World");
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

        // ToolStart - 累积工具
        collector.dispatch(&StreamEvent::ToolStart {
            tool_id: "call_1".to_string(),
            name: "test".to_string(),
            input: "{}".to_string(),
        });

        // ToolDone - 显式忽略
        collector.dispatch(&StreamEvent::ToolDone {
            tool_id: "call_1".to_string(),
            result: "ok".to_string(),
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
        assert!(collector.is_done());
    }
}
