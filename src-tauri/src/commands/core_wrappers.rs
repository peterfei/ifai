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

/// Scan directory recursively with progress callback
/// Sends explore_progress events as each directory is scanned
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

    // Common ignore directories
    let ignore_dirs = [
        ".git", ".github", ".vscode", ".idea",
        "node_modules", ".next", ".nuxt",
        "dist", "build", "target", "out",
        ".cache", "coverage", ".tsbuildinfo",
        "vendor", "bower_components"
    ];

    let mut files: Vec<String> = Vec::new();
    let mut directories: Vec<String> = Vec::new();
    let mut scanned_count = 0;
    let mut by_directory: HashMap<String, ScanStatus> = HashMap::new();

    // First pass: count total directories to calculate progress
    fn count_directories(path: &Path, max_depth: usize, current_depth: usize, ignore_dirs: &[&str]) -> usize {
        if current_depth > max_depth {
            return 0;
        }

        let mut count = 0;
        if let Ok(entries) = std::fs::read_dir(path) {
            for entry in entries.flatten() {
                let entry_path = entry.path();
                if entry_path.is_symlink() {
                    continue;
                }
                if entry_path.is_dir() {
                    // Check if directory should be ignored
                    let dir_name = entry_path.file_name()
                        .and_then(|n| n.to_str())
                        .unwrap_or("");

                    if ignore_dirs.contains(&dir_name) {
                        continue;
                    }

                    count += 1;
                    count += count_directories(&entry_path, max_depth, current_depth + 1, ignore_dirs);
                }
            }
        }
        count
    }

    let total_directories = count_directories(&base_path, max_depth, 0, &ignore_dirs);
    // Add 1 for the root directory itself
    let total_estimate = if total_directories > 0 { total_directories + 1 } else { 1 };

    // Recursive scan function
    fn scan_recursive(
        app: &tauri::AppHandle,
        event_id: &str,
        root_path: &Path,
        current_path: &Path,
        base_rel: &str,
        current_depth: usize,
        max_depth: usize,
        max_files: usize,
        files: &mut Vec<String>,
        directories: &mut Vec<String>,
        scanned_count: &mut usize,
        by_directory: &mut HashMap<String, ScanStatus>,
        total_estimate: usize,
        dirs_scanned: &mut usize,
        ignore_dirs: &[&str],
    ) -> Result<(), String> {
        // Check depth limit
        if current_depth > max_depth {
            return Ok(());
        }

        // Check file count limit
        if files.len() >= max_files {
            return Ok(());
        }

        // Read directory entries
        let entries = std::fs::read_dir(current_path)
            .map_err(|e| format!("Failed to read directory: {}", e))?;

        // Get relative path for this directory
        let rel_path = current_path.strip_prefix(root_path)
            .unwrap_or(current_path)
            .to_string_lossy()
            .to_string();
        let display_path = if rel_path.is_empty() { base_rel.to_string() } else { format!("{}/{}", base_rel, rel_path) };

        // Update directory status to "scanning" and send initial event
        by_directory.insert(display_path.clone(), ScanStatus {
            total: total_estimate,
            scanned: *dirs_scanned,
            status: "scanning".to_string(),
        });

        // Collect subdirectories to scan after processing files
        let mut subdirs_to_scan: Vec<(String, std::path::PathBuf)> = Vec::new();

        // Scan entries
        for entry in entries {
            if files.len() >= max_files {
                break;
            }

            let entry = entry.map_err(|e| format!("Failed to read entry: {}", e))?;
            let path = entry.path();

            // Skip symlinks to avoid infinite loops
            if path.is_symlink() {
                continue;
            }

            // Get relative path
            let rel = path.strip_prefix(root_path)
                .unwrap_or(&path)
                .to_string_lossy()
                .to_string();
            let full_rel = if rel.is_empty() { base_rel.to_string() } else { format!("{}/{}", base_rel, rel) };

            if path.is_dir() {
                // Check if directory should be ignored
                let dir_name = path.file_name()
                    .and_then(|n| n.to_str())
                    .unwrap_or("");

                if ignore_dirs.contains(&dir_name) {
                    continue; // Skip ignored directories
                }

                // Add to directories list
                directories.push(full_rel.clone());

                // Mark as pending for now, will be updated to "scanning" when we process it
                by_directory.insert(full_rel.clone(), ScanStatus {
                    total: total_estimate,
                    scanned: *dirs_scanned,
                    status: "pending".to_string(),
                });

                // Collect for recursive scan later
                subdirs_to_scan.push((full_rel, path));
            } else {
                // Add file and send progress event for this file
                files.push(full_rel.clone());
                *scanned_count += 1;

                // Send progress event for this file (dynamic effect)
                // Use the current directory path as currentPath, file as currentFile
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

                // Extract directory from file path for currentPath
                let file_dir = if let Some(pos) = full_rel.rfind('/') {
                    &full_rel[..pos]
                } else {
                    "."
                };

                let progress = json!({
                    "type": "explore_progress",
                    "exploreProgress": {
                        "phase": "scanning",
                        "currentPath": file_dir,
                        "currentFile": &full_rel,
                        "progress": {
                            "total": total_estimate,
                            "scanned": *dirs_scanned,
                            "byDirectory": by_dir_serializable
                        }
                    }
                });
                println!("[DEBUG] [RUST CORE_WRAPPERS:440] Emitting explore_progress: event_id={}, currentFile={}", event_id, &full_rel);
                let _ = app.emit(event_id, progress);
                println!("[DEBUG] [RUST CORE_WRAPPERS:441] Event emitted successfully");
            }
        }

        // Send progress event showing current directory with subdirectories
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

        // Get the last scanned file to show as currentFile
        let last_file = files.last().map(|s| s.as_str());

        let progress = json!({
            "type": "explore_progress",
            "exploreProgress": {
                "phase": "scanning",
                "currentPath": &display_path,
                "currentFile": last_file,
                "progress": {
                    "total": total_estimate,
                    "scanned": *dirs_scanned,
                    "byDirectory": by_dir_serializable
                }
            }
        });
        let _ = app.emit(event_id, progress);

        // Now recursively scan subdirectories
        for (subdir_rel, subdir_path) in subdirs_to_scan {
            scan_recursive(
                app, event_id, root_path, &subdir_path, base_rel,
                current_depth + 1, max_depth, max_files,
                files, directories, scanned_count, by_directory,
                total_estimate, dirs_scanned, ignore_dirs,
            )?;
        }

        // Increment directory counter after scanning this directory
        *dirs_scanned += 1;

        // Mark current directory as completed
        by_directory.insert(display_path.clone(), ScanStatus {
            total: total_estimate,
            scanned: *dirs_scanned,
            status: "completed".to_string(),
        });

        Ok(())
    }

    let mut dirs_scanned = 0;

    // Start recursive scan
    scan_recursive(
        app, event_id, &base_path, &base_path, &rel_path, 0, max_depth, max_files,
        &mut files, &mut directories, &mut scanned_count, &mut by_directory, total_estimate,
        &mut dirs_scanned, &ignore_dirs,
    )?;

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