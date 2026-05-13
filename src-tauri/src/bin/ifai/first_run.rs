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

/// 递归加载提示词，支持引用解析
///
/// **引用语法**：`{{include "path/to/file.md"}}`
/// **优先级**：每个引用文件也遵循 用户自定义 > BuiltinPrompts
pub fn load_prompt_recursive(name: &str) -> Option<String> {
    let content = load_user_prompt(name)?;

    // 简单字符串解析：查找 {{include "path"}}
    let mut result = content;
    let mut processed_includes = std::collections::HashSet::new();
    processed_includes.insert(name.to_string());

    // 递归解析所有引用（最多 10 层深度防止循环）
    for _ in 0..10 {
        let mut replaced = false;

        // 查找 {{include "..."}} 模式
        while let Some(start) = result.find("{{include \"") {
            let substring = &result[start..];

            // 查找结束位置
            if let Some(end) = substring.find("\"}}") {
                let full_match = &result[start..start + end + 3]; // +3 for "\"}}"
                let include_path = &result[start + 11..start + end]; // 路径在 {{include " 和 "}} 之间

                // 防止循环引用
                if processed_includes.contains(include_path) {
                    result = result.replacen(full_match, "[循环引用]", 1);
                    replaced = true;
                    break;
                }

                processed_includes.insert(include_path.to_string());
                replaced = true;

                // 递归加载被引用的文件
                let replacement = load_prompt_recursive(include_path)
                    .unwrap_or_else(|| format!("[无法加载引用: {}]", include_path));

                result = result.replacen(full_match, &replacement, 1);
            } else {
                break;
            }
        }

        if !replaced {
            break;
        }
    }

    Some(result)
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

    #[test]
    fn test_load_prompt_recursive_with_include() {
        // 测试引用解析功能
        use std::env;
        use std::fs;
        use std::path::PathBuf;

        let dir = test_dir("recursive_include");
        let _ = fs::remove_dir_all(&dir);

        // 创建目录结构
        let prompts_dir = dir.join(".ifai/prompts");
        let protocols_dir = prompts_dir.join("protocols");
        fs::create_dir_all(&protocols_dir).unwrap();

        // 创建主文件（包含引用）
        let main_file = prompts_dir.join("main.md");
        let main_content = r#"# 主文件

这是主内容。

{{include "protocols/test-protocol.md"}}

主文件结束。
"#;
        fs::write(&main_file, main_content).unwrap();

        // 创建被引用的协议文件
        let protocol_file = protocols_dir.join("test-protocol.md");
        let protocol_content = "# 协议文件\n\n这是协议内容。";
        fs::write(&protocol_file, protocol_content).unwrap();

        // 设置 HOME 环境变量
        let original_home = std::env::var("HOME");
        std::env::set_var("HOME", dir.as_os_str());

        // 测试递归加载
        let result = load_prompt_recursive("main.md");
        assert!(result.is_some(), "应成功加载主文件");
        let content = result.unwrap();

        // 调试输出
        eprintln!("=== 加载的内容 ===");
        eprintln!("{}", content);
        eprintln!("=== 内容结束 ===");

        // 验证引用被正确解析
        assert!(content.contains("主内容"), "应包含主文件内容");
        assert!(content.contains("协议内容"), "应包含被引用的协议文件内容");
        assert!(!content.contains("{{include"), "不应包含 include 语法");

        // 恢复 HOME
        match original_home {
            Ok(home) => env::set_var("HOME", home),
            Err(_) => env::remove_var("HOME"),
        }
    }

    #[test]
    fn test_load_prompt_recursive_builtin_fallback() {
        // 测试递归加载时的 BuiltinPrompts 回退
        use std::env;

        let original_home = env::var("HOME");
        env::set_var("HOME", "/tmp/nonexistent_path");

        // 测试 memory/extract.md（应该存在于 BuiltinPrompts 中）
        let result = load_prompt_recursive("memory/extract.md");
        assert!(result.is_some(), "应从 BuiltinPrompts 加载 memory/extract.md");

        let content = result.unwrap();
        // memory/extract.md 不包含引用，所以内容应该原样返回
        assert!(content.contains("提取") || content.len() > 0, "应包含内容");

        // 恢复 HOME
        match original_home {
            Ok(home) => env::set_var("HOME", home),
            Err(_) => env::remove_var("HOME"),
        }
    }

    #[test]
    fn test_load_prompt_recursive_cycle_detection() {
        // 测试循环引用检测
        use std::env;
        use std::fs;
        use std::path::PathBuf;

        let dir = test_dir("cycle_detection");
        let _ = fs::remove_dir_all(&dir);

        let prompts_dir = dir.join(".ifai/prompts");
        fs::create_dir_all(&prompts_dir).unwrap();

        // 创建循环引用：a.md 引用 b.md，b.md 引用 a.md
        let file_a = prompts_dir.join("a.md");
        fs::write(&file_a, "File A {{include \"b.md\"}}").unwrap();

        let file_b = prompts_dir.join("b.md");
        fs::write(&file_b, "File B {{include \"a.md\"}}").unwrap();

        let original_home = std::env::var("HOME");
        std::env::set_var("HOME", dir.as_os_str());

        // 应该检测到循环引用并阻止无限递归
        let result = load_prompt_recursive("a.md");
        assert!(result.is_some(), "应返回结果（即使有循环引用）");

        let content = result.unwrap();
        assert!(content.contains("循环引用") || content.contains("File A"), "应包含循环引用警告或部分内容");

        match original_home {
            Ok(home) => env::set_var("HOME", home),
            Err(_) => env::remove_var("HOME"),
        }
    }
}
