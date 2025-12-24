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

    impl Default for ContentPart {
        fn default() -> Self {
            Self::Text { text: String::new() }
        }
    }

    #[derive(Debug, Clone, Serialize, Deserialize)]
    #[serde(untagged)]
    pub enum Content {
        Text(String),
        Parts(Vec<ContentPart>),
    }

    impl Default for Content {
        fn default() -> Self {
            Self::Text(String::new())
        }
    }

    #[derive(Debug, Clone, Serialize, Deserialize, Default)]
    pub struct FunctionCall {
        #[serde(default)]
        pub name: String,
        #[serde(default)]
        pub arguments: String,
    }

    #[derive(Debug, Clone, Serialize, Deserialize, Default)]
    pub struct ToolCall {
        #[serde(default)]
        pub id: String,
        #[serde(default, rename = "type")]
        pub r#type: String,
        #[serde(default)]
        pub function: FunctionCall,
    }

    #[derive(Debug, Clone, Serialize, Deserialize, Default)]
    pub struct Message {
        #[serde(default)]
        pub id: String,
        #[serde(default)]
        pub role: String,
        pub content: Content,
        #[serde(default, alias = "toolCalls", alias = "tool_calls")]
        pub tool_calls: Option<Vec<ToolCall>>,
        #[serde(default, alias = "toolCallId", alias = "tool_call_id")]
        pub tool_call_id: String,
    }

    #[derive(Debug, Clone, Serialize, Deserialize, Default)]
    pub struct AIProviderConfig {
        #[serde(default, rename = "id", alias = "provider", alias = "provider_id", alias = "providerId")]
        pub provider: String,
        #[serde(default, alias = "apiKey", alias = "api_key")]
        pub api_key: String,
        #[serde(default, alias = "baseUrl", alias = "base_url")]
        pub base_url: String,
        #[serde(default)]
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
