/*!
Intelligence Router - Smart Local/Cloud Routing
================================================

智能路由模块，决定使用本地模型还是云端 API。

功能：
- 任务复杂度判断
- 本地模型工具调用解析
- 本地/云端路由决策
- 自动降级处理
*/

use crate::core_traits::ai::Message;
use std::sync::Arc;
use tokio::sync::Mutex;

// ============================================================================
// Configuration
// ============================================================================

/// 路由决策结果
#[derive(Debug, Clone)]
pub enum RouteDecision {
    /// 使用本地模型
    Local {
        reason: String,
    },
    /// 使用云端 API
    Cloud {
        reason: String,
    },
    /// 混合模式：本地解析工具，云端生成内容
    Hybrid {
        reason: String,
    },
}

/// 任务复杂度评估
#[derive(Debug, Clone, PartialEq)]
pub enum TaskComplexity {
    /// 简单任务 - 本地模型可以处理
    Simple,
    /// 中等任务 - 需要云端 API
    Medium,
    /// 复杂任务 - 必须使用云端 API
    Complex,
}

// ============================================================================
// Intelligence Router
// ============================================================================

pub struct IntelligenceRouter {
    /// 本地模型是否启用
    local_enabled: Arc<Mutex<bool>>,
    /// 本地模型是否已下载
    local_available: Arc<Mutex<bool>>,
}

impl IntelligenceRouter {
    pub fn new() -> Self {
        Self {
            local_enabled: Arc::new(Mutex::new(false)),
            local_available: Arc::new(Mutex::new(false)),
        }
    }

    /// 设置本地模型启用状态
    pub async fn set_local_enabled(&self, enabled: bool) {
        let mut state = self.local_enabled.lock().await;
        *state = enabled;
    }

    /// 设置本地模型可用状态
    pub async fn set_local_available(&self, available: bool) {
        let mut state = self.local_available.lock().await;
        *state = available;
    }

    /// 判断任务复杂度
    pub fn assess_complexity(&self, messages: &[Message]) -> TaskComplexity {
        // 获取最后一条用户消息
        let user_message = messages
            .iter()
            .filter(|m| m.role == "user")
            .last();

        let text = match user_message {
            Some(msg) => extract_text_content(&msg.content),
            None => return TaskComplexity::Complex,
        };

        // 计算消息数量（简单的会话长度指标）
        let conversation_length = messages.len();

        // 计算token数量估算（中文约1.5字符/token，英文约4字符/token）
        let total_chars: usize = messages
            .iter()
            .map(|m| extract_text_content(&m.content).len())
            .sum();
        let estimated_tokens = total_chars / 3; // 粗略估算

        // 判断复杂度
        let is_simple_query = self.is_simple_query(&text);
        let is_tool_request = self.is_tool_request(&text);
        let requires_ai_tool = self.requires_ai_tool_call(&text); // 🆕 P2: 需要 AI 工具调用
        let is_long_context = estimated_tokens > 4000 || conversation_length > 20;

        // 打印调试信息
        println!("[Router] text='{}', is_tool_request={}, requires_ai_tool={}, is_long_context={}, tokens={}, msg_len={}",
                 text.chars().take(1024).collect::<String>(), is_tool_request, requires_ai_tool, is_long_context, estimated_tokens, conversation_length);

        match (is_tool_request, is_simple_query, is_long_context, requires_ai_tool) {
            // 🆕 P2: 需要 AI 工具调用的任务（TodoWrite 等）必须路由到云端
            (_, _, _, true) => {
                TaskComplexity::Complex // 强制使用云端 API
            }
            // 工具调用优先 - 即使上下文较长也优先使用本地
            (true, false, _, _) | (true, true, false, _) => {
                // 工具调用请求（文件操作类）
                if estimated_tokens < 2000 {
                    TaskComplexity::Simple
                } else {
                    TaskComplexity::Medium
                }
            }
            (_, _, true, _) => {
                // 长上下文但没有工具请求
                TaskComplexity::Complex
            }
            (false, true, false, _) => {
                // 简单问答且上下文不长
                TaskComplexity::Simple
            }
            (false, false, false, _) => {
                // 其他情况
                if estimated_tokens < 1000 {
                    TaskComplexity::Simple
                } else {
                    TaskComplexity::Medium
                }
            }
        }
    }

    /// 路由决策
    pub async fn decide_route(&self, messages: &[Message]) -> RouteDecision {
        let local_enabled = *self.local_enabled.lock().await;
        let local_available = *self.local_available.lock().await;

        // 如果本地模型未启用或不可用，直接使用云端
        if !local_enabled || !local_available {
            return RouteDecision::Cloud {
                reason: "本地模型未启用或不可用".to_string(),
            };
        }

        // 评估任务复杂度
        let complexity = self.assess_complexity(messages);

        match complexity {
            TaskComplexity::Simple => {
                // 简单任务优先使用本地模型
                RouteDecision::Local {
                    reason: "简单任务，本地模型处理".to_string(),
                }
            }
            TaskComplexity::Medium => {
                // 中等任务：混合模式
                RouteDecision::Hybrid {
                    reason: "中等任务，本地解析工具调用".to_string(),
                }
            }
            TaskComplexity::Complex => {
                // 复杂任务使用云端 API
                RouteDecision::Cloud {
                    reason: "复杂任务，需要云端 API".to_string(),
                }
            }
        }
    }

