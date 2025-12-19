use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::Mutex;
use crate::agent_system::base::{AgentStatus};
use uuid::Uuid;

#[derive(Debug)]
pub struct AgentHandle {
    pub id: String,
    pub agent_type: String,
    pub status: AgentStatus,
    // We'll store the join handle to allow cancellation
    pub join_handle: Option<tokio::task::JoinHandle<()>>,
}

pub struct Supervisor {
    pub agents: Arc<Mutex<HashMap<String, AgentHandle>>>,
}

impl Supervisor {
    pub fn new() -> Self {
        Self {
            agents: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    pub async fn register_agent(&self, id: String, agent_type: String) {
        let mut agents = self.agents.lock().await;
        agents.insert(id.clone(), AgentHandle {
            id,
            agent_type,
            status: AgentStatus::Idle,
            join_handle: None,
        });
    }

    pub async fn update_status(&self, id: &str, status: AgentStatus) {
        let mut agents = self.agents.lock().await;
        if let Some(agent) = agents.get_mut(id) {
            agent.status = status;
        }
    }

    pub async fn list_agents(&self) -> Vec<(String, String, AgentStatus)> {
        let agents = self.agents.lock().await;
        agents.values()
            .map(|a| (a.id.clone(), a.agent_type.clone(), a.status.clone()))
            .collect()
    }
}
