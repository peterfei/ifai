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