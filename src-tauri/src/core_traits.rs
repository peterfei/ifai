use serde::{Deserialize, Serialize};

pub mod ai {
    use super::*;

    #[cfg(feature = "commercial")]
    pub use ifainew_core::ai::{
        Message, Content, ContentPart, ToolCall, FunctionCall, AIProviderConfig, ImageUrl, AIProtocol,
        // 🔥 新增：非流式工具调用 API
        ChatWithToolsResponse, PerformanceMetrics, create_default_tools,
    };

    // 🔥 新增：非流式工具调用函数
    #[cfg(feature = "commercial")]
    pub use ifainew_core::ai::chat_with_tools;

    #[cfg(not(feature = "commercial"))]
    mod community_types {
        use super::*;
        
        #[derive(Debug, Clone, Serialize, Deserialize, Default)]
        #[serde(rename_all = "lowercase")]
        pub enum AIProtocol { #[default] Openai, Anthropic, Gemini }

        #[derive(Debug, Clone, Serialize, Deserialize)]
        pub struct ImageUrl { pub url: String }

        #[derive(Debug, Clone, Serialize, Deserialize)]
        #[serde(tag = "type", rename_all = "snake_case")]
        pub enum ContentPart {
            Text { 
                text: String,
                #[serde(default)]
                part_type: String,
            },
            ImageUrl { image_url: ImageUrl },
        }

        impl Default for ContentPart {
            fn default() -> Self { Self::Text { text: String::new(), part_type: "text".to_string() } }
        }

        #[derive(Debug, Clone, Serialize, Deserialize)]
        #[serde(untagged)]
        pub enum Content {
            Text(String),
            Parts(Vec<ContentPart>),
        }

        impl Default for Content {
            fn default() -> Self { Self::Text(String::new()) }
        }

        #[derive(Debug, Clone, Serialize, Deserialize, Default)]
        pub struct FunctionCall { 
            #[serde(default)] pub name: String, 
            #[serde(default)] pub arguments: String 
        }

        #[derive(Debug, Clone, Serialize, Deserialize, Default)]
        pub struct ToolCall {
            #[serde(default)] pub id: String,
            #[serde(default, rename = "type")] pub r#type: String,
            #[serde(default)] pub function: FunctionCall,
        }

        #[derive(Debug, Clone, Serialize, Deserialize, Default)]
        pub struct Message {
            #[serde(default)] pub role: String,
            pub content: Content,
            #[serde(default, skip_serializing_if = "Option::is_none")] pub tool_calls: Option<Vec<ToolCall>>,
            #[serde(default, skip_serializing_if = "Option::is_none")] pub tool_call_id: Option<String>,
        }

        #[derive(Debug, Clone, Serialize, Deserialize, Default)]
        #[serde(rename_all = "camelCase")]  // 🔥 FIX: 接受前端发送的 camelCase 字段名
        pub struct AIProviderConfig {
            #[serde(default)] pub id: String,
            #[serde(default)] pub name: String,
            #[serde(default)] pub api_key: String,
            #[serde(default)] pub base_url: String,
            #[serde(default)] pub models: Vec<String>,
            #[serde(default)] pub protocol: AIProtocol,
        }

        // 🔥 新增：性能指标
        #[derive(Debug, Clone, Serialize, Deserialize, Default)]
        pub struct PerformanceMetrics {
            #[serde(default)] pub total_duration_ms: u128,
            #[serde(default)] pub ai_api_duration_ms: u128,
            #[serde(default)] pub tool_execution_duration_ms: u128,
            #[serde(default)] pub iteration_count: usize,
        }

        // 🔥 新增：非流式工具调用响应
        #[derive(Debug, Clone, Serialize, Deserialize, Default)]
        pub struct ChatWithToolsResponse {
            #[serde(default)] pub content: String,
            #[serde(default)] pub tool_calls: Option<Vec<ToolCall>>,
            #[serde(default)] pub metrics: PerformanceMetrics,
        }
    }

    #[cfg(not(feature = "commercial"))]
    pub use community_types::*;

    #[async_trait::async_trait]
    pub trait AIService: Send + Sync {
        async fn chat(&self, config: &AIProviderConfig, messages: Vec<Message>) -> Result<Message, String>;
        async fn stream_chat(&self, config: &AIProviderConfig, messages: Vec<Message>, event_id: &str, tools: Option<Vec<serde_json::Value>>, callback: Box<dyn Fn(String) + Send>) -> Result<(), String>;
    }
}

pub mod rag {
    use super::*;

    #[derive(Debug, Clone, Serialize, Deserialize, Default)]
    pub struct RagReference { 
        #[serde(default)] pub file_path: String, 
        #[serde(default)] pub line_start: usize, 
        #[serde(default)] pub content: String 
    }

    #[derive(Debug, Clone, Serialize, Deserialize, Default)]
    pub struct RagResult { 
        #[serde(default)] pub context: String, 
        #[serde(default)] pub references: Vec<RagReference> 
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

    #[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
    #[serde(rename_all = "lowercase")]
    pub enum AgentStatus {
        #[default] Idle, Running, WaitingForTool, Completed, Failed(String), Stopped,
    }

    #[async_trait::async_trait]
    pub trait AgentService: Send + Sync {
        async fn execute_task(&self, task: &str) -> Result<String, String>;
    }
}