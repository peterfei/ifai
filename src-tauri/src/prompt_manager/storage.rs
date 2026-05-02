use crate::prompt_manager::{PromptMetadata, PromptTemplate};
use anyhow::{Context, Result};
use regex::Regex;
use std::fs;
use std::path::Path;

pub fn validate_prompt_content(content: &str) -> Result<(), String> {
    let dangerous_patterns = [
        r"(?i)ignore\s+previous\s+instructions",
        r"(?i)forget\s+everything\s+we\s+talked",
        r"(?i)you\s+are\s+now\s+a",
        r"(?i)system\s*:\s*",
    ];

    for pattern in dangerous_patterns {
        if let Ok(re) = Regex::new(pattern) {
            if re.is_match(content) {
                return Err(format!(
                    "Potential prompt injection detected: '{}'",
                    pattern
                ));
            }
        }
    }
    Ok(())
}

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
        raw_text: content.to_string(), // Store full text
        path,
    })
}

pub fn parse_front_matter(content: &str) -> Result<(PromptMetadata, &str)> {
    let trimmed = content.trim_start();

    // Using a more robust manual split to avoid regex ownership issues
    if !trimmed.starts_with("---") {
        return Err(anyhow::anyhow!(
            "Invalid format: Prompt must start with '---'"
        ));
    }

    let after_first = &trimmed[3..];
    if let Some(end_offset) = after_first.find("---") {
        let yaml_str = &after_first[..end_offset].trim();
        let markdown_content = &after_first[end_offset + 3..];

        match serde_yaml::from_str::<PromptMetadata>(yaml_str) {
            Ok(metadata) => return Ok((metadata, markdown_content)),
            Err(e) => {
                return Err(anyhow::anyhow!("YAML validation failed. Please ensure your metadata block is a valid map (key: value). Detail: {}", e));
            }
        }
    }

    Err(anyhow::anyhow!(
        "Invalid format: Closing '---' not found for metadata block."
    ))
}
