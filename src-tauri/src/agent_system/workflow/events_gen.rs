//! Agent 协作事件生成代码
//!
//! 由 build.rs 从 schemas/events.yaml 自动生成。
//! 包含：
//! - `CollabEvent` 枚举（serde tag + content）
//! - `emit_collab_event!` 宏（发射事件到 Tauri 前端）
//! - `test_factories` 模块（测试数据工厂）

include!(concat!(env!("OUT_DIR"), "/events_gen.rs"));

#[cfg(test)]
mod tests {
    use super::test_factories::*;
    use super::CollabEvent;

    // ── 工厂函数测试 ──────────────────────────────────────────

    #[test]
    fn test_factory_spawn_begin() {
        let event = make_agent_spawn_begin(
            "agent-1".into(),
            "Refactor".into(),
            "重构代码".into(),
        );
        match event {
            CollabEvent::AgentSpawnBegin { agent_id, agent_type, task } => {
                assert_eq!(agent_id, "agent-1");
                assert_eq!(agent_type, "Refactor");
                assert_eq!(task, "重构代码");
            }
            _ => panic!("Expected AgentSpawnBegin"),
        }
    }

    #[test]
    fn test_factory_spawn_end() {
        let event = make_agent_spawn_end("agent-1".into(), "completed".into(), 1234);
        match event {
            CollabEvent::AgentSpawnEnd { agent_id, result, duration_ms } => {
                assert_eq!(agent_id, "agent-1");
                assert_eq!(result, "completed");
                assert_eq!(duration_ms, 1234);
            }
            _ => panic!("Expected AgentSpawnEnd"),
        }
    }

    #[test]
    fn test_factory_agent_close() {
        let event = make_agent_close("agent-1".into());
        match event {
            CollabEvent::AgentClose { agent_id } => {
                assert_eq!(agent_id, "agent-1");
            }
            _ => panic!("Expected AgentClose"),
        }
    }

    #[test]
    fn test_factory_agent_resume() {
        let event = make_agent_resume("agent-1".into(), "testing".into());
        match event {
            CollabEvent::AgentResume { agent_id, phase } => {
                assert_eq!(agent_id, "agent-1");
                assert_eq!(phase, "testing");
            }
            _ => panic!("Expected AgentResume"),
        }
    }

    #[test]
    fn test_factory_interaction_begin() {
        let event = make_interaction_begin(
            "agent-1".into(),
            "选择操作".into(),
            vec!["继续".into(), "取消".into()],
        );
        match event {
            CollabEvent::InteractionBegin { agent_id, question, options } => {
                assert_eq!(agent_id, "agent-1");
                assert_eq!(question, "选择操作");
                assert_eq!(options, vec!["继续", "取消"]);
            }
            _ => panic!("Expected InteractionBegin"),
        }
    }

    #[test]
    fn test_factory_interaction_end() {
        let event = make_interaction_end("agent-1".into(), "继续执行".into());
        match event {
            CollabEvent::InteractionEnd { agent_id, response } => {
                assert_eq!(agent_id, "agent-1");
                assert_eq!(response, "继续执行");
            }
            _ => panic!("Expected InteractionEnd"),
        }
    }

    #[test]
    fn test_factory_approval_waiting() {
        let files = vec!["src/main.rs".into(), "src/lib.rs".into()];
        let event = make_approval_waiting("agent-1".into(), "审批代码".into(), files);
        match event {
            CollabEvent::ApprovalWaiting { agent_id, title, files } => {
                assert_eq!(agent_id, "agent-1");
                assert_eq!(title, "审批代码");
                assert_eq!(files.len(), 2);
            }
            _ => panic!("Expected ApprovalWaiting"),
        }
    }

    #[test]
    fn test_factory_progress_update() {
        let event = make_progress_update("agent-1".into(), 75, "正在编译...".into());
        match event {
            CollabEvent::ProgressUpdate { agent_id, progress, message } => {
                assert_eq!(agent_id, "agent-1");
                assert_eq!(progress, 75);
                assert_eq!(message, "正在编译...");
            }
            _ => panic!("Expected ProgressUpdate"),
        }
    }

    // ── Serde 序列化/反序列化测试 ─────────────────────────────

    #[test]
    fn test_serialize_spawn_begin() {
        let event = make_agent_spawn_begin(
            "agent-1".into(),
            "Refactor".into(),
            "重构代码".into(),
        );
        let json = serde_json::to_value(&event).unwrap();

        // 验证 tag
        assert_eq!(json["type"], "agent:spawn:begin");
        // 验证 data
        assert_eq!(json["data"]["agent_id"], "agent-1");
        assert_eq!(json["data"]["agent_type"], "Refactor");
        assert_eq!(json["data"]["task"], "重构代码");
    }

