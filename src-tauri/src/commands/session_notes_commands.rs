/**
 * Section 5.2: 会话笔记 Tauri 命令
 *
 * 提供会话笔记的创建、更新、查询和导出功能
 */

use crate::conversation::notes::SessionNotes;
use std::fs;
use std::path::PathBuf;

/**
 * 创建新的会话笔记
 *
 * @param session_id - 会话 ID
 * @param project_root - 项目根目录
 * @returns 创建的会话笔记
 */
#[tauri::command]
pub async fn create_session_notes(
    session_id: String,
    project_root: String,
) -> Result<SessionNotes, String> {
    Ok(SessionNotes::new(session_id, project_root))
}

/**
 * 从消息中自动提取笔记
 *
 * @param notes - 现有的会话笔记
 * @param messages - 消息数组
 * @returns 更新后的会话笔记
 */
#[tauri::command]
pub async fn extract_notes_from_messages(
    notes: SessionNotes,
    messages: Vec<crate::core_traits::ai::Message>,
) -> Result<SessionNotes, String> {
    // 克隆 notes 以避免所有权问题
    let mut updated_notes = notes.clone();
    updated_notes.extract_from_messages(&messages);
    Ok(updated_notes)
}

/**
 * 添加技术概念到笔记
 *
 * @param notes - 现有的会话笔记
 * @param name - 概念名称
 * @param description - 概念描述
 * @param category - 概念分类
 * @returns 更新后的会话笔记
 */
#[tauri::command]
pub async fn add_tech_concept(
    notes: SessionNotes,
    name: String,
    description: String,
    category: String,
) -> Result<SessionNotes, String> {
    let mut updated_notes = notes.clone();
    updated_notes.add_concept(name, description, category);
    Ok(updated_notes)
}

/**
 * 添加文件变更到笔记
 *
 * @param notes - 现有的会话笔记
 * @param path - 文件路径
 * @param action - 操作类型
 * @param reason - 变更原因
 * @returns 更新后的会话笔记
 */
#[tauri::command]
pub async fn add_file_change_to_notes(
    notes: SessionNotes,
    path: String,
    action: String,
    reason: String,
) -> Result<SessionNotes, String> {
    let mut updated_notes = notes.clone();
    updated_notes.add_file_change(path, action, reason);
    Ok(updated_notes)
}

/**
 * 添加错误修复记录到笔记
 *
 * @param notes - 现有的会话笔记
 * @param error_message - 错误消息
 * @param error_type - 错误类型
 * @param solution - 解决方案
 * @param file_path - 相关文件路径（可选）
 * @returns 更新后的会话笔记
 */
#[tauri::command]
pub async fn add_error_fix_to_notes(
    notes: SessionNotes,
    error_message: String,
    error_type: String,
    solution: String,
    file_path: Option<String>,
) -> Result<SessionNotes, String> {
    let mut updated_notes = notes.clone();
    updated_notes.add_error_fix(error_message, error_type, solution, file_path);
    Ok(updated_notes)
}

/**
 * 添加待办任务到笔记
 *
 * @param notes - 现有的会话笔记
 * @param description - 任务描述
 * @param priority - 优先级
 * @returns 更新后的会话笔记
 */
#[tauri::command]
pub async fn add_todo_task_to_notes(
    notes: SessionNotes,
    description: String,
    priority: String,
) -> Result<SessionNotes, String> {
    let mut updated_notes = notes.clone();
    updated_notes.add_todo_task(description, priority);
    Ok(updated_notes)
}

/**
 * 更新待办任务状态
 *
 * @param notes - 现有的会话笔记
 * @param task_id - 任务 ID
 * @param status - 新状态
 * @returns 更新后的会话笔记
 */
#[tauri::command]
pub async fn update_todo_task_status(
    notes: SessionNotes,
    task_id: String,
    status: String,
) -> Result<SessionNotes, String> {
    let mut updated_notes = notes.clone();
    updated_notes.update_todo_status(task_id, status);
    Ok(updated_notes)
}

