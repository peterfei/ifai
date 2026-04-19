//! SkillFormat 宏使用示例
//!
//! 这个示例演示了如何使用 SkillFormat derive 宏
//! 自动生成技能格式的序列化/反序列化方法

use macros::SkillFormat;
use serde::{Deserialize, Serialize};

/// 定义技能结构体，使用 SkillFormat 宏
#[derive(SkillFormat, Clone, Debug, Serialize, Deserialize)]
#[skill(id = "id", name = "name", prompt = "system_prompt")]
pub struct Skill {
    /// 技能唯一标识符
    #[skill(id)]
    pub id: String,

    /// 技能显示名称
    #[skill(name)]
    pub name: String,

    /// 技能描述
    #[skill(description)]
    pub description: String,

    /// 系统提示词
    #[skill(prompt)]
    pub system_prompt: String,

    /// 技能版本
    pub version: String,

    /// 技能标签
    pub tags: Vec<String>,

    /// 技能作者
    pub author: Option<String>,

    /// 技能依赖
    pub dependencies: Vec<String>,
}

fn main() {
    // 示例 1: 从 JSON 创建技能
    let json_data = r#"
{
  "id": "code-review",
  "name": "代码审查",
  "description": "执行全面的代码审查，识别潜在问题和改进建议",
  "system_prompt": "你是一位经验丰富的代码审查专家...",
  "version": "1.0.0",
  "tags": ["development", "quality", "review"],
  "author": "ifai-community",
  "dependencies": ["git", "linter"]
}
"#;

    match Skill::from_json(json_data) {
        Ok(skill) => {
            println!("✅ 从 JSON 创建成功:");
            println!("   ID: {}", skill.id);
            println!("   名称: {}", skill.name);
            println!("   版本: {}", skill.version);
            println!();
        }
        Err(e) => {
            println!("❌ JSON 解析失败: {}", e);
        }
    }

    // 示例 2: 从 Markdown (YAML frontmatter) 创建技能
    let markdown_data = r#"---
id: "test-generator"
name: "测试生成器"
description: "自动生成单元测试和集成测试"
version: "2.1.0"
tags:
  - "testing"
  - "automation"
  - "quality"
author: "ifai-community"
dependencies: []
---

你是一位专业的测试工程师，擅长为各种编程语言生成高质量的测试用例。你的任务包括：

1. 分析提供的代码结构和逻辑
2. 识别边界条件和错误场景
3. 生成全面的单元测试
4. 创建集成测试用例
5. 提供测试最佳实践建议

请始终遵循测试驱动开发(TDD)原则，确保测试覆盖率超过 80%。
"#;

    match Skill::from_markdown(markdown_data) {
        Ok(skill) => {
            println!("✅ 从 Markdown 创建成功:");
            println!("   ID: {}", skill.id);
            println!("   名称: {}", skill.name);
            println!("   提示词长度: {} 字符", skill.system_prompt.len());
            println!("   标签: {:?}", skill.tags);
            println!();
        }
        Err(e) => {
            println!("❌ Markdown 解析失败: {}", e);
        }
    }

    // 示例 3: 从 YAML 创建技能
    let yaml_data = r#"
id: "bug-fixer"
name: "Bug 修复助手"
description: "智能分析和修复代码中的 Bug"
version: "1.5.2"
tags:
  - "debugging"
  - "fixes"
  - "maintenance"
author: "ifai-community"
dependencies:
  - "ast-parser"
  - "code-formatter"
system_prompt: "你是一位专业的调试工程师..."
"#;

    match Skill::from_yaml(yaml_data) {
        Ok(skill) => {
            println!("✅ 从 YAML 创建成功:");
            println!("   ID: {}", skill.id);
            println!("   版本: {}", skill.version);
            println!();
        }
        Err(e) => {
            println!("❌ YAML 解析失败: {}", e);
        }
    }

    // 示例 4: 自动格式检测
    let auto_detect_json = r#"
{
  "id": "auto-detect",
  "name": "自动检测示例",
  "description": "测试自动格式检测功能",
  "system_prompt": "测试提示词",
  "version": "1.0.0",
  "tags": [],
  "dependencies": []
}
"#;

    match Skill::from_str(auto_detect_json) {
        Ok(skill) => {
            println!("✅ 自动格式检测成功 (JSON):");
            println!("   检测到格式: JSON");
            println!("   ID: {}", skill.id);
            println!();
        }
        Err(e) => {
            println!("❌ 自动格式检测失败: {}", e);
        }
    }

    // 示例 5: 技能验证
    let valid_skill = Skill {
        id: "validator".to_string(),
        name: "验证器".to_string(),
        description: "测试验证功能".to_string(),
        system_prompt: "验证提示词".to_string(),
        version: "1.0.0".to_string(),
        tags: vec!["validation".to_string()],
        author: Some("ifai-community".to_string()),
        dependencies: vec![],
    };

    match valid_skill.validate() {
        Ok(()) => {
            println!("✅ 技能验证通过:");
            println!("   ID: {}", valid_skill.id);
            println!("   所有必需字段都存在");
            println!();
        }
        Err(e) => {
            println!("❌ 验证失败: {}", e);
        }
    }

    // 示例 6: 导出为不同格式
    let export_skill = Skill {
        id: "exporter".to_string(),
        name: "导出器".to_string(),
        description: "测试导出功能".to_string(),
        system_prompt: "导出提示词".to_string(),
        version: "1.0.0".to_string(),
        tags: vec!["export".to_string()],
        author: Some("ifai-community".to_string()),
        dependencies: vec![],
    };

    println!("✅ 导出为不同格式:");
    println!("--- JSON ---");
    println!("{}", export_skill.to_json());
    println!("\n--- YAML ---");
    println!("{}", export_skill.to_yaml());
    println!("\n--- Markdown ---");
    println!("{}", export_skill.to_markdown());

    // 示例 7: 错误处理 - 缺少必需字段
    let invalid_json = r#"
{
  "name": "无效技能",
  "description": "缺少 ID 和 system_prompt"
}
"#;

    match Skill::from_json(invalid_json) {
        Ok(_) => {
            println!("❌ 不应该成功");
        }
        Err(e) => {
            println!("✅ 正确捕获了无效 JSON:");
            println!("   错误: {}", e);
            println!();
        }
    }

    println!("🎉 所有示例执行完成!");
}