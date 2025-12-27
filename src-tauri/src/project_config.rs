use tauri::command;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::fs;

/// Project-level configuration from `.ifai/IFAI.md`
///
/// This configuration is per-project and stored in the project root directory.
/// Users can edit the IFAI.md file directly to change settings.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ProjectConfig {
    /// Default language for this project (e.g., "zh-CN", "en-US")
    pub default_language: Option<String>,

    /// Project-specific AI provider settings
    pub ai_provider_id: Option<String>,

    /// Project-specific AI model
    pub ai_model: Option<String>,

    /// Whether RAG is enabled for this project
    pub enable_rag: Option<bool>,

    /// Custom system prompt for this project
    pub custom_system_prompt: Option<String>,

    /// Custom instructions for LLM (user editable)
    pub custom_instructions: Option<String>,

    /// Project creation timestamp
    pub created_at: Option<i64>,
}

impl Default for ProjectConfig {
    fn default() -> Self {
        Self {
            default_language: Some("zh-CN".to_string()), // Default to Chinese
            ai_provider_id: None,
            ai_model: None,
            enable_rag: None,
            custom_system_prompt: None,
            custom_instructions: None,
            created_at: Some(chrono::Utc::now().timestamp()),
        }
    }
}

/// Get the path to `.ifai/IFAI.md` for a project root
fn get_config_path(project_root: &str) -> Result<PathBuf, String> {
    let root = Path::new(project_root);
    let ifai_dir = root.join(".ifai");
    Ok(ifai_dir.join("IFAI.md"))
}

/// Get the default IFAI.md content
fn get_default_content() -> String {
    r#"---
# IFAI Project Configuration
# You can edit these settings directly

# Default language for this project
default_language: zh-CN

# AI provider (optional, overrides global settings)
# ai_provider_id: zhipu
# ai_model: glm-4.6

# Custom instructions for AI responses
# These instructions will be included in the system prompt
custom_instructions: |
  请使用中文回答所有问题，除非用户明确要求使用其他语言。

---

# Project Notes
## 项目说明

这个目录包含项目的 IFAI 配置文件。你可以：

1. **编辑上方的 YAML 配置**：修改项目级别的设置
2. **添加项目说明**：在这里记录项目相关的笔记
3. **团队协作**：将此文件提交到版本控制，共享项目配置

### 配置项说明

- `default_language`: 项目默认语言 (zh-CN, en-US)
- `ai_provider_id`: AI 提供商 ID (可选)
- `ai_model`: AI 模型名称 (可选)
- `custom_instructions`: 自定义指令，会添加到系统提示中

### 示例

```yaml
default_language: en-US
custom_instructions: |
  Always respond in English.
  Use technical terminology appropriate for software engineers.
```
"#.to_string()
}

/// Parse YAML frontmatter from markdown content
fn parse_frontmatter(content: &str) -> Result<ProjectConfig, String> {
    // Check if content starts with ---
    if !content.starts_with("---") {
        return Ok(ProjectConfig::default());
    }

    // Find the end of frontmatter (second ---)
    let after_first = &content[3..];
    if let Some(end_pos) = after_first.find("\n---") {
        let yaml_content = &after_first[..end_pos];

        // Parse YAML
        serde_yaml::from_str(yaml_content)
            .map_err(|e| format!("Failed to parse YAML frontmatter: {}", e))
    } else {
        // No closing --- found, treat as no frontmatter
        Ok(ProjectConfig::default())
    }
}

/// Load project configuration synchronously (for internal use)
///
/// This is a synchronous version for use in non-async contexts like prompt_manager
pub fn load_project_config_sync(project_root: &str) -> Option<ProjectConfig> {
    let config_path = get_config_path(project_root).ok()?;

    if !config_path.exists() {
        return None;
    }

    let content = fs::read_to_string(&config_path).ok()?;
    parse_frontmatter(&content).ok()
}

/// Load project configuration from `.ifai/IFAI.md`
///
/// If the config file doesn't exist, creates a new default config file.
#[command]
pub async fn load_project_config(project_root: String) -> Result<String, String> {
    let config_path = get_config_path(&project_root)?;

    // Try to load existing file
    if config_path.exists() {
        match fs::read_to_string(&config_path) {
            Ok(content) => {
                // Return the full content (including markdown notes)
                return Ok(content);
            }
            Err(e) => {
                eprintln!("[ProjectConfig] Failed to read config file: {}", e);
                // Fall through to create default
            }
        }
    }

    // Create default config file
    let default_content = get_default_content();
    save_project_config_internal(&config_path, &default_content)?;

    Ok(default_content)
}

/// Save project configuration to `.ifai/IFAI.md`
///
/// Saves the full content (YAML frontmatter + markdown)
#[command]
pub async fn save_project_config(
    project_root: String,
    content: String,
) -> Result<(), String> {
    let config_path = get_config_path(&project_root)?;
    save_project_config_internal(&config_path, &content)
}

/// Internal helper to save config
fn save_project_config_internal(
    config_path: &PathBuf,
    content: &str,
) -> Result<(), String> {
    // Ensure .ifai directory exists
    if let Some(parent) = config_path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create .ifai directory: {}", e))?;
    }

    // Write to file
    fs::write(config_path, content)
        .map_err(|e| format!("Failed to write config file: {}", e))?;

    Ok(())
}

/// Parse configuration from IFAI.md content
#[command]
pub async fn parse_project_config(content: String) -> Result<ProjectConfig, String> {
    parse_frontmatter(&content)
}

/// Check if `.ifai/IFAI.md` exists for a project
#[command]
pub async fn project_config_exists(project_root: String) -> Result<bool, String> {
    let config_path = get_config_path(&project_root)?;
    Ok(config_path.exists())
}

/// Delete project configuration (for testing purposes)
#[command]
pub async fn delete_project_config(project_root: String) -> Result<(), String> {
    let config_path = get_config_path(&project_root)?;

    if config_path.exists() {
        fs::remove_file(&config_path)
            .map_err(|e| format!("Failed to delete config file: {}", e))?;
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_frontmatter() {
        let content = r#"---
default_language: zh-CN
ai_provider_id: zhipu
custom_instructions: |
  请使用中文回答
---

# Notes
Some notes here
"#;

        let config = parse_frontmatter(content).unwrap();
        assert_eq!(config.default_language, Some("zh-CN".to_string()));
        assert_eq!(config.ai_provider_id, Some("zhipu".to_string()));
        // YAML scalar 自动去掉了末尾换行符
        assert_eq!(config.custom_instructions, Some("请使用中文回答".to_string()));
    }

    #[test]
    fn test_parse_en_language() {
        let content = r#"---
default_language: en-US
custom_instructions: |
  Please respond in English.
---

# Project Notes
"#;

        let config = parse_frontmatter(content).unwrap();
        assert_eq!(config.default_language, Some("en-US".to_string()));
        // YAML scalar 自动去掉了末尾换行符和句点
        assert_eq!(config.custom_instructions, Some("Please respond in English.".to_string()));
    }

    #[test]
    fn test_parse_no_frontmatter() {
        let content = r#"# Just markdown
No frontmatter here
"#;

        let config = parse_frontmatter(content).unwrap();
        assert_eq!(config, ProjectConfig::default());
    }
}
