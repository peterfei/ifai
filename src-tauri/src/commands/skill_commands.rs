use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

#[cfg(feature = "commercial")]
use ifainew_core::skills::{Skill, SkillRegistry, SkillState};

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct SkillInfo {
    pub id: String,
    pub name: String,
    pub description: String,
    pub version: String,
}

#[tauri::command]
pub async fn get_available_skills(project_root: String) -> Result<Vec<serde_json::Value>, String> {
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

        // 转换为 JSON Value 以避免依赖问题
        let skills_json: Result<Vec<serde_json::Value>, _> = skills
            .into_iter()
            .map(|skill| serde_json::to_value(skill).map_err(|e| e.to_string()))
            .collect();

        skills_json
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
    println!(
        "[SkillCommand] Initializing skills directory for: {}",
        project_root
    );

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
            if path.is_dir()
                && path
                    .file_name()
                    .map(|n| {
                        n != "skills"
                            && n != "proposals"
                            && n != "archive"
                            && n != "changes"
                            && n != "sessions"
                            && n != "templates"
                    })
                    .unwrap_or(false)
            {
                let config_path = path.join("skill.json");
                if config_path.exists() {
                    let target_dir = skills_path.join(path.file_name().unwrap());
                    println!(
                        "[SkillCommand] Auto-migrating skill from {:?} to {:?}",
                        path, target_dir
                    );
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
    skill_data: Option<serde_json::Value>,
) -> Result<bool, String> {
    println!(
        "[SkillCommand] Installing skill: {} (version: {:?}, source: {:?})",
        skill_id, version, source
    );

    let mut skills_path = PathBuf::from(&project_root);
    skills_path.push(".ifai");
    skills_path.push("skills");

    // 确保技能目录存在
    fs::create_dir_all(&skills_path).map_err(|e| format!("创建技能目录失败: {}", e))?;

    // 检查是否从技能市场安装（传递了 skill_data）
    if let Some(data) = skill_data {
        println!("[SkillCommand] Installing skill from marketplace data");

        let skill_dir = skills_path.join(&skill_id);
        fs::create_dir_all(&skill_dir).map_err(|e| format!("创建技能目录失败: {}", e))?;

        // 构建 Markdown 格式的技能文件
        let name = data
            .get("displayName")
            .or(data.get("name"))
            .and_then(|v| v.as_str())
            .unwrap_or(&skill_id);

        let description = data
            .get("description")
            .and_then(|v| v.as_str())
            .unwrap_or("暂无描述");

        let long_description = data
            .get("longDescription")
            .or(data.get("description"))
            .and_then(|v| v.as_str())
            .unwrap_or(description);

        let version_str = data
            .get("version")
            .and_then(|v| v.as_str())
            .or(version.as_deref())
            .unwrap_or("1.0.0");

        let author = data
            .get("author")
            .and_then(|v| v.as_str())
            .unwrap_or("Unknown");

        let system_prompt = data
            .get("systemPrompt")
            .and_then(|v| v.as_str())
            .unwrap_or("");

        let tags = data
            .get("tags")
            .and_then(|v| v.as_array())
            .map(|arr| {
                arr.iter()
                    .filter_map(|v| v.as_str())
                    .collect::<Vec<_>>()
                    .join(", ")
            })
            .unwrap_or_else(|| String::new());

        // 将 system_prompt 格式化为 YAML 多行字符串（literal block scalar）
        let yaml_prompt = if system_prompt.contains('\n') {
            format!("|\n{}", system_prompt.lines()
                .map(|l| format!("  {}", l))
                .collect::<Vec<_>>()
                .join("\n"))
        } else {
            system_prompt.to_string()
        };

        // 构建 Markdown 内容（YAML frontmatter 包含 from_markdown 需要的所有字段）
        let markdown_content = format!(
            r#"---
name: {}
id: {}
description: {}
version: "{}"
system_prompt: {}
author: {}
tags: [{}]
license: MIT
compatibility: 通用
---

{}
"#,
            name, skill_id, description, version_str, yaml_prompt, author, tags, long_description
        );

        // 写入 skill.md 文件
        let skill_md = skill_dir.join("skill.md");
        fs::write(&skill_md, markdown_content).map_err(|e| format!("写入技能文件失败: {}", e))?;

        // 同时生成 skill.json 以便兼容性
        let skill_json = serde_json::json!({
            "id": skill_id,
            "name": name,
            "description": description,
            "system_prompt": system_prompt,
            "version": version_str,
            "author": author,
            "tags": data.get("tags").and_then(|v| v.as_array()).map(|arr| {
                arr.iter()
                    .filter_map(|v| v.as_str())
                    .map(|s| s.to_string())
                    .collect::<Vec<_>>()
            }),
            "dependencies": [],
            "compatibility": null
        });

        let skill_json_path = skill_dir.join("skill.json");
        fs::write(
            &skill_json_path,
            serde_json::to_string_pretty(&skill_json).unwrap(),
        )
        .map_err(|e| format!("写入skill.json失败: {}", e))?;

        println!(
            "[SkillCommand] Skill {} installed successfully from marketplace",
            skill_id
        );
        return Ok(true);
    }

    // 检查是否是安装内置示例技能
    if skill_id == "builtin-examples" || source == Some("builtin".to_string()) {
        println!("[SkillCommand] Installing builtin example skills");

        // 创建示例技能（使用标准markdown格式）
        let example_skills = vec![
            (
                "code-review",
                r#"---
name: code-review
description: 专业代码审查技能，能够分析代码质量、发现潜在问题、提供改进建议和最佳实践指导
license: MIT
compatibility: 通用代码审查
metadata:
  author: IfAI Team
  version: "1.0.0"
---

专业代码审查技能。帮助发现代码中的问题、安全漏洞、性能瓶颈，并提供改进建议。

**擅长领域**：
- 代码质量分析和改进建议
- 安全漏洞检测（SQL注入、XSS、CSRF等）
- 性能优化建议
- 代码规范和最佳实践检查
- 架构设计和模式建议
- 错误处理和边界条件检查

**审查流程**：

1. **理解上下文** - 首先理解代码的用途和业务场景
2. **安全检查** - 检查常见安全漏洞
3. **性能分析** - 识别性能瓶颈和优化机会
4. **代码质量** - 评估可读性、可维护性、可测试性
5. **最佳实践** - 对照行业最佳实践提出建议

**输出格式**：
- 🔴 严重问题（必须修复）
- 🟡 改进建议（建议修复）
- 🔵 优化机会（可选改进）
- 🟢 良好实践（值得肯定）
"#,
            ),
            (
                "test-generator",
                r#"---
name: test-generator
description: 自动生成单元测试和集成测试，支持多种测试框架和编程语言
license: MIT
compatibility: 支持主流测试框架
metadata:
  author: IfAI Team
  version: "1.0.0"
---

自动测试生成技能。帮助创建高质量的单元测试、集成测试和端到端测试。

**支持的测试类型**：
- 单元测试（函数、类、组件级别）
- 集成测试（API、数据库、服务间）
- 端到端测试（用户流程、UI交互）
- 性能测试（负载、压力测试）
- 安全测试（渗透、漏洞扫描）

**支持的框架**：
- JavaScript: Jest, Mocha, Vitest, Cypress
- Python: pytest, unittest, nose2
- Rust: built-in test framework
- Go: testing package
- Java: JUnit, TestNG

**生成流程**：

1. **分析代码** - 理解函数/类的用途和边界条件
2. **识别场景** - 正常路径、异常路径、边界情况
3. **生成测试** - 创建清晰、可维护的测试用例
4. **添加断言** - 验证预期行为和错误处理
5. **Mock依赖** - 隔离外部依赖

**测试质量标准**：
- 覆盖率 > 80%
- 清晰的测试名称和描述
- 独立的测试用例
- 适当的设置和清理
"#,
            ),
            (
                "documentation-writer",
                r#"---
name: documentation-writer
description: 从代码自动生成API文档、使用手册和技术文档
license: MIT
compatibility: 支持多种文档格式
metadata:
  author: IfAI Team
  version: "1.0.0"
---

自动文档生成技能。帮助创建清晰、完整的技术文档。

**支持的文档类型**：
- API文档（REST、GraphQL、gRPC）
- 用户手册（安装、配置、使用）
- 开发文档（架构、设计、贡献指南）
- 代码注释（JSDoc、PyDoc、RustDoc）
- README和示例

**文档质量标准**：
- 清晰简洁的语言
- 完整的示例代码
- 准确的类型签名
- 使用场景和最佳实践
- 常见问题和故障排除

**生成流程**：

1. **分析代码结构** - 理解模块、类、函数的职责
2. **提取关键信息** - 参数、返回值、异常、副作用
3. **组织内容结构** - 按逻辑层次组织文档
4. **添加示例** - 提供实际可用的代码示例
5. **审查完整性** - 确保覆盖所有公共API

**输出格式**：
- Markdown（GitHub、GitLab兼容）
- OpenAPI/Swagger（REST API）
- JSDoc（JavaScript）
- reStructuredText（Python）
"#,
            ),
            (
                "debugger",
                r#"---
name: debugger
description: 专业调试技能，帮助快速定位和修复bug
license: MIT
compatibility: 通用调试辅助
metadata:
  author: IfAI Team
  version: "1.0.0"
---

专业调试技能。帮助快速定位问题根因并提供修复方案。

**调试方法**：
- 二分法定位问题
- 日志分析和追踪
- 堆栈跟踪分析
- 内存泄漏检测
- 性能瓶颈分析
- 并发问题诊断

**常见问题类型**：
- 逻辑错误和边界条件
- 空指针和类型错误
- 异步和竞态条件
- 内存和资源泄漏
- 性能和优化问题
- 配置和环境问题

**调试流程**：

1. **复现问题** - 确定问题的触发条件
2. **收集信息** - 日志、错误消息、堆栈跟踪
3. **分析根因** - 定位问题的根本原因
4. **提出假设** - 基于证据形成假设
5. **验证假设** - 通过测试验证假设
6. **实施修复** - 创建最小化的修复方案
7. **验证修复** - 确保问题解决且无副作用

**调试工具建议**：
- Chrome DevTools（前端）
- debugger语句和断点
- 日志记录和追踪
- 性能分析器
"#,
            ),
        ];

        for (skill_id, skill_content) in example_skills {
            let skill_dir = skills_path.join(skill_id);
            fs::create_dir_all(&skill_dir).map_err(|e| format!("创建技能目录失败: {}", e))?;

            let skill_md = skill_dir.join("skill.md");
            fs::write(&skill_md, skill_content).map_err(|e| format!("写入技能文件失败: {}", e))?;
            println!("[SkillCommand] Installed skill: {}", skill_id);
        }

        println!("[SkillCommand] All builtin skills installed successfully");
        return Ok(true);
    }

    // 如果是具体的技能ID，从技能市场查找并安装
    // 这里暂时返回错误，提示用户功能待实现
    Err(format!(
        "技能 '{}' 暂未在技能库中找到。请使用'安装示例技能'功能。",
        skill_id
    ))
}

/// 卸载技能
#[cfg(feature = "commercial")]
#[tauri::command]
pub async fn uninstall_skill(project_root: String, skill_id: String) -> Result<bool, String> {
    println!("[SkillCommand] Uninstalling skill: {}", skill_id);

    let mut skills_path = PathBuf::from(&project_root);
    skills_path.push(".ifai");
    skills_path.push("skills");

    // 删除技能目录
    let skill_dir = skills_path.join(&skill_id);
    if skill_dir.exists() {
        fs::remove_dir_all(&skill_dir).map_err(|e| format!("删除技能目录失败: {}", e))?;

        println!("[SkillCommand] Skill {} uninstalled successfully", skill_id);
        Ok(true)
    } else {
        Err(format!("技能目录不存在: {:?}", skill_dir))
    }
}

/// 激活技能
#[cfg(feature = "commercial")]
#[tauri::command]
pub async fn activate_skill(project_root: String, skill_id: String) -> Result<bool, String> {
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
pub async fn deactivate_skill(project_root: String, skill_id: String) -> Result<bool, String> {
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
pub async fn create_skill(project_root: String, skill: serde_json::Value) -> Result<bool, String> {
    println!("[SkillCommand] Creating skill: {}", skill["id"]);

    let mut skills_path = PathBuf::from(&project_root);
    skills_path.push(".ifai");
    skills_path.push("skills");

    // 确保技能目录存在
    fs::create_dir_all(&skills_path).map_err(|e| format!("创建技能目录失败: {}", e))?;

    // 创建技能子目录
    let skill_id = skill["id"].as_str().ok_or("技能ID不能为空")?;
    let skill_dir = skills_path.join(&skill_id);

    fs::create_dir_all(&skill_dir).map_err(|e| format!("创建技能子目录失败: {}", e))?;

    // 写入skill.json
    let skill_json =
        serde_json::to_string_pretty(&skill).map_err(|e| format!("序列化技能数据失败: {}", e))?;

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
    let existing_content =
        fs::read_to_string(&skill_file).map_err(|e| format!("读取技能文件失败: {}", e))?;

    let mut existing_skill: serde_json::Value =
        serde_json::from_str(&existing_content).map_err(|e| format!("解析技能数据失败: {}", e))?;

    // 合并更新
    if let Some(obj) = updates.as_object() {
        for (key, value) in obj.iter() {
            existing_skill[key.clone()] = value.clone();
        }
    }

    // 写回文件
    let updated_json = serde_json::to_string_pretty(&existing_skill)
        .map_err(|e| format!("序列化更新后的技能失败: {}", e))?;

    fs::write(&skill_file, updated_json).map_err(|e| format!("写入更新后的技能文件失败: {}", e))?;

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
    _skill_data: Option<serde_json::Value>,
) -> Result<bool, String> {
    Err("技能安装功能仅在商业版中可用".to_string())
}

#[cfg(not(feature = "commercial"))]
#[tauri::command]
pub async fn uninstall_skill(_project_root: String, _skill_id: String) -> Result<bool, String> {
    Err("技能卸载功能仅在商业版中可用".to_string())
}

#[cfg(not(feature = "commercial"))]
#[tauri::command]
pub async fn activate_skill(_project_root: String, _skill_id: String) -> Result<bool, String> {
    Err("技能激活功能仅在商业版中可用".to_string())
}

#[cfg(not(feature = "commercial"))]
#[tauri::command]
pub async fn deactivate_skill(_project_root: String, _skill_id: String) -> Result<bool, String> {
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
