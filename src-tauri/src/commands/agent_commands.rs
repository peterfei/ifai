use tauri::State;
use crate::agent_system::{Supervisor, AgentStatus, AgentContext, runner};
use uuid::Uuid;
use serde::Serialize;
use std::collections::HashMap;

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
    agent_type: String,
    task: String,
    project_root: String,
    provider_config: ifainew_core::ai::AIProviderConfig,
) -> Result<String, String> {
    let id = Uuid::new_v4().to_string();
    
    // 1. Register the agent
    supervisor.register_agent(id.clone(), agent_type.clone()).await;
    
    // 2. Prepare Context
    let context = AgentContext {
        project_root,
        task_description: task,
        initial_prompt: String::new(),
        variables: HashMap::new(),
        provider_config,
    };

    // 3. Spawn Task
    let supervisor_inner = supervisor.inner().clone();
    let id_clone = id.clone();
    let agent_type_clone = agent_type.clone();
    
    tokio::spawn(async move {
        runner::run_agent_task(app, supervisor_inner, id_clone, agent_type_clone, context).await;
    });
    
    println!("[AgentSystem] Agent launched: {} ({})", id, agent_type);
    
    Ok(id)
}

#[tauri::command]
pub async fn list_running_agents(
    supervisor: State<'_, Supervisor>,
) -> Result<Vec<AgentInfo>, String> {
    let agents = supervisor.list_agents().await;
    Ok(agents.into_iter().map(|(id, agent_type, status)| AgentInfo {
        id,
        agent_type,
        status
    }).collect())
}