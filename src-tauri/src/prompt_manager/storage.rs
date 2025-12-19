use std::fs;
use std::path::Path;
use anyhow::{Result, Context};
use crate::prompt_manager::{PromptMetadata, PromptTemplate};
use regex::Regex;

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
                return Err(format!("Potential prompt injection detected: '{}'", pattern));
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
        path,
    })
}

pub fn parse_front_matter(content: &str) -> Result<(PromptMetadata, &str)> {
    let trimmed = content.trim_start();
    
    // Improved regex to find only the front matter block
    let re = Regex::new(r"(?s)^---\r?\n(.*?)\r?\n---\r?\n").map_err(|e| anyhow::anyhow!(e))?;
    
    if let Some(caps) = re.captures(trimmed) {
        // Get the full match so we know where the YAML block ends
        let full_match = caps.get(0).unwrap();
        let yaml_match = caps.get(1).unwrap();
        
        // Extract slices directly from 'trimmed' to avoid referencing the local 'caps' variable
        let yaml_str = &trimmed[yaml_match.start()..yaml_match.end()];
        let content_start = full_match.end();
        let markdown_content = &trimmed[content_start..];
        
        match serde_yaml::from_str::<PromptMetadata>(yaml_str) {
            Ok(metadata) => return Ok((metadata, markdown_content)),
            Err(e) => {
                eprintln!("[PromptStorage] YAML Parse Error: {}", e);
                eprintln!("[PromptStorage] Raw YAML content captured:\n{}", yaml_str);
                return Err(anyhow::anyhow!("YAML validation failed. Please check your metadata format (--- block). Detail: {}", e));
            }
        }
    }
    
    Err(anyhow::anyhow!("Invalid prompt format: File must start with a YAML front matter block delimited by ---"))
}