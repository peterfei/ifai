use crate::project_config;
use rust_embed::RustEmbed;
use serde::{Deserialize, Serialize};

pub mod export;
pub mod storage;
pub mod template;
pub mod tool_parser;
pub mod validation;
pub mod variables;
pub mod version;

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
    #[serde(default)]
    pub description: String,
    #[serde(default = "default_access_tier")]
    pub access_tier: AccessTier,
}

fn default_access_tier() -> AccessTier {
    AccessTier::Public
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PromptTemplate {
    pub metadata: PromptMetadata,
    pub content: String,
    pub raw_text: String,
    pub path: Option<String>,
}

pub fn get_main_system_prompt(project_root: &str) -> String {
    let variables = variables::collect_system_variables(project_root);

    let lang = project_config::load_project_config_sync(project_root)
        .and_then(|c| c.default_language)
        .unwrap_or_else(|| "en".to_string());
    let is_zh = lang.to_lowercase().starts_with("zh");

    let template_name = if is_zh {
        "zh-CN/system/main.md"
    } else {
        "system/main.md"
    };

    let template = match load_template(project_root, template_name) {
        Some(t) => t,
        None => BuiltinPrompts::get("system/main.md")
            .and_then(|f| {
                std::str::from_utf8(f.data.as_ref())
                    .ok()
                    .map(|s| s.to_string())
            })
            .unwrap_or_else(|| "You are IfAI, an advanced AI software engineer.".to_string()),
    };

    template::render_template(&template, &variables).unwrap_or_else(|_| template)
}

pub fn get_agent_prompt(agent_type: &str, project_root: &str, task: &str) -> String {
    let (clean_task, proposal_id) = extract_proposal_context(task);
    let mut variables = variables::collect_system_variables(project_root);
    variables.insert("task".to_string(), clean_task);

    if let Some(pid) = proposal_id {
        variables.insert("proposal_id".to_string(), pid);
    }

    let lang = project_config::load_project_config_sync(project_root)
        .and_then(|c| c.default_language)
        .unwrap_or_else(|| "en".to_string());
    let is_zh = lang.to_lowercase().starts_with("zh");

    let template_name = format!("agents/{}.md", agent_type.to_lowercase());
    let lang_template_name = if is_zh {
        format!("zh-CN/{}", template_name)
    } else {
        template_name.clone()
    };

    let template = load_template(project_root, &lang_template_name)
        .or_else(|| load_template(project_root, &template_name))
        .unwrap_or_else(|| {
            let builtin_path = if is_zh {
                format!("zh-CN/{}", template_name)
            } else {
                template_name.clone()
            };
            if let Some(f) = BuiltinPrompts::get(&builtin_path) {
                std::str::from_utf8(f.data.as_ref())
                    .ok()
                    .map(|s| s.to_string())
                    .unwrap()
            } else if let Some(f) = BuiltinPrompts::get(&template_name) {
                std::str::from_utf8(f.data.as_ref())
                    .ok()
                    .map(|s| s.to_string())
                    .unwrap()
            } else {
                "You are a specialized AI agent.".to_string()
            }
        });

    template::render_template(&template, &variables).unwrap_or_else(|_| template)
}

fn load_template(project_root: &str, name: &str) -> Option<String> {
    let local_path = std::path::Path::new(project_root)
        .join(".ifai/prompts")
        .join(name);
    if local_path.exists() {
        std::fs::read_to_string(local_path).ok()
    } else {
        None
    }
}

pub fn extract_proposal_context(task: &str) -> (String, Option<String>) {
    let re = regex::Regex::new(r"\[PROPOSAL:([\w\d\-\.]+)\]").unwrap();
    if let Some(caps) = re.captures(task) {
        if let Some(proposal_id) = caps.get(1) {
            let clean_task = re.replace(task, "").trim().to_string();
            return (clean_task, Some(proposal_id.as_str().to_string()));
        }
    }
    (task.trim().to_string(), None)
}

/**
 * 🏆 PIVO 3.0 Dynamic Tool Pipeline
 * 获取一组动态工具定义
 */
pub fn get_dynamic_tools(project_root: &str, tool_ids: Vec<&str>) -> Vec<serde_json::Value> {
    let lang = crate::project_config::load_project_config_sync(project_root)
        .and_then(|c| c.default_language)
        .unwrap_or_else(|| "en".to_string());

    let mut tools = Vec::new();
    for id in tool_ids {
        if let Some(tool) = tool_parser::load_tool_definition(project_root, id, &lang) {
            tools.push(tool);
        }
    }
    tools
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn test_extract_proposal_context() {
        let input = "[PROPOSAL:v0.2.6-demo] 这是一个任务";
        let (task, id) = extract_proposal_context(input);
        assert_eq!(id, Some("v0.2.6-demo".to_string()));
        assert_eq!(task, "这是一个任务");
    }

    #[test]
    fn test_get_dynamic_tools_mapping() {
        let dir = tempdir().unwrap();
        let project_root = dir.path().to_str().unwrap();
        let tool_ids = vec!["list", "read", "probe"];
        let tools = get_dynamic_tools(project_root, tool_ids);

        // 🏆 核心断言：验证动态工具管线逻辑
        assert!(tools.len() > 0);
        let first_tool = &tools[0];
        assert_eq!(first_tool["type"], "function");
    }
}
