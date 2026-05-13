//! 🔥 首次运行检测器
//!
//! 通过检查 `~/.ifai/.onboarding` 标记文件判断是否首次运行。
//! 标记文件包含 JSON { version, completed_at }。

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

/// 首次运行检测器
pub struct FirstRunDetector {
    /// 标记文件路径
    marker_path: PathBuf,
}

/// 标记文件内容
#[derive(Serialize, Deserialize)]
pub struct OnboardingMarker {
    pub version: u32,
    pub completed_at: String,
}

impl FirstRunDetector {
    /// 创建检测器，使用默认路径 `~/.ifai/.onboarding`
    pub fn new() -> Self {
        let marker_path = dirs::home_dir()
            .map(|home| home.join(".ifai").join(".onboarding"))
            .unwrap_or_else(|| PathBuf::from(".onboarding"));
        Self { marker_path }
    }

    /// 创建检测器，使用自定义路径（用于测试）
    pub fn with_path(marker_path: PathBuf) -> Self {
        Self { marker_path }
    }

    /// 是否首次运行（标记文件不存在）
    pub fn is_first_run(&self) -> bool {
        !self.marker_path.exists()
    }

    /// 标记向导已完成
    pub fn mark_completed(&self) -> Result<(), String> {
        if let Some(parent) = self.marker_path.parent() {
            std::fs::create_dir_all(parent)
                .map_err(|e| format!("Failed to create .ifai directory: {}", e))?;
        }
        let marker = OnboardingMarker {
            version: 1,
            completed_at: chrono::Local::now().to_rfc3339(),
        };
        let json = serde_json::to_string_pretty(&marker)
            .map_err(|e| format!("Failed to serialize marker: {}", e))?;
        std::fs::write(&self.marker_path, json)
            .map_err(|e| format!("Failed to write marker file: {}", e))?;
        Ok(())
    }

    /// 获取标记文件路径
    pub fn marker_path(&self) -> &PathBuf {
        &self.marker_path
    }
}

/// 部署内置资源到 ~/.ifai/
///
/// **最小化部署**：只部署必要的文件，其他文件由用户按需自定义
///
/// **优先级加载机制**：
/// 1. `~/.ifai/prompts/{name}` - 用户自定义（优先）
/// 2. `BuiltinPrompts::{name}` - 编译时嵌入（回退）
pub fn deploy_builtin_resources() -> Result<(), String> {
    use ifainew_lib::prompt_manager::BuiltinPrompts;

    let ifai_dir = dirs::home_dir()
        .map(|home| home.join(".ifai"))
        .ok_or("无法获取主目录")?;

    // 确保 .ifai 目录存在
    fs::create_dir_all(&ifai_dir)
        .map_err(|e| format!("Failed to create .ifai directory: {}", e))?;

    // 最小化部署：只部署 memory/extract.md（被 memory/extractor.rs 使用）
    let memory_dir = ifai_dir.join("prompts/memory");
    fs::create_dir_all(&memory_dir)
        .map_err(|e| format!("Failed to create prompts/memory directory: {}", e))?;

    let extract_md = memory_dir.join("extract.md");
    if !extract_md.exists() {
        if let Some(content_file) = BuiltinPrompts::get("memory/extract.md") {
            fs::write(&extract_md, content_file.data)
                .map_err(|e| format!("Failed to write memory/extract.md: {}", e))?;
        }
    }

    Ok(())
}

/// 从 ~/.ifai/prompts/ 加载用户自定义提示词（如果存在）
///
/// **优先级**：
/// 1. `~/.ifai/prompts/{name}` - 用户自定义
/// 2. `BuiltinPrompts::{name}` - 编译时嵌入
pub fn load_user_prompt(name: &str) -> Option<String> {
    use ifainew_lib::prompt_manager::BuiltinPrompts;

    // 1. 尝试从 ~/.ifai/prompts/ 读取用户自定义
    // 优先使用 HOME 环境变量（支持测试），否则使用 dirs::home_dir()
    let home_dir = std::env::var("HOME")
        .ok()
        .or_else(|| dirs::home_dir().map(|p| p.to_string_lossy().to_string()));

    if let Some(home) = home_dir {
        let user_path = PathBuf::from(home).join(".ifai/prompts").join(name);
        if user_path.exists() {
            if let Ok(content) = fs::read_to_string(&user_path) {
                return Some(content);
            }
        }
    }

    // 2. 回退到 BuiltinPrompts（编译时嵌入）
    if let Some(content_file) = BuiltinPrompts::get(name) {
        std::str::from_utf8(content_file.data.as_ref())
            .ok()
            .map(|s| s.to_string())
    } else {
        None
    }
}



