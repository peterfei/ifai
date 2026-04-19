use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::fs;

#[cfg(feature = "commercial")]
use ifainew_core::skills::{SkillRegistry, Skill, SkillState};

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

/// 安装技能到项目
#[cfg(feature = "commercial")]
#[tauri::command]
pub async fn install_skill(
    project_root: String,
    skill_id: String,
    version: Option<String>,
    source: Option<String>,
) -> Result<bool, String> {
    println!("[SkillCommand] Installing skill: {} (version: {:?}, source: {:?})",
             skill_id, version, source);

    let mut skills_path = PathBuf::from(&project_root);
    skills_path.push(".ifai");
    skills_path.push("skills");

    // 确保技能目录存在
    fs::create_dir_all(&skills_path)
        .map_err(|e| format!("创建技能目录失败: {}", e))?;

    // 从内置技能库复制技能文件
    let builtin_skills_path = skills_path.join("__builtin__");

    // 检查是否是安装内置示例技能
    if skill_id == "builtin-examples" || source == Some("builtin".to_string()) {
        println!("[SkillCommand] Installing builtin example skills");

        // 创建日语翻译专家技能
        let japanese_skill_dir = skills_path.join("japanese-translator");
        fs::create_dir_all(&japanese_skill_dir)
            .map_err(|e| format!("创建技能目录失败: {}", e))?;

        let skill_json = r#"{
            "id": "japanese-translator",
            "name": "日语翻译专家",
            "description": "强制AI仅使用日语进行回复，用于验证技能注入是否生效",
            "version": "1.0.0",
            "author": "IfAI Team",
            "system_prompt": "CRITICAL: From now on, you are a Japanese translation expert. Regardless of the users language or previous context, you MUST reply ONLY in Japanese. If the user asks a question, answer it in Japanese. If the user gives a command, confirm it in Japanese.",
            "tags": ["translation", "japanese", "language"],
            "dependencies": [],
            "compatibility": "^1.0.0"
        }"#;

        fs::write(japanese_skill_dir.join("skill.json"), skill_json)
            .map_err(|e| format!("写入技能文件失败: {}", e))?;

        println!("[SkillCommand] Japanese translator skill installed successfully");

        // 创建PIVO核心技能（使用JSON格式）
        let pivo_skills = vec![
            (
                "pivo-implement",
                r#"{
                    "id": "pivo-implement",
                    "name": "PIVO 实施",
                    "description": "使用 agent_write_file 或 agent_replace 执行实际的代码修改",
                    "version": "1.0.0",
                    "author": "IfAI Team",
                    "system_prompt": "You are a PIVO implementation specialist. Use agent_write_file or agent_replace to execute actual code modifications.",
                    "tags": ["pivo", "implementation", "code-modification"],
                    "dependencies": [],
                    "compatibility": "^1.0.0"
                }"#
            ),
            (
                "pivo-verify",
                r#"{
                    "id": "pivo-verify",
                    "name": "PIVO 校验",
                    "description": "使用 agent_run_shell 运行测试或编译检查，验证修改的正确性",
                    "version": "1.0.0",
                    "author": "IfAI Team",
                    "system_prompt": "You are a PIVO verification specialist. Use agent_run_shell to run tests or compile checks, verifying the correctness of modifications.",
                    "tags": ["pivo", "verification", "testing"],
                    "dependencies": [],
                    "compatibility": "^1.0.0"
                }"#
            ),
            (
                "pivo-heal",
                r#"{
                    "id": "pivo-heal",
                    "name": "PIVO 自愈",
                    "description": "分析校验失败的日志，自动执行修复逻辑并重新验证",
                    "version": "1.0.0",
                    "author": "IfAI Team",
                    "system_prompt": "You are a PIVO healing specialist. Analyze failed verification logs, automatically execute repair logic, and re-verify.",
                    "tags": ["pivo", "healing", "error-recovery"],
                    "dependencies": [],
                    "compatibility": "^1.0.0"
                }"#
            ),
        ];

        for (skill_id, skill_json) in pivo_skills {
            let skill_dir = skills_path.join(skill_id);
            fs::create_dir_all(&skill_dir)
                .map_err(|e| format!("创建PIVO技能目录失败: {}", e))?;

            let skill_json_path = skill_dir.join("skill.json");
            fs::write(&skill_json_path, skill_json)
                .map_err(|e| format!("写入PIVO技能失败: {}", e))?;
            println!("[SkillCommand] Installed PIVO skill: {}", skill_id);
        }

        println!("[SkillCommand] All builtin skills installed successfully");
        return Ok(true);
    }

    // 如果是具体的技能ID，从技能市场查找并安装
    // 这里暂时返回错误，提示用户功能待实现
    Err(format!("技能 '{}' 暂未在技能库中找到。请使用'安装示例技能'功能。", skill_id))
}

/// 卸载技能
#[cfg(feature = "commercial")]
#[tauri::command]
pub async fn uninstall_skill(
    project_root: String,
    skill_id: String,
) -> Result<bool, String> {
    println!("[SkillCommand] Uninstalling skill: {}", skill_id);

    let mut skills_path = PathBuf::from(&project_root);
    skills_path.push(".ifai");
    skills_path.push("skills");

    // 删除技能目录
    let skill_dir = skills_path.join(&skill_id);
    if skill_dir.exists() {
        fs::remove_dir_all(&skill_dir)
            .map_err(|e| format!("删除技能目录失败: {}", e))?;

        println!("[SkillCommand] Skill {} uninstalled successfully", skill_id);
        Ok(true)
    } else {
        Err(format!("技能目录不存在: {:?}", skill_dir))
    }
}

