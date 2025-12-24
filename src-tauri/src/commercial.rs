#[cfg(feature = "commercial")]
pub mod impls {
    use crate::core_traits::ai::{AIService, AIProviderConfig, Message};
    use crate::core_traits::rag::{RagService, RagResult};
    use crate::core_traits::agent::AgentService;
    use ifainew_core;
    use tauri::{AppHandle, Manager};

    pub struct CommercialAIService {
        pub app: AppHandle,
    }

    impl CommercialAIService {
        pub fn new(app: AppHandle) -> Self {
            Self { app }
        }
    }

    #[async_trait::async_trait]
    impl AIService for CommercialAIService {
        async fn chat(&self, _config: &AIProviderConfig, _messages: Vec<Message>) -> Result<Message, String> {
            todo!("chat not implemented in commercial adapter")
        }

        async fn stream_chat(
            &self,
            config: &AIProviderConfig,
            messages: Vec<Message>,
            event_id: &str,
            _callback: Box<dyn Fn(String) + Send>,
        ) -> Result<(), String> {
            let config_json = serde_json::to_value(config).map_err(|e| e.to_string())?;
            let core_config: ifainew_core::ai::AIProviderConfig = serde_json::from_value(config_json).map_err(|e| e.to_string())?;
            
            let msgs_json = serde_json::to_value(messages).map_err(|e| e.to_string())?;
            let core_msgs: Vec<ifainew_core::ai::Message> = serde_json::from_value(msgs_json).map_err(|e| e.to_string())?;

            ifainew_core::ai::stream_chat(
                self.app.clone(),
                core_config,
                core_msgs,
                event_id.to_string(),
                true
            ).await
        }
    }

    pub struct CommercialRagService {
        pub app: AppHandle,
    }

    impl CommercialRagService {
        pub fn new(app: AppHandle) -> Self {
            Self { app }
        }
    }

    #[async_trait::async_trait]
    impl RagService for CommercialRagService {
        async fn index_project(&self, root: &str) -> Result<(), String> {
            let state = self.app.state::<ifainew_core::RagState>();
            ifainew_core::rag::init_rag_index(self.app.clone(), state, root.to_string()).await.map(|_| ())
        }

        async fn search(&self, query: &str, _top_k: usize) -> Result<Vec<String>, String> {
             let state = self.app.state::<ifainew_core::RagState>();
             // ifainew_core::rag::search_semantic returns Result<Vec<Chunk>, String>
             // We map Chunk to String (assuming Chunk has content field)
             let chunks = ifainew_core::rag::search_semantic(state, query.to_string()).await?;
             Ok(chunks.into_iter().map(|c| c.content).collect())
        }

        async fn retrieve_context(&self, query: &str, root: &str) -> Result<RagResult, String> {
            let state = self.app.state::<ifainew_core::RagState>();
            let res = ifainew_core::rag::build_context(state, query.to_string(), root.to_string()).await?;
            
            let json = serde_json::to_value(res).map_err(|e| e.to_string())?;
            let my_res: RagResult = serde_json::from_value(json).map_err(|e| e.to_string())?;
            Ok(my_res)
        }
    }

    pub struct CommercialAgentService;
    impl CommercialAgentService {
        pub fn new() -> Self {
            Self
        }
    }

    #[async_trait::async_trait]
    impl AgentService for CommercialAgentService {
        async fn execute_task(&self, _task: &str) -> Result<String, String> {
            Err("Agent task execution not yet exposed in commercial adapter".to_string())
        }
    }
}