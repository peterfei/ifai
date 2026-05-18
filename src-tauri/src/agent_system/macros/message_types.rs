//! 协作消息类型定义
//!
//! 本模块通过 `message_protocol!` 宏生成消息类型

// 调用宏生成消息类型
crate::message_protocol! {
    Collaboration {
        Broadcast { task: String, target_agents: Vec<String>, timeout: u64 },
        ShareKnowledge { from: String, to: String, knowledge: String },
        AggregateResults { results: Vec<String>, strategy: String },
        ProgressUpdate { agent_id: String, progress: String },
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    /// 测试 1: 验证宏能生成基本的枚举类型
    #[test]
    fn test_macro_generates_enum() {
        // 验证宏能生成 CollaborationMessage 枚举
        // 包含 Broadcast, ShareKnowledge, AggregateResults, ProgressUpdate 变体
        let broadcast = BroadcastMessage {
            task: "测试任务".to_string(),
            target_agents: vec!["Explore".to_string(), "Review".to_string()],
            timeout_secs: 60,
        };

        let msg = CollaborationMessage::Broadcast(broadcast);
        assert!(matches!(msg, CollaborationMessage::Broadcast(_)));
    }

    /// 测试 2: 验证消息可以序列化为 JSON
    #[test]
    fn test_message_serialization() {
        // 验证生成的消息类型实现了 Serialize
        let broadcast = BroadcastMessage {
            task: "测试任务".to_string(),
            target_agents: vec!["Explore".to_string()],
            timeout_secs: 30,
        };

        let json_str = serde_json::to_string(&broadcast);
        assert!(json_str.is_ok(), "消息应该可以序列化为 JSON");

        let json = json_str.unwrap();
        assert!(json.contains("\"task\":\"测试任务\""));
    }

    /// 测试 3: 验证消息可以从 JSON 反序列化
    #[test]
    fn test_message_deserialization() {
        // 验证生成的消息类型实现了 Deserialize
        let json_str = r#"{"task":"测试","target_agents":["Explore"],"timeout_secs":30}"#;

        let broadcast: BroadcastMessage = serde_json::from_str(json_str).unwrap();
        assert_eq!(broadcast.task, "测试");
        assert_eq!(broadcast.target_agents.len(), 1);
    }

    /// 测试 4: 验证 Broadcast 消息包含正确字段
    #[test]
    fn test_broadcast_message_fields() {
        // 验证 Broadcast 消息包含正确的字段
        let broadcast = BroadcastMessage {
            task: "审查代码".to_string(),
            target_agents: vec!["Review".to_string(), "Test".to_string()],
            timeout_secs: 120,
        };

        assert_eq!(broadcast.task, "审查代码");
        assert_eq!(broadcast.target_agents.len(), 2);
        assert_eq!(broadcast.timeout_secs, 120);
    }

    /// 测试 5: 验证 ShareKnowledge 消息包含正确字段
    #[test]
    fn test_share_knowledge_message_fields() {
        // 验证 ShareKnowledge 消息包含正确的字段
        let knowledge = ShareKnowledgeMessage {
            from: "Agent1".to_string(),
            to: "Agent2".to_string(),
            knowledge: "代码分析结果".to_string(),
        };

        assert_eq!(knowledge.from, "Agent1");
        assert_eq!(knowledge.to, "Agent2");
        assert_eq!(knowledge.knowledge, "代码分析结果");
    }

    /// 测试 6: 验证 AggregateResults 消息包含正确字段
    #[test]
    fn test_aggregate_results_message_fields() {
        // 验证 AggregateResults 消息包含正确的字段
        let aggregate = AggregateResultsMessage {
            results: vec!["结果1".to_string(), "结果2".to_string()],
            strategy: "merge".to_string(),
        };

        assert_eq!(aggregate.results.len(), 2);
        assert_eq!(aggregate.strategy, "merge");
    }

    /// 测试 7: 验证 ProgressUpdate 消息字段
    #[test]
    fn test_progress_update_fields() {
        // 验证 ProgressUpdate 消息包含正确的字段
        let progress = ProgressUpdateMessage {
            agent_id: "ExploreAgent".to_string(),
            progress: "50% 完成".to_string(),
        };

        assert_eq!(progress.agent_id, "ExploreAgent");
        assert_eq!(progress.progress, "50% 完成");
    }

    /// 测试 8: 验证 CollaborationMessage 枚举的序列化
    #[test]
    fn test_collaboration_message_enum_serialization() {
        // 验证带 tag 的枚举可以正确序列化
        let broadcast = BroadcastMessage {
            task: "测试".to_string(),
            target_agents: vec![],
            timeout_secs: 10,
        };

        let msg = CollaborationMessage::Broadcast(broadcast);
        let json_str = serde_json::to_string(&msg).unwrap();

        // 应该包含 type 和 content 字段（serde tag 表示）
        assert!(json_str.contains("\"type\":\"Broadcast\""));
        assert!(json_str.contains("\"content\":"));
    }
}
