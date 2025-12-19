use std::collections::HashMap;
use std::path::PathBuf;
use std::fs;
use crate::prompt_manager::{PromptMetadata, PromptTemplate, BuiltinPrompts};
use crate::prompt_manager::storage;
use crate::prompt_manager::template;
use walkdir::WalkDir;

fn get_prompt_root(project_root: &str) -> PathBuf {
    PathBuf::from(project_root).join(".ifai/prompts")
}

#[tauri::command]
pub async fn list_prompts(project_root: String) -> Result<Vec<PromptTemplate>, String> {
    let mut prompts = Vec::new();

    // 1. Load Builtin Prompts from Binary
    for file_path in BuiltinPrompts::iter() {
        if file_path.ends_with(".md") {
            if let Some(content_file) = BuiltinPrompts::get(&file_path) {
                let content = std::str::from_utf8(content_file.data.as_ref()).unwrap_or("");
                match storage::load_prompt_from_str(content, None) {
                    Ok(mut template) => {
                        template.path = Some(format!("builtin://{}", file_path));
                        // Mark as protected if it's in system dir
                        if file_path.starts_with("system/") {
                            template.metadata.access_tier = crate::prompt_manager::AccessTier::Protected;
                        }
                        prompts.push(template);
                    },
                    Err(e) => eprintln!("[PromptManager] Failed to load builtin prompt {}: {}", file_path, e),
                }
            }
        }
    }

    // 2. Load Project Prompts from File System
    let root = get_prompt_root(&project_root);
    if root.exists() {
        for entry in WalkDir::new(&root).into_iter().filter_map(|e| e.ok()) {
            if entry.path().is_file() && entry.path().extension().map_or(false, |ext| ext == "md") {
                match storage::load_prompt(entry.path()) {
                    Ok(mut template) => {
                        if let Ok(rel) = entry.path().strip_prefix(&root) {
                             template.path = Some(rel.to_string_lossy().to_string());
                        }
                        prompts.push(template);
                    },
                    Err(e) => eprintln!("[PromptManager] Failed to load local prompt {:?}: {}", entry.path(), e),
                }
            }
        }
    } else {
        println!("[PromptManager] No local prompts found at {:?}", root);
    }

    println!("[PromptManager] Returning {} total prompts (Builtin + Local)", prompts.len());
    Ok(prompts)
}

#[tauri::command]
pub async fn get_prompt(project_root: String, path: String) -> Result<PromptTemplate, String> {
    if path.starts_with("builtin://") {
        let internal_path = &path[10..];
        if let Some(content_file) = BuiltinPrompts::get(internal_path) {
            let content = std::str::from_utf8(content_file.data.as_ref()).unwrap_or("");
            return storage::load_prompt_from_str(content, Some(path))
                .map_err(|e| e.to_string());
        }
        return Err("Builtin prompt not found".to_string());
    }

    let root = get_prompt_root(&project_root);
    let full_path = root.join(&path);
    storage::load_prompt(&full_path).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_prompt(project_root: String, path: String, content: String) -> Result<(), String> {
    if path.starts_with("builtin://") {
        return Err("Cannot directly modify builtin prompts. Use 'Override' instead (coming soon).".to_string());
    }

    let root = get_prompt_root(&project_root);
    let full_path = root.join(&path);
    
    if let Some(parent) = full_path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }

    let _ = storage::parse_front_matter(&content).map_err(|e| e.to_string())?;
    fs::write(full_path, content).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn render_prompt_template(content: String, variables: HashMap<String, String>) -> Result<String, String> {
    template::render_template(&content, &variables).map_err(|e| e.to_string())
}