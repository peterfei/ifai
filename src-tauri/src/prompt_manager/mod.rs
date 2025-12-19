use serde::{Deserialize, Serialize};
use rust_embed::RustEmbed;

pub mod storage;
pub mod template;
pub mod variables;

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

pub fn get_main_system_prompt(project_root: &str) -> String {
    let variables = variables::collect_system_variables(project_root);
    
    let template = {
        let local_path = std::path::Path::new(project_root).join(".ifai/prompts/system/main.md");
        if local_path.exists() {
            storage::load_prompt(&local_path).ok()
        } else if let Some(content_file) = BuiltinPrompts::get("system/main.md") {
            let content = std::str::from_utf8(content_file.data.as_ref()).unwrap_or("");
            storage::load_prompt_from_str(content, None).ok()
        } else {
            None
        }
    };

    match template {
        Some(t) => template::render_template(&t.content, &variables).unwrap_or_else(|_| t.content),
        None => "You are a helpful AI programming assistant.".to_string(),
    }
}

pub fn get_agent_prompt(agent_type: &str, project_root: &str, task_description: &str) -> String {
    let mut variables = variables::collect_system_variables(project_root);
    variables.insert("TASK_DESCRIPTION".to_string(), task_description.to_string());
    
    let template_name = format!("agents/{}.md", agent_type.to_lowercase().replace(' ', "-"));
    
    let template = {
        let local_path = std::path::Path::new(project_root).join(".ifai/prompts").join(&template_name);
        if local_path.exists() {
            storage::load_prompt(&local_path).ok()
        } else if let Some(content_file) = BuiltinPrompts::get(&template_name) {
            let content = std::str::from_utf8(content_file.data.as_ref()).unwrap_or("");
            storage::load_prompt_from_str(content, None).ok()
        } else {
            None
        }
    };

    match template {
        Some(t) => template::render_template(&t.content, &variables).unwrap_or_else(|_| t.content),
        None => format!("You are a specialized {} agent. Task: {}", agent_type, task_description),
    }
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
