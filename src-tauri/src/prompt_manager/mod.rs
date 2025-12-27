use serde::{Deserialize, Serialize};
use rust_embed::RustEmbed;
use crate::project_config;

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
        let local_root = std::path::Path::new(project_root).join(".ifai/prompts/system");
        let override_path = local_root.join("main.override.md");
        let local_path = local_root.join("main.md");

        if override_path.exists() {
            storage::load_prompt(&override_path).ok()
        } else if local_path.exists() {
            storage::load_prompt(&local_path).ok()
        } else if let Some(content_file) = BuiltinPrompts::get("system/main.md") {
            let content = std::str::from_utf8(content_file.data.as_ref()).unwrap_or("");
            storage::load_prompt_from_str(content, None).ok()
        } else {
            None
        }
    };

    let mut prompt = match template {
        Some(t) => template::render_template(&t.content, &variables).unwrap_or_else(|_| t.content),
        None => "You are a helpful AI programming assistant.".to_string(),
    };

    // 追加 IFAI.md 中的 custom_instructions
    if let Some(ifai_config) = project_config::load_project_config_sync(project_root) {
        println!("[PromptManager] Loaded IFAI.md config: {:?}", ifai_config.default_language);
        if let Some(instructions) = ifai_config.custom_instructions {
            if !instructions.trim().is_empty() {
                println!("[PromptManager] Adding custom_instructions: {} chars", instructions.len());
                prompt.push_str("\n\n# Project-Specific Instructions\n");
                prompt.push_str(&instructions);
            }
        }
    } else {
        println!("[PromptManager] No IFAI.md config found or failed to parse");
    }

    prompt
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

    let mut prompt = match template {
        Some(t) => template::render_template(&t.content, &variables).unwrap_or_else(|_| t.content),
        None => format!("You are a specialized {} agent. Task: {}", agent_type, task_description),
    };

    // 追加 IFAI.md 中的 custom_instructions (与 main prompt 相同的逻辑)
    if let Some(ifai_config) = project_config::load_project_config_sync(project_root) {
        if let Some(instructions) = ifai_config.custom_instructions {
            if !instructions.trim().is_empty() {
                println!("[PromptManager] Adding custom_instructions to agent {}: {} chars", agent_type, instructions.len());
                prompt.push_str("\n\n# Project-Specific Instructions\n");
                prompt.push_str(&instructions);
            }
        }
    }

    prompt
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PromptMetadata {
    pub name: String,
    #[serde(default)]
    pub description: String,
    #[serde(default = "default_version")]
    pub version: String,
    #[serde(default)]
    pub author: Option<String>,
    #[serde(default = "default_access_tier")]
    pub access_tier: AccessTier,
    #[serde(default)]
    pub variables: Vec<String>,
    #[serde(default)]
    pub tools: Vec<String>,
}

fn default_version() -> String {
    "1.0.0".to_string()
}

fn default_access_tier() -> AccessTier {
    AccessTier::Public
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PromptTemplate {
    pub metadata: PromptMetadata,
    pub content: String,
    pub raw_text: String, // Added full text field
    pub path: Option<String>,
}
