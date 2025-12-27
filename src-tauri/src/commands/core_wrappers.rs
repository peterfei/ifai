use crate::AppState;
use crate::core_traits::rag::RagResult;

#[tauri::command]
pub async fn init_rag_index(
    _app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    root_path: String
) -> Result<(), String> {
    state.rag_service.index_project(&root_path).await
}

#[tauri::command]
pub async fn search_semantic(
    state: tauri::State<'_, AppState>,
    query: String,
    limit: usize
) -> Result<Vec<String>, String> {
    state.rag_service.search(&query, limit).await
}

#[tauri::command]
pub async fn search_hybrid(
    state: tauri::State<'_, AppState>,
    query: String,
    limit: usize
) -> Result<Vec<String>, String> {
    state.rag_service.search(&query, limit).await
}

#[tauri::command]
pub async fn build_context(
    state: tauri::State<'_, AppState>,
    query: String,
    root_path: String
) -> Result<RagResult, String> {
    state.rag_service.retrieve_context(&query, &root_path).await
}

// FS / Agent Tools Wrappers
// NOTE: Signatures must match ifainew_core implementation as frontend relies on it

#[tauri::command]
pub async fn agent_write_file(root_path: String, rel_path: String, content: String) -> Result<String, String> {
    #[cfg(feature = "commercial")]
    {
        return ifainew_core::agent::agent_write_file(root_path, rel_path, content).await;
    }
    #[cfg(not(feature = "commercial"))]
    {
        let path = std::path::Path::new(&root_path).join(&rel_path);
        if let Some(parent) = path.parent() {
            let _ = tokio::fs::create_dir_all(parent).await;
        }
        tokio::fs::write(&path, &content).await.map_err(|e| e.to_string())?;
        Ok("File written successfully".to_string())
    }
}

#[tauri::command]
pub async fn agent_read_file(root_path: String, rel_path: String) -> Result<String, String> {
    #[cfg(feature = "commercial")]
    {
        return ifainew_core::agent::agent_read_file(root_path, rel_path).await;
    }
    #[cfg(not(feature = "commercial"))]
    {
        let path = std::path::Path::new(&root_path).join(&rel_path);
        tokio::fs::read_to_string(&path).await.map_err(|e| e.to_string())
    }
}

#[tauri::command]
pub async fn agent_list_dir(root_path: String, rel_path: String) -> Result<Vec<String>, String> {
    #[cfg(feature = "commercial")]
    {
        return ifainew_core::agent::agent_list_dir(root_path, rel_path).await;
    }
    #[cfg(not(feature = "commercial"))]
    {
        let path = std::path::Path::new(&root_path).join(&rel_path);
        let mut entries = Vec::new();
        let mut read_dir = tokio::fs::read_dir(&path).await.map_err(|e| e.to_string())?;
        while let Ok(Some(entry)) = read_dir.next_entry().await {
            if let Ok(name) = entry.file_name().into_string() {
                entries.push(name);
            }
        }
        Ok(entries)
    }
}

/// Batch read multiple files in parallel
/// Returns a JSON string with results for each file
#[tauri::command]
pub async fn agent_batch_read(root_path: String, paths: Vec<String>) -> Result<String, String> {
    use serde_json::json;

    // Read files in parallel using futures
    let futures: Vec<_> = paths.into_iter().map(|rel_path| {
        let root = root_path.clone();
        async move {
            let path = std::path::Path::new(&root).join(&rel_path);
            match tokio::fs::read_to_string(&path).await {
                Ok(content) => (rel_path, Some(content)),
                Err(e) => (rel_path, None::<String>),
            }
        }
    }).collect();

    let results = futures::future::join_all(futures).await;

    // Build JSON response
    let json_results: Vec<serde_json::Value> = results.into_iter().map(|(path, content)| {
        match content {
            Some(c) => json!({
                "path": path,
                "status": "success",
                "content": c
            }),
            None => json!({
                "path": path,
                "status": "error",
                "error": "File not found or cannot be read"
            })
        }
    }).collect();

    serde_json::to_string(&json_results).map_err(|e| e.to_string())
}

/// Scan directory and return structured file tree
/// Supports glob patterns and file limits
#[tauri::command]
pub async fn agent_scan_directory(
    root_path: String,
    rel_path: String,
    pattern: Option<String>,
    max_depth: Option<usize>,
    max_files: Option<usize>
) -> Result<String, String> {
    use serde_json::json;
    use glob::glob;
    use std::path::Path;

    let base_path = Path::new(&root_path).join(&rel_path);
    let max_files = max_files.unwrap_or(500);
    let max_depth = max_depth.unwrap_or(10);

    // Build glob pattern
    let glob_pattern = if let Some(p) = &pattern {
        // Use provided pattern (e.g., "**/*.ts")
        if p.starts_with('/') || p.starts_with('.') {
            // Absolute or relative pattern
            Path::new(&root_path).join(p).to_string_lossy().to_string()
        } else {
            // Simple pattern like "*.ts", apply to current directory
            format!("{}/**/{}", base_path.to_string_lossy(), p)
        }
    } else {
        // Default: match all files
        format!("{}/**/*", base_path.to_string_lossy())
    };

    let mut files: Vec<String> = Vec::new();
    let mut directories: Vec<String> = Vec::new();

    // Use glob to match files
    match glob(&glob_pattern) {
        Ok(entries) => {
            let mut count = 0;
            for entry in entries {
                if count >= max_files {
                    break;
                }

                match entry {
                    Ok(path) => {
                        // Skip if not inside root_path
                        if !path.starts_with(&root_path) {
                            continue;
                        }

                        // Convert to relative path
                        let rel = path.strip_prefix(&root_path)
                            .unwrap_or(&path)
                            .to_string_lossy()
                            .to_string();

                        // Check depth
                        let depth = rel.matches('/').count();
                        if depth > max_depth {
                            continue;
                        }

                        // Check if directory
                        if path.is_dir() {
                            directories.push(rel);
                        } else {
                            files.push(rel);
                            count += 1;
                        }
                    },
                    Err(_) => continue,
                }
            }
        },
        Err(e) => {
            return Err(format!("Invalid glob pattern: {}", e));
        }
    }

    // Sort results
    files.sort();
    directories.sort();

    // Build response
    let result = json!({
        "basePath": rel_path,
        "pattern": pattern,
        "files": files,
        "directories": directories,
        "stats": {
            "totalFiles": files.len(),
            "totalDirectories": directories.len(),
            "maxFilesReached": files.len() >= max_files
        }
    });

    serde_json::to_string(&result).map_err(|e| e.to_string())
}