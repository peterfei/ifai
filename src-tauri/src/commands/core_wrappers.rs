use crate::AppState;
use crate::core_traits::rag::RagResult;

// For optimized directory scanning
use walkdir::WalkDir;

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

    // Directories to ignore during scan
    let ignore_dirs = [
        "node_modules", ".git", "target", "dist", "build",
        ".vscode", ".idea", "coverage", ".next", ".nuxt",
        ".venv", "venv", "__pycache__", "node_modules_cache"
    ];

    // Files to ignore during scan
    let ignore_files = [
        ".DS_Store", "*.log", "*.tsbuildinfo"
    ];

    // Helper to check if a path should be ignored
    let should_ignore_path = |path: &str, is_dir: bool| -> bool {
        let path_lower = path.to_lowercase();

        // Check if path is in or contains an ignored directory
        for ignore_dir in &ignore_dirs {
            let pattern = format!("/{}/", ignore_dir);
            if path_lower.contains(&pattern) || path_lower.starts_with(&format!("{}/", ignore_dir)) {
                return true;
            }
        }

        // For files, also check file patterns
        if !is_dir {
            for ignore_file in &ignore_files {
                if ignore_file.starts_with('*') {
                    let ext = &ignore_file[1..];
                    if path_lower.ends_with(ext) {
                        return true;
                    }
                } else {
                    if path.ends_with(ignore_file) || path == *ignore_file {
                        return true;
                    }
                }
            }
        }

        false
    };

    // Build glob pattern
    let glob_pattern = if let Some(p) = &pattern {
        // Use provided pattern (e.g., "**/*.ts")
        if p.starts_with('/') || p.starts_with('.') {
            // Absolute or relative pattern
            Path::new(&root_path).join(p).to_string_lossy().to_string()
        } else if p == "**" {
            // Special case: "**" means all files recursively
            format!("{}/**/*", base_path.to_string_lossy())
        } else if p.starts_with("**/") || p.contains("/**/") {
            // Pattern already contains recursive wildcards, use as-is
            format!("{}/{}", base_path.to_string_lossy(), p)
        } else {
            // Simple pattern like "*.ts", apply to current directory
            format!("{}/**/{}", base_path.to_string_lossy(), p)
        }
    } else {
        // Default: match all files
        format!("{}/**/*", base_path.to_string_lossy())
    };

    println!("[agent_scan_directory] glob_pattern = {}", glob_pattern);

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

                        // Skip ignored paths
                        let is_dir = path.is_dir();
                        if should_ignore_path(&rel, is_dir) {
                            continue;
                        }

                        // Check if directory
                        if is_dir {
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

/// Scan directory recursively with progress callback
/// Sends explore_progress events as each directory is scanned
/// Uses walkdir for high performance
pub async fn agent_scan_directory_with_progress(
    app: &tauri::AppHandle,
    event_id: &str,
    root_path: String,
    rel_path: String,
    pattern: Option<String>,
    max_depth: Option<usize>,
    max_files: Option<usize>
) -> Result<String, String> {
    use serde_json::json;
    use std::path::Path;
    use std::collections::HashMap;
    use tauri::Emitter;

    #[derive(Clone, serde::Serialize)]
    struct ScanStatus {
        total: usize,
        scanned: usize,
        status: String,
    }

    let base_path = Path::new(&root_path).join(&rel_path);
    let max_files = max_files.unwrap_or(500);
    let max_depth = max_depth.unwrap_or(10);

    // Hardcoded ignore directories (simple and reliable)
    let ignore_dirs = [
        ".git", ".github", ".vscode", ".idea",
        "node_modules", ".next", ".nuxt",
        "dist", "build", "target", "out",
        ".cache", "coverage", ".tsbuildinfo",
        "vendor", "bower_components",
        "__pycache__", "node_modules", ".venv", "venv"
    ];

    println!("[core_wrappers] Scan setup: depth={}, max_files={}", max_depth, max_files);

    // STEP 1: First pass - count total directories for progress
    let total_directories = WalkDir::new(&base_path)
        .max_depth(max_depth)
        .into_iter()
        .filter_map(|e| e.ok())
        .filter(|e| {
            let ft = e.file_type();
            ft.is_dir() && !ft.is_symlink()
        })
        .filter(|e| {
            // Filter out ignored directories
            e.path().file_name()
                .and_then(|n| n.to_str())
                .map_or(false, |name| !ignore_dirs.contains(&name))
        })
        .count();

    let total_estimate = total_directories.max(1);
    println!("[core_wrappers] Total directories: {}", total_estimate);

    // STEP 2: Scan with progress events and manual filtering
    let mut files: Vec<String> = Vec::new();
    let mut directories: Vec<String> = Vec::new();
    let mut by_directory: HashMap<String, ScanStatus> = HashMap::new();
    let mut dirs_scanned = 0;
    let mut current_dir_path: Option<String> = None;

    for entry in WalkDir::new(&base_path)
        .max_depth(max_depth)
        .into_iter()
        .filter_map(|e| e.ok())
    {
        let path = entry.path();
        let depth = entry.depth();

        // Skip if in ignored directory
        let is_ignored = path.ancestors()
            .any(|ancestor| {
                ancestor.file_name()
                    .and_then(|n| n.to_str())
                    .map_or(false, |name| ignore_dirs.contains(&name))
            });

        if is_ignored {
            continue;
        }

        // Get relative path
        let rel = path.strip_prefix(&base_path)
            .unwrap_or(path)
            .to_string_lossy()
            .to_string();
        let full_rel = if rel.is_empty() { rel_path.clone() } else { format!("{}/{}", rel_path, rel) };

        // Get directory path for this entry
        let file_dir = if let Some(pos) = full_rel.rfind('/') {
            &full_rel[..pos]
        } else {
            ""
        };
        let file_dir = if file_dir.is_empty() { &rel_path } else { file_dir };

        // Process directory entry
        if path.is_dir() {
            if !directories.contains(&full_rel) {
                directories.push(full_rel.clone());
            }

            by_directory.entry(full_rel.clone()).or_insert_with(|| ScanStatus {
                total: total_estimate,
                scanned: dirs_scanned,
                status: "scanning".to_string(),
            });

            continue;
        }

        // Check if we entered a new directory (for files)
        if current_dir_path.as_deref() != Some(file_dir) {
            if let Some(prev_dir) = &current_dir_path {
                by_directory.insert(prev_dir.clone(), ScanStatus {
                    total: total_estimate,
                    scanned: dirs_scanned,
                    status: "completed".to_string(),
                });

                dirs_scanned += 1;
            }

            by_directory.insert(file_dir.to_string(), ScanStatus {
                total: total_estimate,
                scanned: dirs_scanned,
                status: "scanning".to_string(),
            });

            current_dir_path = Some(file_dir.to_string());
        }

        // Process file
        if path.is_file() {
            files.push(full_rel.clone());

            // Emit per-file progress
            let by_dir_serializable: HashMap<String, serde_json::Value> = by_directory
                .iter()
                .map(|(k, v)| {
                    (k.clone(), json!({
                        "total": v.total,
                        "scanned": v.scanned,
                        "status": v.status
                    }))
                })
                .collect();

            let progress = json!({
                "type": "explore_progress",
                "exploreProgress": {
                    "phase": "scanning",
                    "currentPath": file_dir,
                    "currentFile": &full_rel,
                    "progress": {
                        "total": total_estimate,
                        "scanned": dirs_scanned,
                        "byDirectory": by_dir_serializable
                    }
                }
            });
            let _ = app.emit(event_id, progress);
        }

        if files.len() >= max_files {
            println!("[core_wrappers] Max files limit reached: {}", max_files);
            break;
        }
    }

    // Mark final directory as completed
    if let Some(last_dir) = &current_dir_path {
        by_directory.insert(last_dir.clone(), ScanStatus {
            total: total_estimate,
            scanned: dirs_scanned + 1,
            status: "completed".to_string(),
        });
    }

    println!("[core_wrappers] Scan complete: {} files, {} directories", files.len(), directories.len());

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