/**
 * 生成笔记摘要
 *
 * @param notes - 现有的会话笔记
 * @returns 更新后的会话笔记（包含生成的摘要）
 */
#[tauri::command]
pub async fn generate_notes_summary(
    notes: SessionNotes,
) -> Result<SessionNotes, String> {
    let mut updated_notes = notes.clone();
    updated_notes.generate_summary();
    Ok(updated_notes)
}

/**
 * 导出笔记为 Markdown
 *
 * @param notes - 会话笔记
 * @returns Markdown 格式的字符串
 */
#[tauri::command]
pub async fn export_notes_to_markdown(
    notes: SessionNotes,
) -> Result<String, String> {
    Ok(notes.to_markdown())
}

/**
 * 导出笔记为 JSON
 *
 * @param notes - 会话笔记
 * @returns JSON 格式的字符串
 */
#[tauri::command]
pub async fn export_notes_to_json(
    notes: SessionNotes,
) -> Result<String, String> {
    notes.to_json()
}

/**
 * 从 JSON 导入笔记
 *
 * @param json - JSON 字符串
 * @returns 导入的会话笔记
 */
#[tauri::command]
pub async fn import_notes_from_json(
    json: String,
) -> Result<SessionNotes, String> {
    SessionNotes::from_json(&json)
}

/**
 * 保存笔记到文件
 *
 * @param notes - 会话笔记
 * @returns 保存的文件路径
 */
#[tauri::command]
pub async fn save_session_notes(
    notes: SessionNotes,
) -> Result<String, String> {
    // 创建笔记目录
    let notes_dir = PathBuf::from(&notes.project_root)
        .join(".ifai")
        .join("sessions")
        .join("notes");

    fs::create_dir_all(&notes_dir)
        .map_err(|e| format!("Failed to create notes directory: {}", e))?;

    // 生成文件名
    let file_name = format!("{}.json", notes.session_id);
    let file_path = notes_dir.join(&file_name);

    // 序列化并保存
    let json = notes.to_json()?;
    fs::write(&file_path, json)
        .map_err(|e| format!("Failed to write notes file: {}", e))?;

    Ok(file_path.to_string_lossy().to_string())
}

/**
 * 加载笔记文件
 *
 * @param project_root - 项目根目录
 * @param session_id - 会话 ID
 * @returns 加载的会话笔记
 */
#[tauri::command]
pub async fn load_session_notes(
    project_root: String,
    session_id: String,
) -> Result<SessionNotes, String> {
    let notes_dir = PathBuf::from(&project_root)
        .join(".ifai")
        .join("sessions")
        .join("notes");

    let file_name = format!("{}.json", session_id);
    let file_path = notes_dir.join(&file_name);

    let content = fs::read_to_string(&file_path)
        .map_err(|e| format!("Failed to read notes file: {}", e))?;

    SessionNotes::from_json(&content)
}

/**
 * 列出所有会话笔记
 *
 * @param project_root - 项目根目录
 * @returns 会话笔记 ID 列表
 */
#[tauri::command]
pub async fn list_session_notes(
    project_root: String,
) -> Result<Vec<String>, String> {
    let notes_dir = PathBuf::from(&project_root)
        .join(".ifai")
        .join("sessions")
        .join("notes");

    if !notes_dir.exists() {
        return Ok(Vec::new());
    }

    let entries = fs::read_dir(&notes_dir)
        .map_err(|e| format!("Failed to read notes directory: {}", e))?;

    let mut session_ids = Vec::new();
    for entry in entries {
        let entry = entry.map_err(|e| format!("Failed to read entry: {}", e))?;
        let path = entry.path();

        if path.extension().and_then(|s| s.to_str()) == Some("json") {
            if let Some(file_stem) = path.file_stem().and_then(|s| s.to_str()) {
                session_ids.push(file_stem.to_string());
            }
        }
    }

    Ok(session_ids)
}
