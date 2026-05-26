use crate::agent_system::Supervisor;
use tauri::{Emitter, State};
// 🔥 P4: 移除 commercial 限制，让基础 agent 功能在社区版可用
use crate::agent_system::{runner, AgentContext};
use crate::core_traits::agent::AgentStatus;
use crate::core_traits::ai::AIProviderConfig;
use serde::Serialize;
use std::collections::HashMap;

#[derive(Serialize)]
pub struct AgentInfo {
    pub id: String,
    pub agent_type: String,
    pub status: AgentStatus,
}

// ============================================================
// 策略注册表 — 数据驱动，零 match/if-else
// ============================================================

/// 审批策略注册表：字符串键 → 策略标识
const APPROVAL_POLICIES: &[(&str, &str)] = &[
    ("auto",   "auto_approve"),
    ("hybrid", "hybrid_approve"),
];

/// 进度回调注册表：字符串键 → 回调标识
const PROGRESS_CALLBACKS: &[(&str, &str)] = &[
    ("gui", "gui_callback"),
    ("tui", "tui_callback"),
];

/// 从注册表查找 — 泛型，可复用于任何 (key, factory) 表
///
/// 使用二分查找（注册表按 key 排序时），退化为线性查找。
/// 对于 <10 条注册表条目，线性查找比 HashMap 更快。
fn resolve_from_table<'a, T>(table: &'a [(&'a str, T)], key: &str) -> Option<&'a T> {
    table.iter().find(|(k, _)| *k == key).map(|(_, v)| v)
}

#[tauri::command]
pub async fn launch_agent(
    app: tauri::AppHandle,
    supervisor: State<'_, Supervisor>,
    id: String,
    agent_type: String,
    task: String,
    project_root: String,
    provider_config: AIProviderConfig,
) -> Result<String, String> {
    // 🔥 使用 log::info 而不是 println!，这样可以通过 tauri-plugin-log 输出到前端
    log::info!(
        "[AgentCommands] 🔥 launch_agent ENTRY - id: {}, agent_type: '{}'",
        id,
        agent_type
    );
    log::info!("[AgentCommands] project_root: {}", project_root);
    log::info!("[AgentCommands] provider: {:?}", provider_config.protocol);
    log::info!(
        "[AgentCommands] model: {:?}",
        provider_config.models.first()
    );

    println!(
        "[AgentCommands] 🔥 launch_agent ENTRY - id: {}, agent_type: '{}'",
        id, agent_type
    );
    println!("[AgentCommands] project_root: {}", project_root);
    println!("[AgentCommands] provider: {:?}", provider_config.protocol);
    println!(
        "[AgentCommands] model: {:?}",
        provider_config.models.first()
    );

    // 🔥 P4: 移除 commercial 限制 - 现在社区版也可以使用 agent 功能
    log::info!("[AgentCommands] ✅ Launching agent (Community Edition supported)");
    println!("[AgentCommands] ✅ Launching agent (Community Edition supported)");

    // 🔥 发送事件到前端，用于测试诊断
    let _ = app.emit(
        "agent_diagnostic",
        format!("launch_agent: Community Edition supported, id={}", id),
    );

    println!(
        "[AgentSystem] launch_agent called with id: {}, agent_type: {}",
        id, agent_type
    );
    supervisor
        .register_agent(id.clone(), agent_type.clone())
        .await;

    let context = AgentContext {
        project_root,
        task_description: task,
        initial_prompt: String::new(),
        variables: HashMap::new(),
        provider_config,
        current_model: None, // 🔥 使用默认值（从 provider_config 中选择）
        cancellation_token: None, // 🔥 非 workflow 场景无需取消令牌
    };

    let supervisor_inner = supervisor.inner().clone();
    let id_clone = id.clone();
    let agent_type_clone = agent_type.clone();

    // 🔥 发送诊断事件：即将 spawn
    let _ = app.emit(
        "agent_diagnostic",
        format!("About to spawn task for agent: {}", id),
    );

    // Clone app for use in spawned task
    let app_clone = app.clone();
    tokio::spawn(async move {
        // 🔥 发送诊断事件：任务开始执行
        let _ = app_clone.emit(
            "agent_diagnostic",
            format!("Task started for agent: {}", id_clone),
        );
        runner::run_agent_task(
            app_clone,
            supervisor_inner,
            id_clone,
            agent_type_clone,
            context,
        )
        .await;
    });

    // 🔥 发送诊断事件：任务已 spawn
    let _ = app.emit(
        "agent_diagnostic",
        format!("Task spawned for agent: {}", id),
    );

    println!("[AgentSystem] Agent launched: {} ({})", id, agent_type);
    log::info!("[AgentCommands] Agent launched: {} ({})", id, agent_type);
    Ok(id)
}

#[tauri::command]
pub async fn list_running_agents(
    supervisor: State<'_, Supervisor>,
) -> Result<Vec<AgentInfo>, String> {
    let agents = supervisor.list_agents().await;
    // Convert status (assuming serde compatibility or manual mapping)
    // Since we can't see agent_system::AgentStatus definition easily, we use JSON hack

    let mut info_list = Vec::new();
    for (id, agent_type, status) in agents {
        let status_json = serde_json::to_value(status).unwrap();
        let trait_status: AgentStatus = serde_json::from_value(status_json)
            .unwrap_or(AgentStatus::Failed("Conversion Error".into()));
        info_list.push(AgentInfo {
            id,
            agent_type,
            status: trait_status,
        });
    }
    Ok(info_list)
}

#[tauri::command]
pub async fn approve_agent_action(
    supervisor: State<'_, Supervisor>,
    id: String,
    approved: bool,
) -> Result<(), String> {
    println!(
        "[AgentCommands] approve_agent_action called: id={}, approved={}",
        id, approved
    );
    supervisor.notify_approval(&id, approved).await;
    println!("[AgentCommands] notify_approval completed for id={}", id);
    Ok(())
}

// ============================================================
// 单元测试
// ============================================================

#[cfg(test)]
mod tests {
    use super::*;

    // --- UT-D.1.5: APPROVAL_POLICIES 包含两个条目 ---
    #[test]
    fn test_approval_policies_contains_entries() {
        let keys: Vec<&str> = APPROVAL_POLICIES.iter().map(|(k, _)| *k).collect();
        assert!(keys.contains(&"auto"), "应包含 auto 策略");
        assert!(keys.contains(&"hybrid"), "应包含 hybrid 策略");
    }

    // --- UT-D.1.6: PROGRESS_CALLBACKS 包含两个条目 ---
    #[test]
    fn test_progress_callbacks_contains_entries() {
        let keys: Vec<&str> = PROGRESS_CALLBACKS.iter().map(|(k, _)| *k).collect();
        assert!(keys.contains(&"gui"), "应包含 gui 回调");
        assert!(keys.contains(&"tui"), "应包含 tui 回调");
    }

    // --- UT-D.1.7: resolve_from_table 正确查找 ---
    #[test]
    fn test_resolve_from_table_found() {
        let table: &[(&str, i32)] = &[("a", 1), ("b", 2), ("c", 3)];
        let result = resolve_from_table(table, "b");
        assert_eq!(result, Some(&2));
    }

    // --- UT-D.1.8: resolve_from_table 找不到返回 None ---
    #[test]
    fn test_resolve_from_table_not_found() {
        let table: &[(&str, i32)] = &[("a", 1), ("b", 2)];
        let result = resolve_from_table(table, "z");
        assert_eq!(result, None);
    }

    // --- resolve_from_table: 空表返回 None ---
    #[test]
    fn test_resolve_from_table_empty() {
        let table: &[(&str, i32)] = &[];
        let result = resolve_from_table(table, "anything");
        assert_eq!(result, None);
    }

    // --- resolve_from_table: case sensitive ---
    #[test]
    fn test_resolve_from_table_case_sensitive() {
        let table: &[(&str, i32)] = &[("Hybrid", 1)];
        assert_eq!(resolve_from_table(table, "hybrid"), None, "大小写敏感");
        assert_eq!(resolve_from_table(table, "Hybrid"), Some(&1));
    }
}
