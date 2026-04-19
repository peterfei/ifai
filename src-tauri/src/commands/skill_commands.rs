use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::fs;

#[cfg(feature = "commercial")]
use ifainew_core::skills::SkillRegistry;

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct SkillInfo {
    pub id: String,
    pub name: String,
    pub description: String,
    pub version: String,
}

#[tauri::command]
pub async fn get_available_skills(
    project_root: String,
) -> Result<Vec<SkillInfo>, String> {
    println!("[SkillCommand] Request received for root: {}", project_root);
    
    #[cfg(feature = "commercial")]
    {
        let mut skills_path = PathBuf::from(&project_root);
        skills_path.push(".ifai");
        skills_path.push("skills");

        println!("[SkillCommand] Full scan path: {:?}", skills_path);

        if !skills_path.exists() {
            println!("[SkillCommand] Warning: Skills directory does not exist!");
            // 自动尝试初始化目录结构
            let _ = init_skills_dir(project_root.clone()).await;
            return Ok(vec![]);
        }

        let mut registry = SkillRegistry::new(skills_path);
        let skills = registry.discover().map_err(|e| e.to_string())?;

        println!("[SkillCommand] Successfully found {} skills", skills.len());

        Ok(skills.into_iter().map(|s| SkillInfo {
            id: s.id,
            name: s.name,
            description: s.description,
            version: s.version,
        }).collect())
    }

    #[cfg(not(feature = "commercial"))]
    {
        println!("[SkillCommand] Running in Community mode - returning empty list");
        Ok(vec![])
    }
}

/// 初始化技能目录结构并生成示例技能
#[tauri::command]
pub async fn init_skills_dir(project_root: String) -> Result<bool, String> {
    println!("[SkillCommand] Initializing skills directory for: {}", project_root);
    
    let mut ifai_path = PathBuf::from(&project_root);
    ifai_path.push(".ifai");
    
    let mut skills_path = ifai_path.clone();
    skills_path.push("skills");

    // 1. 创建目录
    fs::create_dir_all(&skills_path).map_err(|e| format!("Failed to create skills dir: {}", e))?;

    // 2. 生成 README.md
    let readme_content = r#"# IfAI 技能插件中心 (Skills Center)

这里存放所有的 AI 增强技能。每个子文件夹代表一个独立的技能。

## 目录结构
```
.ifai/skills/
├── README.md
└── japanese-expert/
    └── skill.json
```

## 开发者指南
请参考官方文档或项目内的说明文件。
"#;
    fs::write(skills_path.join("README.md"), readme_content).ok();

    // 3. 自动迁移：如果有人错误地把技能放到了 .ifai 根目录，帮他挪进来
    if let Ok(entries) = fs::read_dir(&ifai_path) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() && path.file_name().map(|n| n != "skills" && n != "proposals" && n != "archive" && n != "changes" && n != "sessions" && n != "templates").unwrap_or(false) {
                let config_path = path.join("skill.json");
                if config_path.exists() {
                    let target_dir = skills_path.join(path.file_name().unwrap());
                    println!("[SkillCommand] Auto-migrating skill from {:?} to {:?}", path, target_dir);
                    let _ = fs::rename(path, target_dir);
                }
            }
        }
    }

    // 4. 生成一个示例技能：日语翻译专家 (如果不存在)
    let demo_skill_dir = skills_path.join("japanese-translator");
    if !demo_skill_dir.exists() {
        fs::create_dir_all(&demo_skill_dir).ok();
        let demo_json = r#"{
    "id": "japanese-translator",
    "name": "日语翻译专家",
    "description": "强制 AI 仅使用日语进行回复，用于验证技能注入是否生效",
    "version": "1.0.0",
    "system_prompt": "CRITICAL: From now on, you are a Japanese translation expert. Regardless of the users language or previous context, you MUST reply ONLY in Japanese. If the user asks a question, answer it in Japanese. If the user gives a command, confirm it in Japanese."
    }"#;
        fs::write(demo_skill_dir.join("skill.json"), demo_json).ok();
    }

    // 🏆 v0.3.7 新增：物理级 PIVO 核心技能分发
    let pivo_skills = vec![
        ("pivo-implement.skill.md", "# 技能: PIVO 实施 (Implement)\n使用 agent_write_file 或 agent_replace 执行实际的代码修改。"),
        ("pivo-verify.skill.md", "# 技能: PIVO 校验 (Verify)\n使用 agent_run_shell 运行测试或编译检查，验证修改的正确性。"),
        ("pivo-heal.skill.md", "# 技能: PIVO 自愈 (Heal)\n分析校验失败的日志，自动执行修复逻辑并重新验证。"),
    ];

    for (name, content) in pivo_skills {
        let path = skills_path.join(name);
        if !path.exists() {
            let _ = fs::write(path, content);
        }
    }

    Ok(true)
    }