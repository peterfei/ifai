use crate::core_traits::ai::{AIService, AIProviderConfig, Message};
use crate::core_traits::rag::RagService;
use crate::core_traits::agent::AgentService;
use crate::ai_utils;

pub struct BasicAIService;

#[async_trait::async_trait]
impl AIService for BasicAIService {
    async fn chat(
        &self,
        config: &AIProviderConfig,
        messages: Vec<Message>,
    ) -> Result<Message, String> {
        ai_utils::fetch_ai_completion(config, messages, None).await
    }

    async fn stream_chat(
        &self,
        config: &AIProviderConfig,
        messages: Vec<Message>,
        _event_id: &str,
        tools: Option<Vec<serde_json::Value>>,
        callback: Box<dyn Fn(String) + Send>,
    ) -> Result<(), String> {
        // Enhanced implementation that supports tool_calls
        match ai_utils::fetch_ai_completion(config, messages, tools).await {
            Ok(msg) => {
                // 1. Send text content
                match &msg.content {
                    crate::core_traits::ai::Content::Text(text) => {
                        if !text.is_empty() {
                            callback(text.to_string());
                        }
                    }
                    _ => {}
                }

                // 2. Send tool_calls if present (format matches ifainew_core)
                if let Some(tool_calls) = &msg.tool_calls {
                    use serde_json::json;

                    for tc in tool_calls {
                        // Create tool_call chunk in the same format as ifainew_core
                        let tool_call_event = json!({
                            "type": "tool_call",
                            "tool_call": {
                                "index": 0,
                                "id": &tc.id,
                                "type": &tc.r#type,
                                "function": {
                                    "name": &tc.function.name,
                                    "arguments": &tc.function.arguments
                                }
                            }
                        });

                        callback(tool_call_event.to_string());
                    }
                }

                Ok(())
            }
            Err(e) => Err(e),
        }
    }
}

pub struct CommunityRagService;

#[async_trait::async_trait]
impl RagService for CommunityRagService {
    async fn index_project(&self, _root: &str) -> Result<(), String> {
        Err("RAG indexing is available in Commercial Edition.".to_string())
    }

    async fn search(&self, _query: &str, _top_k: usize) -> Result<Vec<String>, String> {
        Ok(vec![])
    }

    async fn retrieve_context(&self, _query: &str, _root: &str) -> Result<crate::core_traits::rag::RagResult, String> {
        Ok(crate::core_traits::rag::RagResult {
            context: String::new(),
            references: vec![],
        })
    }
}

pub struct CommunityAgentService;

#[async_trait::async_trait]
impl AgentService for CommunityAgentService {
    async fn execute_task(&self, _task: &str) -> Result<String, String> {
        Err("Agent system is available in Commercial Edition.".to_string())
    }
}
