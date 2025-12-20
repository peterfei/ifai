use tauri::command;
use std::path::PathBuf;
use ignore::WalkBuilder;

#[command]
pub async fn get_all_file_paths(root_dir: String) -> Result<Vec<String>, String> {
    let root_path = PathBuf::from(root_dir);
    if !root_path.exists() {
        return Err(format!("Directory does not exist: {}", root_path.display()));
    }

    let mut file_paths = Vec::new();
    
    // Use ignore::WalkBuilder for high-performance, .gitignore-aware scanning
    for entry in WalkBuilder::new(&root_path)
        .standard_filters(true) // Respect .gitignore, .ignore, etc.
        .hidden(true)           // Skip hidden files (.git, etc.)
        .build()
        .filter_map(|e| e.ok())
        .filter(|e| e.file_type().map(|ft| ft.is_file()).unwrap_or(false))
    {
        if let Some(path_str) = entry.path().to_str() {
            file_paths.push(path_str.to_string());
        }
    }
    
    Ok(file_paths)
}