impl Default for FirstRunDetector {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    /// 创建测试用临时目录（使用线程 ID 避免并行冲突）
    fn test_dir(test_name: &str) -> std::path::PathBuf {
        let thread_id = format!("{:?}", std::thread::current().id());
        std::env::temp_dir().join(format!("ifai_test_fr_{}_{}", test_name, thread_id))
    }

    #[test]
    fn test_first_run_marker_absent() {
        let dir = test_dir("marker_absent");
        let _ = fs::remove_dir_all(&dir);
        let marker_path = dir.join(".onboarding");
        let detector = FirstRunDetector::with_path(marker_path.clone());
        assert!(detector.is_first_run(), "标记文件不存在时应返回首次运行");
    }

    #[test]
    fn test_first_run_marker_present() {
        let dir = test_dir("marker_present");
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        let marker_path = dir.join(".onboarding");
        fs::write(&marker_path, r#"{"version":1,"completed_at":"2025-01-01"}"#).unwrap();
        let detector = FirstRunDetector::with_path(marker_path);
        assert!(!detector.is_first_run(), "标记文件存在时应返回非首次运行");
    }

    #[test]
    fn test_mark_completed_creates_file() {
        let dir = test_dir("mark_completed");
        let _ = fs::remove_dir_all(&dir);
        let marker_path = dir.join(".onboarding");
        let detector = FirstRunDetector::with_path(marker_path.clone());
        assert!(detector.is_first_run());
        detector.mark_completed().unwrap();
        assert!(!detector.is_first_run(), "标记后不应再是首次运行");
        assert!(marker_path.exists(), "标记文件应被创建");
        let content = fs::read_to_string(&marker_path).unwrap();
        assert!(content.contains("\"version\": 1"), "标记文件应包含版本号");
        assert!(content.contains("completed_at"), "标记文件应包含时间戳");
    }

    #[test]
    fn test_mark_completed_idempotent() {
        let dir = test_dir("mark_idempotent");
        let _ = fs::remove_dir_all(&dir);
        let marker_path = dir.join(".onboarding");
        let detector = FirstRunDetector::with_path(marker_path);
        detector.mark_completed().unwrap();
        detector.mark_completed().unwrap(); // 第二次调用不报错
        assert!(!detector.is_first_run());
    }

    #[test]
    fn test_load_user_prompt_priority() {
        // 测试优先级：用户自定义 > BuiltinPrompts
        use std::fs;
        use std::path::PathBuf;

        // 创建临时目录模拟 ~/.ifai/prompts/
        let dir = test_dir("load_priority");
        let _ = fs::remove_dir_all(&dir);

        // load_user_prompt() 期望的路径是 $HOME/.ifai/prompts/{name}
        let prompts_dir = dir.join(".ifai/prompts");
        fs::create_dir_all(&prompts_dir).unwrap();

        // 创建用户自定义文件
        let test_file = prompts_dir.join("test.txt");
        let custom_content = "USER_CUSTOM_CONTENT";
        fs::write(&test_file, custom_content).unwrap();

        // 临时设置 HOME 环境变量指向测试目录
        let original_home = std::env::var("HOME");
        std::env::set_var("HOME", dir.as_os_str());

        // 测试：应读取用户自定义文件
        let result = load_user_prompt("test.txt");
        assert_eq!(result.as_deref(), Some(custom_content));

        // 恢复 HOME
        match original_home {
            Ok(home) => std::env::set_var("HOME", home),
            Err(_) => std::env::remove_var("HOME"),
        }
    }

    #[test]
    fn test_load_user_prompt_fallback_to_builtin() {
        // 测试回退：用户文件不存在时使用 BuiltinPrompts
        use std::env;

        // 临时设置 HOME 到空目录（没有用户自定义文件）
        let dir = test_dir("fallback");
        let _ = fs::remove_dir_all(&dir);

        let original_home = env::var("HOME");
        env::set_var("HOME", dir.as_os_str());

        // 测试：应回退到 BuiltinPrompts
        // memory/extract.md 应该在 BuiltinPrompts 中存在
        let result = load_user_prompt("memory/extract.md");
        assert!(result.is_some(), "应从 BuiltinPrompts 加载");
        assert!(result.unwrap().contains("提取"), "应包含中文内容");

        // 恢复 HOME
        match original_home {
            Ok(home) => env::set_var("HOME", home),
            Err(_) => env::remove_var("HOME"),
        }
    }
}
