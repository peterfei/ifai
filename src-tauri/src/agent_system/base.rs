use serde::{Deserialize, Serialize};
use async_trait::async_trait;
use anyhow::Result;
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum AgentStatus {
    Idle,
    Running,
    WaitingForTool,
    Completed,
    Failed(String),
    Stopped,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentContext {
    pub project_root: String,
    pub task_description: String,
    pub initial_prompt: String,
    pub variables: HashMap<String, String>,
    pub provider_config: ifainew_core::ai::AIProviderConfig,
}

#[async_trait]
pub trait Agent: Send + Sync {
    fn id(&self) -> String;
    fn agent_type(&self) -> String;
    fn status(&self) -> AgentStatus;
    async fn run(&mut self, ctx: AgentContext) -> Result<String>;
}
