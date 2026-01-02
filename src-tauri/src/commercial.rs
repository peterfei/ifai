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
        async fn chat(&self, config: &AIProviderConfig, messages: Vec<Message>) -> Result<Message, String> {
            crate::ai_utils::fetch_ai_completion(config, messages, None).await
        }

        async fn stream_chat(
            &self,
            config: &AIProviderConfig,
            messages: Vec<Message>,
            event_id: &str,
            _callback: Box<dyn Fn(String) + Send>,
        ) -> Result<(), String> {
            // 直接透传，无需序列化转换
            ifainew_core::ai::stream_chat(
                self.app.clone(),
                config.clone(),
                messages,
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
             let chunks = ifainew_core::rag::search_semantic(state, query.to_string()).await?;
             Ok(chunks.into_iter().map(|c| c.content).collect())
        }

        async fn retrieve_context(&self, query: &str, root: &str) -> Result<RagResult, String> {
            let state = self.app.state::<ifainew_core::RagState>();
            // ifainew_core::rag::build_context returns its own result type
            let core_res = ifainew_core::rag::build_context(state, query.to_string(), root.to_string()).await?;
            
            // Convert to local RagResult via JSON
            let json = serde_json::to_value(core_res).map_err(|e| e.to_string())?;
            let res: RagResult = serde_json::from_value(json).map_err(|e| e.to_string())?;
            Ok(res)
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
