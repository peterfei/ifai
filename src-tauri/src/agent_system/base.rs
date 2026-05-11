use anyhow::Result;
use async_trait::async_trait;
use serde::{Deserialize, Serialize};
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

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum PivoStage {
    Plan,
    Implement,
    Verify,
    Optimize,
    Idle,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentContext {
    pub project_root: String,
    pub task_description: String,
    pub initial_prompt: String,
    pub variables: HashMap<String, String>,
    pub provider_config: crate::core_traits::ai::AIProviderConfig,
    pub current_model: Option<String>, // 🔥 用户当前选择的模型
    #[serde(skip)]
    pub cancellation_token: Option<tokio_util::sync::CancellationToken>, // 🔥 取消令牌
}

#[async_trait]
pub trait Agent: Send + Sync {
    fn id(&self) -> String;
    fn agent_type(&self) -> String;
    fn status(&self) -> AgentStatus;
    async fn run(&mut self, ctx: AgentContext) -> Result<String>;
}
