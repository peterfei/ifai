use tauri::{State, Emitter};
use crate::agent_system::Supervisor;
#[cfg(feature = "commercial")]
use crate::agent_system::{AgentContext, runner};
use serde::Serialize;
use std::collections::HashMap;
use crate::core_traits::agent::AgentStatus;
use crate::core_traits::ai::AIProviderConfig;

#[derive(Serialize)]
pub struct AgentInfo {
    pub id: String,
    pub agent_type: String,
    pub status: AgentStatus,
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
    log::info!("[AgentCommands] 🔥 launch_agent ENTRY - id: {}, agent_type: '{}'", id, agent_type);
    log::info!("[AgentCommands] project_root: {}", project_root);
    log::info!("[AgentCommands] provider: {:?}", provider_config.protocol);
    log::info!("[AgentCommands] model: {:?}", provider_config.models.first());

    println!("[AgentCommands] 🔥 launch_agent ENTRY - id: {}, agent_type: '{}'", id, agent_type);
    println!("[AgentCommands] project_root: {}", project_root);
    println!("[AgentCommands] provider: {:?}", provider_config.protocol);
    println!("[AgentCommands] model: {:?}", provider_config.models.first());

    #[cfg(feature = "commercial")]
    {
        log::info!("[AgentCommands] ✅ Commercial feature IS enabled");
        println!("[AgentCommands] ✅ Commercial feature IS enabled");

        // 🔥 发送事件到前端，用于测试诊断
        let _ = app.emit("agent_diagnostic", format!("launch_agent: Commercial feature enabled, id={}", id));

        println!("[AgentSystem] launch_agent called with id: {}, agent_type: {}", id, agent_type);
        supervisor.register_agent(id.clone(), agent_type.clone()).await;

        let context = AgentContext {
            project_root,
            task_description: task,
            initial_prompt: String::new(),
            variables: HashMap::new(),
            provider_config,
        };

        let supervisor_inner = supervisor.inner().clone();
        let id_clone = id.clone();
        let agent_type_clone = agent_type.clone();

        // 🔥 发送诊断事件：即将 spawn
        let _ = app.emit("agent_diagnostic", format!("About to spawn task for agent: {}", id));

        // Clone app for use in spawned task
        let app_clone = app.clone();
        tokio::spawn(async move {
            // 🔥 发送诊断事件：任务开始执行
            let _ = app_clone.emit("agent_diagnostic", format!("Task started for agent: {}", id_clone));
            runner::run_agent_task(app_clone, supervisor_inner, id_clone, agent_type_clone, context).await;
        });

        // 🔥 发送诊断事件：任务已 spawn
        let _ = app.emit("agent_diagnostic", format!("Task spawned for agent: {}", id));

        println!("[AgentSystem] Agent launched: {} ({})", id, agent_type);
        log::info!("[AgentCommands] Agent launched: {} ({})", id, agent_type);
        Ok(id)
    }

    #[cfg(not(feature = "commercial"))]
    {
        println!("[AgentCommands] ❌ Commercial feature NOT enabled!");
        println!("[AgentCommands] ❌ launch_agent will fail - Agents are available in Commercial Edition only");
        Err("Agents are available in Commercial Edition".to_string())
    }
}

#[tauri::command]
pub async fn list_running_agents(
    supervisor: State<'_, Supervisor>,
) -> Result<Vec<AgentInfo>, String> {
    #[cfg(feature = "commercial")]
    {
        let agents = supervisor.list_agents().await;
        // Convert status (assuming serde compatibility or manual mapping)
        // Since we can't see agent_system::AgentStatus definition easily, we use JSON hack
        
        let mut info_list = Vec::new();
        for (id, agent_type, status) in agents {
             let status_json = serde_json::to_value(status).unwrap();
             let trait_status: AgentStatus = serde_json::from_value(status_json).unwrap_or(AgentStatus::Failed("Conversion Error".into()));
             info_list.push(AgentInfo { id, agent_type, status: trait_status });
        }
        Ok(info_list)
    }
    #[cfg(not(feature = "commercial"))]
    {
        Ok(vec![])
    }
}

#[tauri::command]
pub async fn approve_agent_action(
    supervisor: State<'_, Supervisor>,
    id: String,
    approved: bool,
) -> Result<(), String> {
    #[cfg(feature = "commercial")]
    {
        println!("[AgentCommands] approve_agent_action called: id={}, approved={}", id, approved);
        supervisor.notify_approval(&id, approved).await;
        println!("[AgentCommands] notify_approval completed for id={}", id);
        Ok(())
    }
    #[cfg(not(feature = "commercial"))]
    {
        Err("Agents are available in Commercial Edition".to_string())
    }
}
