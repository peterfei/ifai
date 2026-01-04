use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::{Mutex, oneshot};
use crate::agent_system::base::{AgentStatus};

#[derive(Debug)]
pub struct AgentHandle {
    pub id: String,
    pub agent_type: String,
    pub status: AgentStatus,
    pub join_handle: Option<tokio::task::JoinHandle<()>>,
}

#[derive(Clone)]
pub struct Supervisor {
    pub agents: Arc<Mutex<HashMap<String, AgentHandle>>>,
    // Map of agent_id -> oneshot sender to resume the task
    pub approval_txs: Arc<Mutex<HashMap<String, oneshot::Sender<bool>>>>,
}

impl Supervisor {
    pub fn new() -> Self {
        Self {
            agents: Arc::new(Mutex::new(HashMap::new())),
            approval_txs: Arc::new(Mutex::new(HashMap::new())),
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

    // --- Approval Mechanism ---

    pub async fn wait_for_approval(&self, id: String) -> bool {
        println!("[Supervisor] wait_for_approval called: id={}", id);
        let (tx, rx) = oneshot::channel();
        {
            let mut txs = self.approval_txs.lock().await;
            txs.insert(id.clone(), tx);
            println!("[Supervisor] Waiting for approval signal: id={}, pending_count={}", id, txs.len());
        }

        // This will block the async task until someone calls notify_approval
        let result = rx.await.unwrap_or(false);
        println!("[Supervisor] Approval received: id={}, approved={}", id, result);
        result
    }

    pub async fn notify_approval(&self, id: &str, approved: bool) {
        println!("[Supervisor] notify_approval called: id={}, approved={}", id, approved);
        let mut txs = self.approval_txs.lock().await;
        println!("[Supervisor] Current pending approvals: {:?}", txs.keys().collect::<Vec<_>>());
        if let Some(tx) = txs.remove(id) {
            println!("[Supervisor] Sending approval signal: id={}, approved={}", id, approved);
            let _ = tx.send(approved);
        } else {
            println!("[Supervisor] WARNING: No pending approval found for id={}", id);
        }
    }
}