    /// 判断是否是简单查询
    fn is_simple_query(&self, text: &str) -> bool {
        let text_lower = text.to_lowercase();

        // 简单查询特征
        let simple_keywords = [
            "是什么", "怎么用", "如何", "什么意思",
            "what is", "how to", "how do", "explain",
            "定义", "解释", "说明",
        ];

        // 短查询（< 100字符）
        let is_short = text.len() < 100;

        // 包含简单关键词
        let has_simple_keyword = simple_keywords.iter().any(|kw| text_lower.contains(kw));

        is_short && has_simple_keyword
    }

    /// 🆕 P2: 判断是否需要 AI 工具调用（TodoWrite 等）
    /// 这些任务必须路由到云端，因为本地模型不支持工具调用
    fn requires_ai_tool_call(&self, text: &str) -> bool {
        let text_lower = text.to_lowercase();

        // TodoWrite 相关关键词
        let todowrite_keywords = [
            "任务列表", "todo list", "todolist", "to-do",
            "创建任务", "添加任务", "新建任务",
            "任务清单", "checklist", "check list",
            "行动计划", "action items", "action plan",
        ];

        // 检测是否需要 AI 工具调用
        todowrite_keywords.iter().any(|kw| text_lower.contains(kw))
    }

    /// 判断是否是工具调用请求（文件操作类）
    fn is_tool_request(&self, text: &str) -> bool {
        let text_lower = text.to_lowercase();

        // 检查命令格式：/explore, /read, /scan 等
        if text.starts_with('/') {
            return true;
        }

        // 检查明确的工具调用关键词（文件操作类）
        let tool_keywords = [
            // 文件操作
            "读取文件", "写入文件", "创建文件", "删除文件", "搜索", "查找",
            "read file", "write file", "create file", "delete file", "search", "find",
            "打开", "关闭", "列出", "显示",
            "open", "close", "list", "show",
            "explore", "scan", "查看", "目录",
            "folder", "dir", "ls",
            // 🔥 命令执行相关（v0.5.0 新增）
            "执行", "运行", "命令", "command", "bash", "shell",
            "execute", "run", "terminal",
            "git", "npm", "yarn", "pnpm", "pip", "cargo",
        ];

        tool_keywords.iter().any(|kw| text_lower.contains(kw))
    }

    /// 🏆 v0.5.0: 判断是否是调试请求
    pub fn is_debug_request(&self, text: &str) -> bool {
        let text_lower = text.to_lowercase();

        // 明确的调试关键词
        let debug_keywords = ["修复", "报错", "错误", "bug", "fix", "error", "panic"];

        // 物理报错特征 (E0XXX, TSXXXX, Traceback)
        let has_error_code = text.contains("error[E") || text.contains("error TS") || text.contains("Traceback");

        let has_keyword = debug_keywords.iter().any(|kw| text_lower.contains(kw));

        has_error_code || (has_keyword && text.len() > 20)
    }
}

impl Default for IntelligenceRouter {
    fn default() -> Self {
        Self::new()
    }
}

// ============================================================================
// Helper Functions
// ============================================================================

/// 从消息内容中提取文本
pub fn extract_text_content(content: &crate::core_traits::ai::Content) -> String {
    match content {
        crate::core_traits::ai::Content::Text(text) => text.clone(),
        crate::core_traits::ai::Content::Parts(parts) => {
            parts
                .iter()
                .filter_map(|p| {
                    if let crate::core_traits::ai::ContentPart::Text { text, .. } = p {
                        Some(text.clone())
                    } else {
                        None
                    }
                })
                .collect::<Vec<_>>()
                .join("\n")
        }
    }
}

// ============================================================================
// Tests
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;
    use crate::core_traits::ai::{Message, Content};

    #[test]
    fn test_assess_simple_query() {
        let router = IntelligenceRouter::new();
        let messages = vec![Message {
            role: "user".to_string(),
            content: Content::Text("什么是 React?".to_string()),
            tool_calls: None,
            tool_call_id: None,
        }];

        let complexity = router.assess_complexity(&messages);
        assert_eq!(complexity, TaskComplexity::Simple);
    }

    #[test]
    fn test_assess_tool_request() {
        let router = IntelligenceRouter::new();
        let messages = vec![Message {
            role: "user".to_string(),
            content: Content::Text("读取 auth.ts 文件".to_string()),
            tool_calls: None,
            tool_call_id: None,
        }];

        let complexity = router.assess_complexity(&messages);
        assert_eq!(complexity, TaskComplexity::Simple);
    }

    #[test]
    fn test_assess_long_context() {
        let router = IntelligenceRouter::new();
        let mut messages = vec![];

        // 创建 25 条消息
        for i in 0..25 {
            messages.push(Message {
                role: if i % 2 == 0 { "user" } else { "assistant" }.to_string(),
                content: Content::Text("Message content ".repeat(10)),
                tool_calls: None,
                tool_call_id: None,
            });
        }

        let complexity = router.assess_complexity(&messages);
        assert_eq!(complexity, TaskComplexity::Complex);
    }

    #[test]
    fn test_extract_text_content() {
        let content = Content::Text("Hello world".to_string());
        let text = extract_text_content(&content);
        assert_eq!(text, "Hello world");
    }
}
