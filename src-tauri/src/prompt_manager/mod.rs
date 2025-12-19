use serde::{Deserialize, Serialize};
use rust_embed::RustEmbed;

pub mod storage;
pub mod template;

#[derive(RustEmbed)]
#[folder = "../.ifai/prompts/"]
pub struct BuiltinPrompts;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum AccessTier {
    #[serde(rename = "public")]
    Public,
    #[serde(rename = "protected")]
    Protected,
    #[serde(rename = "private")]
    Private,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PromptMetadata {
    pub name: String,
    pub description: String,
    pub version: String,
    #[serde(default)]
    pub author: Option<String>,
    pub access_tier: AccessTier,
    #[serde(default)]
    pub variables: Vec<String>,
    #[serde(default)]
    pub tools: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PromptTemplate {
    pub metadata: PromptMetadata,
    pub content: String,
    pub path: Option<String>, // File path if stored on disk
}
