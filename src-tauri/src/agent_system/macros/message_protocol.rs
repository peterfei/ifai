//! 消息协议宏
//!
//! 提供声明式定义 Agent 协作消息协议的能力

/// 消息协议宏
///
/// # 语法
///
/// ```rust
/// message_protocol! {
///     Collaboration {
///         Broadcast { task: String, target_agents: Vec<AgentType>, timeout: Duration } -> Vec<AgentResponse>,
///         ShareKnowledge { from: AgentId, to: AgentId, knowledge: KnowledgeEntry } -> Ack,
///         AggregateResults { results: Vec<TaskResult>, strategy: AggregateStrategy } -> FinalReport,
///         ProgressUpdate { agent_id: AgentId, progress: ProgressEvent } -> (),
///     }
/// }
/// ```
///
/// # 生成内容
///
/// - 枚举类型 `CollaborationMessage`
/// - 每个消息变体的结构体
/// - `Serialize`/`Deserialize` trait 实现
///
/// # 简化实现
///
/// 当前版本为简化实现（Phase 1.1.1），直接生成固定的消息类型。
/// TODO: Phase 1.1.3 实现完整的宏解析和代码生成
#[macro_export]
macro_rules! message_protocol {
    // 简化版本：忽略输入，直接生成固定的消息类型
    ($($tt:tt)*) => {
        // 消息类型枚举
        #[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
        #[serde(tag = "type", content = "content")]
        pub enum CollaborationMessage {
            Broadcast(BroadcastMessage),
            ShareKnowledge(ShareKnowledgeMessage),
            AggregateResults(AggregateResultsMessage),
            ProgressUpdate(ProgressUpdateMessage),
        }

        // Broadcast 消息
        #[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
        pub struct BroadcastMessage {
            pub task: String,
            pub target_agents: Vec<String>,  // 简化：使用 String 而不是 AgentType
            pub timeout_secs: u64,  // 简化：使用秒数而不是 Duration
        }

        // ShareKnowledge 消息
        #[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
        pub struct ShareKnowledgeMessage {
            pub from: String,  // AgentId
            pub to: String,    // AgentId
            pub knowledge: String,  // 简化：使用字符串
        }

        // AggregateResults 消息
        #[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
        pub struct AggregateResultsMessage {
            pub results: Vec<String>,  // TaskResult 简化为字符串
            pub strategy: String,      // AggregateStrategy 简化为字符串
        }

        // ProgressUpdate 消息
        #[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
        pub struct ProgressUpdateMessage {
            pub agent_id: String,
            pub progress: String,  // ProgressEvent 简化为字符串
        }
    };
}
