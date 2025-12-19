use std::fs;
use std::path::Path;
use anyhow::{Result, Context};
use crate::prompt_manager::{PromptMetadata, PromptTemplate};

pub fn load_prompt(path: &Path) -> Result<PromptTemplate> {
    let content = fs::read_to_string(path)
        .with_context(|| format!("Failed to read prompt file: {:?}", path))?;

    load_prompt_from_str(&content, Some(path.to_string_lossy().to_string()))
}

pub fn load_prompt_from_str(content: &str, path: Option<String>) -> Result<PromptTemplate> {
    let (metadata, markdown_content) = parse_front_matter(content)?;

    Ok(PromptTemplate {
        metadata,
        content: markdown_content.to_string(),
        path,
    })
}

pub fn parse_front_matter(content: &str) -> Result<(PromptMetadata, &str)> {
    let trimmed = content.trim_start();
    if trimmed.starts_with("---") {
        let after_start = &trimmed[3..];
        if let Some(end) = after_start.find("---") {
            let yaml_str = &after_start[..end];
            match serde_yaml::from_str::<PromptMetadata>(yaml_str) {
                Ok(metadata) => return Ok((metadata, after_start[end+3..].trim_start())),
                Err(e) => {
                    eprintln!("[PromptStorage] YAML Parse Error: {}", e);
                    eprintln!("[PromptStorage] Bad YAML content:\n{}", yaml_str);
                    return Err(anyhow::anyhow!("YAML parsing failed: {}", e));
                }
            }
        }
    }
    
    Err(anyhow::anyhow!("Invalid prompt format: Missing YAML front matter starting with ---"))
}