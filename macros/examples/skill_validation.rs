//! SkillFormat 增强验证功能示例
//!
//! 这个示例演示了 Phase 1 新增的验证功能：
//! - ID 格式验证（kebab-case）
//! - 版本号验证（semver）
//! - 依赖循环检测
//! - 兼容性表达式解析

use macros::SkillFormat;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// 定义技能结构体
#[derive(SkillFormat, Clone, Debug, Serialize, Deserialize)]
#[skill(id = "id", name = "name", prompt = "system_prompt")]
pub struct Skill {
    #[skill(id)]
    pub id: String,

    #[skill(name)]
    pub name: String,

    #[skill(description)]
    pub description: String,

    #[skill(prompt)]
    pub system_prompt: String,

    pub version: String,
    pub min_ifai_version: String,
    pub dependencies: Vec<String>,
    pub tags: Vec<String>,
}

fn main() {
    println!("🎯 SkillFormat 增强验证功能示例\n");
    println!("========================================\n");

    // 示例 1: ID 格式验证
    println!("✅ 示例 1: ID 格式验证（kebab-case）");
    let long_id = "a".repeat(100);
    let test_ids: Vec<(&str, bool)> = vec![
        ("valid-skill", true),
        ("another-valid-skill-123", true),
        ("Invalid", false),           // 大写字母
        ("invalid_skill", false),     // 下划线
        ("-invalid", false),          // 以连字符开头
        ("invalid-", false),          // 以连字符结尾
        ("invalid--skill", false),    // 连续连字符
        ("123invalid", false),        // 以数字开头
        ("", false),                  // 空字符串
        (long_id.as_str(), false),    // 过长
    ];

    for (id, expected_valid) in test_ids {
        let is_valid = Skill::is_valid_skill_id(id);
        let status = if is_valid == expected_valid {
            "✓"
        } else {
            "✗"
        };
        println!("   {} ID: {:30} -> 预期: {}, 实际: {}",
            status, id, expected_valid, is_valid);
    }
    println!();

    // 示例 2: 版本号验证
    println!("✅ 示例 2: 版本号验证（semver）");
    let test_versions = vec![
        ("1.0.0", true),
        ("0.4.1", true),
        ("2.1.3-beta", true),    // 带预发布标识符
        ("1.0.0+build.1", true),  // 带构建元数据
        ("1.0", true),            // major.minor（省略 patch）
        ("1", false),             // 只有 major（太少）
        ("1.0.0.0", false),       // 过多部分
        ("v1.0.0", false),        // 前缀 v
        ("1.0.0-", false),        // 空预发布
        ("01.0.0", false),        // 前导零
        ("invalid", false),       // 完全无效
        ("0.0", true),            // 最小有效版本
        ("10.20.30", true),       // 大版本号
    ];

    for (version, expected_valid) in &test_versions {
        let result = Skill::validate_version(version);
        let is_valid = result.is_ok();
        let status = if is_valid == *expected_valid {
            "✓"
        } else {
            "✗"
        };
        println!("   {} 版本: {:20} -> 预期: {}, 实际: {}",
            status, version, expected_valid, is_valid);
        if let Err(e) = result {
            println!("      错误: {}", e);
        }
    }
    println!();

    // 示例 3: 兼容性表达式解析
    println!("✅ 示例 3: 兼容性表达式解析");
    let compat_exprs = vec![
        ">=0.4.0",
        "^1.0.0",
        "~1.2.3",
        "=2.0.0",
        ">1.0.0",
        "<2.0.0",
        "1.5.0", // 默认为 =
    ];

    for expr in compat_exprs {
        match Skill::parse_compatibility_expr(expr) {
            Ok((op, version)) => {
                println!("   表达式: {:15} -> 操作符: {:4}, 版本: {}", expr, op, version);
            }
            Err(e) => {
                println!("   表达式: {:15} -> 错误: {}", expr, e);
            }
        }
    }
    println!();

    // 示例 4: 版本兼容性检查
    println!("✅ 示例 4: 版本兼容性检查");
    let compat_tests = vec![
        (">=0.4.0", "0.4.1", true),
        (">=0.4.0", "0.3.9", false),
        ("^1.0.0", "1.5.0", true),
        ("^1.0.0", "2.0.0", false),
        ("~1.2.0", "1.2.5", true),
        ("~1.2.0", "1.3.0", false),
        ("=1.0.0", "1.0.0", true),
        ("=1.0.0", "1.0.1", false),
    ];

    for (required, current, expected) in &compat_tests {
        match Skill::check_compatibility(required, current) {
            Ok(is_compatible) => {
                let status = if is_compatible == *expected {
                    "✓"
                } else {
                    "✗"
                };
                println!("   {} 要求: {:10} vs {:8} -> 预期: {}, 实际: {}",
                    status, required, current, expected, is_compatible);
            }
            Err(e) => {
                println!("   ✗ 要求: {:10} vs {:8} -> 错误: {}", required, current, e);
            }
        }
    }
    println!();

    // 示例 5: 依赖循环检测
    println!("✅ 示例 5: 依赖循环检测");
    let mut skills_map: HashMap<String, Vec<String>> = HashMap::new();

    // 无循环的依赖关系
    skills_map.insert("core".to_string(), vec![]);
    skills_map.insert("utils".to_string(), vec!["core".to_string()]);
    skills_map.insert("api".to_string(), vec!["core".to_string(), "utils".to_string()]);

    // 检测无循环的情况
    for (skill_id, deps) in &skills_map {
        match Skill::detect_dependency_cycle(skill_id, deps, &skills_map) {
            Ok(()) => {
                println!("   ✓ 技能 '{}' 的依赖无循环", skill_id);
            }
            Err(e) => {
                println!("   ✗ 技能 '{}' 的依赖检测失败: {}", skill_id, e);
            }
        }
    }

    // 添加循环依赖
    println!("\n   添加循环依赖: core -> api -> core");
    skills_map.insert("core".to_string(), vec!["api".to_string()]);

    match Skill::detect_dependency_cycle("core", &skills_map["core"], &skills_map) {
        Ok(()) => {
            println!("   ✗ 未检测到预期的循环依赖");
        }
        Err(e) => {
            println!("   ✓ 成功检测到循环依赖: {}", e);
        }
    }
    println!();

    // 示例 6: 完整的技能验证
    println!("✅ 示例 6: 完整的技能验证");
    let valid_skill = Skill {
        id: "code-reviewer".to_string(),
        name: "代码审查专家".to_string(),
        description: "智能代码审查工具".to_string(),
        system_prompt: "你是一位代码审查专家...".to_string(),
        version: "1.0.0".to_string(),
        min_ifai_version: ">=0.4.0".to_string(),
        dependencies: vec!["git-parser".to_string()],
        tags: vec!["development".to_string(), "quality".to_string()],
    };

    match valid_skill.validate() {
        Ok(()) => {
            println!("   ✓ 有效技能: {}", valid_skill.id);
        }
        Err(e) => {
            println!("   ✗ 验证失败: {}", e);
        }
    }

    // 测试无效的 ID
    let invalid_skill = Skill {
        id: "Invalid_ID".to_string(), // 大写和下划线
        name: "无效技能".to_string(),
        description: "测试无效 ID".to_string(),
        system_prompt: "测试...".to_string(),
        version: "1.0.0".to_string(),
        min_ifai_version: ">=0.4.0".to_string(),
        dependencies: vec![],
        tags: vec![],
    };

    match invalid_skill.validate() {
        Ok(()) => {
            println!("   ✗ 应该验证失败但成功了");
        }
        Err(e) => {
            println!("   ✓ 正确捕获无效 ID: {}", e);
        }
    }
    println!();

    // 示例 7: 实际使用场景
    println!("✅ 示例 7: 实际使用场景");
    let skill_markdown = r#"---
id: "test-generator"
name: "测试生成器"
description: "自动生成单元测试"
system_prompt: "你是一位专业的测试工程师..."
version: "2.1.0"
min_ifai_version: ">=0.4.0"
dependencies:
  - "ast-parser"
  - "code-formatter"
tags:
  - "testing"
  - "automation"
---

你是一位专业的测试工程师，擅长为各种编程语言生成高质量的测试用例。

## 功能特性

1. 单元测试生成
2. 集成测试创建
3. 边界条件检测
4. 性能测试建议

请确保测试覆盖率超过 80%。
"#;

    match Skill::from_markdown(skill_markdown) {
        Ok(skill) => {
            println!("   ✓ 从 Markdown 加载成功");

            // 验证技能
            match skill.validate() {
                Ok(()) => {
                    println!("   ✓ 技能验证通过");
                    println!("      ID: {}", skill.id);
                    println!("      名称: {}", skill.name);
                    println!("      版本: {}", skill.version);

                    // 验证版本号
                    if let Err(e) = Skill::validate_version(&skill.version) {
                        println!("   ✗ 版本验证失败: {}", e);
                    } else {
                        println!("   ✓ 版本号格式正确");
                    }

                    // 检查兼容性
                    match Skill::check_compatibility(&skill.min_ifai_version, "0.4.1") {
                        Ok(compatible) => {
                            if compatible {
                                println!("   ✓ 版本兼容: 需要 {}，当前 0.4.1", skill.min_ifai_version);
                            } else {
                                println!("   ✗ 版本不兼容: 需要 {}，当前 0.4.1", skill.min_ifai_version);
                            }
                        }
                        Err(e) => {
                            println!("   ✗ 兼容性检查失败: {}", e);
                        }
                    }
                }
                Err(e) => {
                    println!("   ✗ 技能验证失败: {}", e);
                }
            }
        }
        Err(e) => {
            println!("   ✗ 加载失败: {}", e);
        }
    }
    println!();

    println!("🎉 所有示例执行完成!");
    println!("\n========================================");
    println!("💡 Phase 1 新增功能:");
    println!("   1. ✓ ID 格式验证（kebab-case）");
    println!("   2. ✓ 版本号验证（semver）");
    println!("   3. ✓ 依赖循环检测");
    println!("   4. ✓ 兼容性表达式解析");
    println!("   5. ✓ 版本兼容性检查");
    println!("========================================");
}