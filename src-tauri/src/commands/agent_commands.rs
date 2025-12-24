use tauri::State;
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
    #[cfg(feature = "commercial")]
    {
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
        
        tokio::spawn(async move {
            runner::run_agent_task(app, supervisor_inner, id_clone, agent_type_clone, context).await;
        });
        
        println!("[AgentSystem] Agent launched: {} ({})", id, agent_type);
        Ok(id)
    }
    
    #[cfg(not(feature = "commercial"))]
    {
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
        supervisor.notify_approval(&id, approved).await;
        Ok(())
    }
    #[cfg(not(feature = "commercial"))]
    {
        Err("Agents are available in Commercial Edition".to_string())
    }
}
