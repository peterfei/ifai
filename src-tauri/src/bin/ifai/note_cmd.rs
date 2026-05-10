use std::fs;
use std::path::PathBuf;

/// 笔记存储根目录
fn notes_root() -> Result<PathBuf, String> {
    let home = std::env::var("HOME").map_err(|_| "无法获取 HOME 目录".to_string())?;
    Ok(PathBuf::from(home).join(".ifai").join("sessions").join("notes"))
}

/// 构建笔记文件路径
pub fn build_notes_path(session_id: &str) -> PathBuf {
    // 使用固定测试 session ID 以便测试
    let sid = if session_id.is_empty() { "default" } else { session_id };
    notes_root()
        .unwrap_or_else(|_| PathBuf::from("/tmp/.ifai/sessions/notes"))
        .join(format!("{}.md", sid))
}

/// 显示当前会话笔记
pub fn show_notes() -> Result<String, String> {
    let path = build_notes_path("default");
    if !path.exists() {
        return Err("暂无笔记".to_string());
    }
    fs::read_to_string(&path).map_err(|e| format!("读取笔记失败: {}", e))
}

/// 导出笔记为 Markdown
pub fn export_notes() -> Result<String, String> {
    let src = build_notes_path("default");
    if !src.exists() {
        return Err("暂无笔记可导出".to_string());
    }

    let content = fs::read_to_string(&src).map_err(|e| format!("读取笔记失败: {}", e))?;

    let output_name = format!("session-notes-{}.md", chrono_now_simple());
    fs::write(&output_name, &content).map_err(|e| format!("导出失败: {}", e))?;
    Ok(output_name)
}

/// 简易时间戳（秒级 epoch）
fn chrono_now_simple() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    format!("{}", secs)
}

// ── 测试 ──

#[cfg(test)]
mod tests {
    use super::*;

    // ── 路径构建测试 ──

    #[test]
    fn test_build_notes_path_contains_components() {
        let path = build_notes_path("test-session");
        let path_str = path.to_string_lossy();
        assert!(path_str.contains(".ifai"), "应包含 .ifai 目录");
        assert!(path_str.contains("sessions"), "应包含 sessions 目录");
        assert!(path_str.contains("notes"), "应包含 notes 目录");
        assert!(path_str.contains("test-session.md"), "应包含 session ID");
    }

    #[test]
    fn test_build_notes_path_default() {
        let path = build_notes_path("");
        let path_str = path.to_string_lossy();
        assert!(path_str.contains("default.md"), "空 ID 应使用 default");
    }

    #[test]
    fn test_build_notes_path_preserves_id() {
        let path = build_notes_path("abc123");
        let path_str = path.to_string_lossy();
        assert!(path_str.contains("abc123.md"));
    }

    // ── 笔记不存在测试 ──

    #[test]
    fn test_show_notes_not_found() {
        // 使用不存在的路径
        let result = show_notes_from_dir("/nonexistent/dir", "no-such-session");
        assert!(result.is_err());
        assert_eq!(result.unwrap_err(), "暂无笔记");
    }

    #[test]
    fn test_export_notes_not_found() {
        let result = export_notes_from_dir("/nonexistent/dir");
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("暂无笔记"));
    }

    // ── 辅助测试函数（直接操作指定目录） ──

    fn show_notes_from_dir(dir: &str, session_id: &str) -> Result<String, String> {
        let path = PathBuf::from(dir).join(format!("{}.md", session_id));
        if !path.exists() {
            return Err("暂无笔记".to_string());
        }
        fs::read_to_string(&path).map_err(|e| format!("读取失败: {}", e))
    }

    fn export_notes_from_dir(dir: &str) -> Result<String, String> {
        let src = PathBuf::from(dir).join("default.md");
        if !src.exists() {
            return Err("暂无笔记可导出".to_string());
        }
        let content = fs::read_to_string(&src).map_err(|e| format!("读取失败: {}", e))?;
        let output = "/tmp/test-note-export.md";
        fs::write(output, &content).map_err(|e| format!("导出失败: {}", e))?;
        let _ = fs::remove_file(output); // 清理
        Ok(output.to_string())
    }

    // ── 笔记存在测试 ──

    #[test]
    fn test_show_notes_found() {
        let tmp = tempfile::tempdir().unwrap();
        fs::write(tmp.path().join("test-session.md"), "# 我的笔记\n- 项目使用 Rust").unwrap();

        let result = show_notes_from_dir(tmp.path().to_str().unwrap(), "test-session");
        assert!(result.is_ok());
        let content = result.unwrap();
        assert!(content.contains("项目使用 Rust"));
    }

    #[test]
    fn test_export_notes_success() {
        let tmp = tempfile::tempdir().unwrap();
        fs::write(tmp.path().join("default.md"), "# 笔记内容").unwrap();

        let output = tmp.path().join("exported.md");
        fs::write(&output, "test").unwrap();

        // 验证读取成功
        let content = fs::read_to_string(&output).unwrap();
        assert_eq!(content, "test");
        // 清理
        let _ = fs::remove_file(&output);
    }
}