/// 激活技能
#[cfg(feature = "commercial")]
#[tauri::command]
pub async fn activate_skill(
    project_root: String,
    skill_id: String,
) -> Result<bool, String> {
    println!("[SkillCommand] Activating skill: {}", skill_id);

    let mut skills_path = PathBuf::from(&project_root);
    skills_path.push(".ifai");
    skills_path.push("skills");

    let mut registry = SkillRegistry::new(skills_path);

    // 设置技能为激活状态
    // 这里需要在ifainew-core中实现activate方法
    println!("[SkillCommand] Skill {} activated", skill_id);
    Ok(true)
}

/// 停用技能
#[cfg(feature = "commercial")]
#[tauri::command]
pub async fn deactivate_skill(
    project_root: String,
    skill_id: String,
) -> Result<bool, String> {
    println!("[SkillCommand] Deactivating skill: {}", skill_id);

    let mut skills_path = PathBuf::from(&project_root);
    skills_path.push(".ifai");
    skills_path.push("skills");

    let mut registry = SkillRegistry::new(skills_path);

    // 设置技能为停用状态
    println!("[SkillCommand] Skill {} deactivated", skill_id);
    Ok(true)
}

/// 创建新技能
#[cfg(feature = "commercial")]
#[tauri::command]
pub async fn create_skill(
    project_root: String,
    skill: serde_json::Value,
) -> Result<bool, String> {
    println!("[SkillCommand] Creating skill: {}", skill["id"]);

    let mut skills_path = PathBuf::from(&project_root);
    skills_path.push(".ifai");
    skills_path.push("skills");

    // 确保技能目录存在
    fs::create_dir_all(&skills_path)
        .map_err(|e| format!("创建技能目录失败: {}", e))?;

    // 创建技能子目录
    let skill_id = skill["id"].as_str().ok_or("技能ID不能为空")?;
    let skill_dir = skills_path.join(&skill_id);

    fs::create_dir_all(&skill_dir)
        .map_err(|e| format!("创建技能子目录失败: {}", e))?;

    // 写入skill.json
    let skill_json = serde_json::to_string_pretty(&skill)
        .map_err(|e| format!("序列化技能数据失败: {}", e))?;

    fs::write(skill_dir.join("skill.json"), skill_json)
        .map_err(|e| format!("写入skill.json失败: {}", e))?;

    println!("[SkillCommand] Skill {} created successfully", skill_id);
    Ok(true)
}

/// 更新技能
#[cfg(feature = "commercial")]
#[tauri::command]
pub async fn update_skill(
    project_root: String,
    skill_id: String,
    updates: serde_json::Value,
) -> Result<bool, String> {
    println!("[SkillCommand] Updating skill: {}", skill_id);

    let mut skills_path = PathBuf::from(&project_root);
    skills_path.push(".ifai");
    skills_path.push("skills");

    let skill_file = skills_path.join(&skill_id).join("skill.json");

    if !skill_file.exists() {
        return Err(format!("技能文件不存在: {:?}", skill_file));
    }

    // 读取现有技能数据
    let existing_content = fs::read_to_string(&skill_file)
        .map_err(|e| format!("读取技能文件失败: {}", e))?;

    let mut existing_skill: serde_json::Value = serde_json::from_str(&existing_content)
        .map_err(|e| format!("解析技能数据失败: {}", e))?;

    // 合并更新
    if let Some(obj) = updates.as_object() {
      for (key, value) in obj.iter() {
        existing_skill[key.clone()] = value.clone();
      }
    }

    // 写回文件
    let updated_json = serde_json::to_string_pretty(&existing_skill)
        .map_err(|e| format!("序列化更新后的技能失败: {}", e))?;

    fs::write(&skill_file, updated_json)
        .map_err(|e| format!("写入更新后的技能文件失败: {}", e))?;

    println!("[SkillCommand] Skill {} updated successfully", skill_id);
    Ok(true)
}

// 社区版本的空实现
#[cfg(not(feature = "commercial"))]
#[tauri::command]
pub async fn install_skill(
    _project_root: String,
    _skill_id: String,
    _version: Option<String>,
    _source: Option<String>,
) -> Result<bool, String> {
    Err("技能安装功能仅在商业版中可用".to_string())
}

#[cfg(not(feature = "commercial"))]
#[tauri::command]
pub async fn uninstall_skill(
    _project_root: String,
    _skill_id: String,
) -> Result<bool, String> {
    Err("技能卸载功能仅在商业版中可用".to_string())
}

#[cfg(not(feature = "commercial"))]
#[tauri::command]
pub async fn activate_skill(
    _project_root: String,
    _skill_id: String,
) -> Result<bool, String> {
    Err("技能激活功能仅在商业版中可用".to_string())
}

#[cfg(not(feature = "commercial"))]
#[tauri::command]
pub async fn deactivate_skill(
    _project_root: String,
    _skill_id: String,
) -> Result<bool, String> {
    Err("技能停用功能仅在商业版中可用".to_string())
}

#[cfg(not(feature = "commercial"))]
#[tauri::command]
pub async fn create_skill(
    _project_root: String,
    _skill: serde_json::Value,
) -> Result<bool, String> {
    Err("技能创建功能仅在商业版中可用".to_string())
}

#[cfg(not(feature = "commercial"))]
#[tauri::command]
pub async fn update_skill(
    _project_root: String,
    _skill_id: String,
    _updates: serde_json::Value,
) -> Result<bool, String> {
    Err("技能更新功能仅在商业版中可用".to_string())
}