use tauri::{command};
use std::path::Path;
use std::fs;

#[command]
pub async fn agent_write_file(root_path: String, rel_path: String, content: String) -> Result<String, String> {
    // Basic sanitization
    if rel_path.contains("..") {
        return Err("Access denied: Relative paths not allowed".to_string());
    }

    let root = Path::new(&root_path);
    let target = root.join(&rel_path);
    
    // Create parent dirs
    if let Some(parent) = target.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    
    fs::write(&target, content).map_err(|e| e.to_string())?;
    Ok(format!("Successfully wrote to {}", rel_path))
}

#[command]
pub async fn agent_read_file(root_path: String, rel_path: String) -> Result<String, String> {
    if rel_path.contains("..") {
        return Err("Access denied".to_string());
    }

    let root = Path::new(&root_path);
    let target = root.join(&rel_path);
    
    fs::read_to_string(target).map_err(|e| e.to_string())
}

#[command]
pub async fn agent_list_dir(root_path: String, rel_path: String) -> Result<Vec<String>, String> {
    if rel_path.contains("..") {
        return Err("Access denied".to_string());
    }

    let root = Path::new(&root_path);
    let target = if rel_path.is_empty() || rel_path == "." {
        root.to_path_buf()
    } else {
        root.join(&rel_path)
    };
    
    let entries = fs::read_dir(target).map_err(|e| e.to_string())?;
    let mut names = Vec::new();
    for entry in entries {
        if let Ok(entry) = entry {
            let mut name = entry.file_name().to_string_lossy().to_string();
            if entry.path().is_dir() {
                name.push('/');
            }
            names.push(name);
        }
    }
    Ok(names)
}
