use tauri::State;
use crate::agent_system::{Supervisor, AgentStatus};
use uuid::Uuid;
use serde::Serialize;

#[derive(Serialize)]
pub struct AgentInfo {
    pub id: String,
    pub agent_type: String,
    pub status: AgentStatus,
}

#[tauri::command]
pub async fn launch_agent(
    supervisor: State<'_, Supervisor>,
    agent_type: String,
    _task: String,
    _project_root: String,
) -> Result<String, String> {
    let id = Uuid::new_v4().to_string();
    
    // Register the agent in the system
    supervisor.register_agent(id.clone(), agent_type.clone()).await;
    
    println!("[AgentSystem] Agent created: {} ({})", id, agent_type);
    
    // TODO: Spawn actual task runner
    
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
