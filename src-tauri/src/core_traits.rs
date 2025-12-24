use serde::{Deserialize, Serialize};

pub mod ai {
    use super::*;

    #[derive(Debug, Clone, Serialize, Deserialize)]
    pub struct ImageUrl {
        pub url: String,
    }

    #[derive(Debug, Clone, Serialize, Deserialize)]
    #[serde(tag = "type", rename_all = "snake_case")]
    pub enum ContentPart {
        Text { text: String },
        ImageUrl { image_url: ImageUrl },
    }

    #[derive(Debug, Clone, Serialize, Deserialize)]
    #[serde(untagged)]
    pub enum Content {
        Text(String),
        Parts(Vec<ContentPart>),
    }

    #[derive(Debug, Clone, Serialize, Deserialize)]
    #[serde(rename_all = "camelCase")]
    pub struct FunctionCall {
        pub name: String,
        pub arguments: String,
    }

    #[derive(Debug, Clone, Serialize, Deserialize)]
    #[serde(rename_all = "camelCase")]
    pub struct ToolCall {
        pub id: String,
        pub r#type: String,
        pub function: FunctionCall,
    }

    #[derive(Debug, Clone, Serialize, Deserialize)]
    #[serde(rename_all = "camelCase")]
    pub struct Message {
        #[serde(skip_serializing_if = "Option::is_none")]
        pub id: Option<String>,
        pub role: String,
        pub content: Content,
        #[serde(skip_serializing_if = "Option::is_none")]
        pub tool_calls: Option<Vec<ToolCall>>,
        #[serde(skip_serializing_if = "Option::is_none")]
        pub tool_call_id: Option<String>,
    }

    #[derive(Debug, Clone, Serialize, Deserialize)]
    #[serde(rename_all = "camelCase")]
    pub struct AIProviderConfig {
        pub provider: String,
        pub api_key: String,
        pub base_url: String,
        pub models: Vec<String>,
    }

    #[async_trait::async_trait]
    pub trait AIService: Send + Sync {
        async fn chat(
            &self,
            config: &AIProviderConfig,
            messages: Vec<Message>,
        ) -> Result<Message, String>;

        async fn stream_chat(
            &self,
            config: &AIProviderConfig,
            messages: Vec<Message>,
            event_id: &str,
            callback: Box<dyn Fn(String) + Send>,
        ) -> Result<(), String>;
    }
}

pub mod rag {
    use super::*;

    #[derive(Debug, Clone, Serialize, Deserialize)]
    pub struct RagReference {
        pub file_path: String,
        pub line_start: usize,
        pub content: String,
    }

    #[derive(Debug, Clone, Serialize, Deserialize)]
    pub struct RagResult {
        pub context: String,
        pub references: Vec<RagReference>,
    }

    #[async_trait::async_trait]
    pub trait RagService: Send + Sync {
        async fn index_project(&self, root: &str) -> Result<(), String>;
        async fn search(&self, query: &str, top_k: usize) -> Result<Vec<String>, String>;
        async fn retrieve_context(&self, query: &str, root: &str) -> Result<RagResult, String>;
    }
}

pub mod agent {
    use super::*;

    #[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
    pub enum AgentStatus {
        Running,
        Paused(String), // Reason
        Completed,
        Failed(String),
        Idle,
    }

    #[async_trait::async_trait]
    pub trait AgentService: Send + Sync {
        async fn execute_task(&self, task: &str) -> Result<String, String>;
    }
}
