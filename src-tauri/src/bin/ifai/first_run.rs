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
/// 非破坏性：只部署缺失的文件，不覆盖已有文件
/// 使用 ifainew_lib::prompt_manager::BuiltinPrompts 拷贝所有内置文件
pub fn deploy_builtin_resources() -> Result<(), String> {
    use ifainew_lib::prompt_manager::BuiltinPrompts;
    use rust_embed::RustEmbed;

    let ifai_dir = dirs::home_dir()
        .map(|home| home.join(".ifai"))
        .ok_or("无法获取主目录")?;

    // 确保 .ifai 目录存在
    fs::create_dir_all(&ifai_dir)
        .map_err(|e| format!("Failed to create .ifai directory: {}", e))?;

    let prompts_dir = ifai_dir.join("prompts");
    fs::create_dir_all(&prompts_dir)
        .map_err(|e| format!("Failed to create prompts directory: {}", e))?;

    // 使用 BuiltinPrompts 拷贝所有内置文件（45+ 个文件）
    for file_path in BuiltinPrompts::iter() {
        let path_str = file_path.as_ref();

        // 跳过 .DS_Store 等系统文件
        if path_str.contains(".DS_Store") || path_str.contains("__MACOSX") {
            continue;
        }

        let target_path = prompts_dir.join(path_str);

        // 只部署缺失的文件（非破坏性）
        if !target_path.exists() {
            if let Some(content_file) = BuiltinPrompts::get(path_str) {
                // 确保父目录存在
                if let Some(parent) = target_path.parent() {
                    fs::create_dir_all(parent)
                        .map_err(|e| format!("Failed to create directory {}: {}", parent.display(), e))?;
                }

                fs::write(&target_path, content_file.data)
                    .map_err(|e| format!("Failed to write {}: {}", path_str, e))?;
            }
        }
    }

    // 2. 部署 skills 目录结构和 PIVO 核心技能
    let skills_dir = ifai_dir.join("skills");
    fs::create_dir_all(&skills_dir)
        .map_err(|e| format!("Failed to create skills directory: {}", e))?;

    let skills_readme = skills_dir.join("README.md");
    if !skills_readme.exists() {
        let content = r#"# IfAI 技能插件中心

这里存放所有的 AI 增强技能。每个子文件夹代表一个独立的技能。

## 目录结构
```
.ifai/skills/
├── README.md
└── example-skill/
    └── skill.json
```

## 开发者指南
每个技能需要一个 `skill.json` 配置文件：
\`\`\`json
{
  "id": "skill-id",
  "name": "技能名称",
  "description": "技能描述",
  "version": "1.0.0",
  "system_prompt": "注入到系统提示词中的内容"
}
\`\`\`
"#;
        fs::write(&skills_readme, content)
            .map_err(|e| format!("Failed to write skills README: {}", e))?;
    }

    // 部署 PIVO 核心技能
    let pivo_skills = vec![
        ("pivo-implement.skill.md", "# 技能: PIVO 实施 (Implement)\n\n使用 agent_write_file 或 agent_replace 执行实际的代码修改。"),
        ("pivo-verify.skill.md", "# 技能: PIVO 校验 (Verify)\n\n使用 agent_run_shell 运行测试或编译检查，验证修改的正确性。"),
        ("pivo-heal.skill.md", "# 技能: PIVO 自愈 (Heal)\n\n分析校验失败的日志，自动执行修复逻辑并重新验证。"),
    ];

    for (name, content) in pivo_skills {
        let skill_path = skills_dir.join(name);
        if !skill_path.exists() {
            fs::write(&skill_path, content)
                .map_err(|e| format!("Failed to write PIVO skill {}: {}", name, e))?;
        }
    }

    // 3. 确保 agents 目录存在（agents/ 已通过 BuiltinPrompts 部署）
    let _agents_dir = prompts_dir.join("agents");

    Ok(())
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
}