    #[test]
    fn test_serialize_spawn_end() {
        let event = make_agent_spawn_end("agent-1".into(), "completed".into(), 5678);
        let json = serde_json::to_value(&event).unwrap();

        assert_eq!(json["type"], "agent:spawn:end");
        assert_eq!(json["data"]["agent_id"], "agent-1");
        assert_eq!(json["data"]["result"], "completed");
        assert_eq!(json["data"]["duration_ms"], 5678);
    }

    #[test]
    fn test_serialize_agent_close() {
        let event = make_agent_close("agent-1".into());
        let json = serde_json::to_value(&event).unwrap();

        assert_eq!(json["type"], "agent:close");
        assert_eq!(json["data"]["agent_id"], "agent-1");
    }

    #[test]
    fn test_serialize_agent_resume() {
        let event = make_agent_resume("agent-1".into(), "testing".into());
        let json = serde_json::to_value(&event).unwrap();

        assert_eq!(json["type"], "agent:resume");
        assert_eq!(json["data"]["agent_id"], "agent-1");
        assert_eq!(json["data"]["phase"], "testing");
    }

    #[test]
    fn test_serialize_interaction_begin() {
        let options = vec!["继续".into(), "取消".into()];
        let event = make_interaction_begin("agent-1".into(), "选择操作".into(), options);
        let json = serde_json::to_value(&event).unwrap();

        assert_eq!(json["type"], "agent:interaction:begin");
        assert_eq!(json["data"]["question"], "选择操作");
        assert_eq!(json["data"]["options"][0], "继续");
        assert_eq!(json["data"]["options"][1], "取消");
    }

    #[test]
    fn test_serialize_approval_waiting() {
        let files = vec!["src/main.rs".into()];
        let event = make_approval_waiting("agent-1".into(), "审批".into(), files);
        let json = serde_json::to_value(&event).unwrap();

        assert_eq!(json["type"], "agent:waiting:approval");
        assert_eq!(json["data"]["title"], "审批");
        assert_eq!(json["data"]["files"][0], "src/main.rs");
    }

    #[test]
    fn test_serialize_progress_update() {
        let event = make_progress_update("agent-1".into(), 50, "进行中".into());
        let json = serde_json::to_value(&event).unwrap();

        assert_eq!(json["type"], "workflow:progress");
        assert_eq!(json["data"]["progress"], 50);
        assert_eq!(json["data"]["message"], "进行中");
    }

    #[test]
    fn test_deserialize_roundtrip() {
        let original = make_agent_spawn_begin(
            "agent-1".into(),
            "Refactor".into(),
            "重构代码".into(),
        );
        let json = serde_json::to_value(&original).unwrap();
        let deserialized: CollabEvent = serde_json::from_value(json).unwrap();

        match deserialized {
            CollabEvent::AgentSpawnBegin { agent_id, agent_type, task } => {
                assert_eq!(agent_id, "agent-1");
                assert_eq!(agent_type, "Refactor");
                assert_eq!(task, "重构代码");
            }
            _ => panic!("Expected AgentSpawnBegin after roundtrip"),
        }
    }

    #[test]
    fn test_deserialize_all_variants() {
        let variants: Vec<CollabEvent> = vec![
            make_agent_spawn_begin("a".into(), "R".into(), "t".into()),
            make_agent_spawn_end("a".into(), "ok".into(), 0),
            make_agent_close("a".into()),
            make_agent_resume("a".into(), "p".into()),
            make_interaction_begin("a".into(), "q".into(), vec![]),
            make_interaction_end("a".into(), "r".into()),
            make_approval_waiting("a".into(), "title".into(), vec![]),
            make_progress_update("a".into(), 100, "done".into()),
        ];

        for original in variants {
            let json = serde_json::to_value(&original).unwrap();
            let deserialized: CollabEvent = serde_json::from_value(json).unwrap();
            // 验证 type 字段存在
            assert!(serde_json::to_value(&deserialized).unwrap().get("type").is_some());
        }
    }

    // ── 宏测试（验证 JSON 结构，不依赖 Tauri） ────────────────

    #[test]
    fn test_emit_macro_json_structure() {
        let event = make_agent_spawn_begin("a1".into(), "RF".into(), "task".into());
        // 验证 emit_collab_event 宏生成的 JSON 结构
        let json = serde_json::to_value(&event).unwrap();
        let event_type = json["type"].as_str().unwrap().to_string();
        let data = json["data"].clone();

        // 模拟宏的行为：type 作为事件名，data 作为负载
        assert_eq!(event_type, "agent:spawn:begin");
        assert_eq!(data["agent_id"], "a1");
        assert_eq!(data["agent_type"], "RF");
        assert_eq!(data["task"], "task");
    }
}
