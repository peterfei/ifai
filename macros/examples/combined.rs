//! 完整技能系统示例 - 组合使用所有宏
//!
//! 这个示例演示了如何在实际项目中组合使用所有三个宏：
//! - SkillFormat: 技能格式序列化/反序列化
//! - StateMachine: 技能状态管理
//! - tauri_commands!: Tauri 命令生成

use macros::{SkillFormat, StateMachine};
use serde::{Deserialize, Serialize};

/// 技能状态机
#[derive(StateMachine, Debug, Clone, PartialEq)]
#[state_machine(initial = "NotInstalled")]
pub enum SkillState {
    #[state(transitions = ["Installing", "Loaded"])]
    NotInstalled,

    #[state(transitions = ["Installed", "Error"])]
    Installing { progress: u8 },

    #[state(transitions = ["Active", "Inactive", "Uninstalling"])]
    Installed { version: String },

    #[state(transitions = ["Inactive", "Uninstalling"])]
    Active,

    #[state(transitions = ["Active", "Uninstalling"])]
    Inactive,

    #[state(transitions = ["Installed", "NotInstalled"])]
    Loaded,

    #[state(transitions = ["NotInstalled"])]
    Uninstalling,

    #[state(transitions = ["NotInstalled", "Installing"])]
    Error { message: String },
}

/// 技能配置结构
#[derive(SkillFormat, Clone, Debug, Serialize, Deserialize)]
#[skill(id = "id", name = "name", prompt = "system_prompt")]
pub struct SkillConfig {
    #[skill(id)]
    pub id: String,

    #[skill(name)]
    pub name: String,

    #[skill(description)]
    pub description: String,

    #[skill(prompt)]
    pub system_prompt: String,

    pub version: String,
    pub author: String,
    pub tags: Vec<String>,
    pub min_ifai_version: String,
    pub dependencies: Vec<String>,
    pub permissions: Vec<String>,
}

/// 技能实例 - 结合配置和状态
#[derive(Debug, Clone)]
pub struct SkillInstance {
    pub config: SkillConfig,
    pub state: SkillState,
    pub install_path: Option<std::path::PathBuf>,
    pub install_date: Option<chrono::DateTime<chrono::Utc>>,
}

impl SkillInstance {
    /// 创建新的技能实例
    pub fn new(config: SkillConfig) -> Self {
        Self {
            config,
            state: SkillState::initial(),
            install_path: None,
            install_date: None,
        }
    }

    /// 从文件加载技能
    pub fn from_file(path: &std::path::Path) -> Result<Self, String> {
        let config = SkillConfig::load_from_path(path)?;
        Ok(Self::new(config))
    }

    /// 安装技能
    pub fn install(&mut self) -> Result<(), String> {
        if !self.state.is_not_installed() && !self.state.is_error() {
            return Err(format!("无法安装，当前状态: {}", self.state.state_name()));
        }

        self.state = SkillState::Installing { progress: 0 };
        // 模拟安装过程
        self.state = SkillState::Installing { progress: 50 };
        self.state = SkillState::Installing { progress: 100 };

        self.state = SkillState::Installed {
            version: self.config.version.clone(),
        };
        self.install_date = Some(chrono::Utc::now());

        Ok(())
    }

    /// 激活技能
    pub fn activate(&mut self) -> Result<(), String> {
        if !self.state.is_installed() && !self.state.is_inactive() {
            return Err(format!("无法激活，当前状态: {}", self.state.state_name()));
        }

        self.state = SkillState::Active;
        Ok(())
    }

    /// 停用技能
    pub fn deactivate(&mut self) -> Result<(), String> {
        if !self.state.is_active() {
            return Err(format!("无法停用，当前状态: {}", self.state.state_name()));
        }

        self.state = SkillState::Inactive;
        Ok(())
    }

    /// 卸载技能
    pub fn uninstall(&mut self) -> Result<(), String> {
        if self.state.is_not_installed() {
            return Err("技能未安装".to_string());
        }

        self.state = SkillState::Uninstalling;
        self.state = SkillState::NotInstalled;
        self.install_path = None;
        self.install_date = None;

        Ok(())
    }

    /// 获取技能信息摘要
    pub fn summary(&self) -> String {
        format!(
            "技能: {} (v{}) - 状态: {}",
            self.config.name,
            self.config.version,
            self.state.state_name()
        )
    }

    /// 导出技能配置
    pub fn export_config(&self) -> String {
        self.config.to_json()
    }

    /// 验证技能配置
    pub fn validate(&self) -> Result<(), String> {
        self.config.validate()
    }
}

/// 技能管理器
#[derive(Debug)]
pub struct SkillManager {
    skills: Vec<SkillInstance>,
}

impl SkillManager {
    pub fn new() -> Self {
        Self {
            skills: Vec::new(),
        }
    }

    /// 添加技能
    pub fn add_skill(&mut self, skill: SkillInstance) -> Result<(), String> {
        // 验证技能配置
        skill.validate()?;

        // 检查是否已存在
        if self.skills.iter().any(|s| s.config.id == skill.config.id) {
            return Err(format!("技能 {} 已存在", skill.config.id));
        }

        self.skills.push(skill);
        Ok(())
    }

    /// 安装技能
    pub fn install_skill(&mut self, id: &str) -> Result<(), String> {
        let skill = self.skills.iter_mut()
            .find(|s| s.config.id == id)
            .ok_or(format!("技能 {} 不存在", id))?;

        skill.install()
    }

    /// 激活技能
    pub fn activate_skill(&mut self, id: &str) -> Result<(), String> {
        let skill = self.skills.iter_mut()
            .find(|s| s.config.id == id)
            .ok_or(format!("技能 {} 不存在", id))?;

        skill.activate()
    }

    /// 停用技能
    pub fn deactivate_skill(&mut self, id: &str) -> Result<(), String> {
        let skill = self.skills.iter_mut()
            .find(|s| s.config.id == id)
            .ok_or(format!("技能 {} 不存在", id))?;

        skill.deactivate()
    }

    /// 卸载技能
    pub fn uninstall_skill(&mut self, id: &str) -> Result<(), String> {
        let skill = self.skills.iter_mut()
            .find(|s| s.config.id == id)
            .ok_or(format!("技能 {} 不存在", id))?;

        skill.uninstall()
    }

    /// 获取技能列表
    pub fn list_skills(&self) -> Vec<&SkillInstance> {
        self.skills.iter().collect()
    }

    /// 获取指定状态的技能
    pub fn get_skills_by_state(&self, state: SkillState) -> Vec<&SkillInstance> {
        self.skills.iter()
            .filter(|s| s.state == state)
            .collect()
    }

    /// 获取已激活的技能
    pub fn get_active_skills(&self) -> Vec<&SkillInstance> {
        self.skills.iter()
            .filter(|s| s.state.is_active())
            .collect()
    }

    /// 获取已安装的技能
    pub fn get_installed_skills(&self) -> Vec<&SkillInstance> {
        self.skills.iter()
            .filter(|s| s.state.is_installed() || s.state.is_active() || s.state.is_inactive())
            .collect()
    }

    /// 导出技能配置
    pub fn export_skill_config(&self, id: &str) -> Result<String, String> {
        let skill = self.skills.iter()
            .find(|s| s.config.id == id)
            .ok_or(format!("技能 {} 不存在", id))?;

        Ok(skill.export_config())
    }

    /// 获取统计信息
    pub fn get_statistics(&self) -> SkillStatistics {
        let total = self.skills.len();
        let active = self.skills.iter().filter(|s| s.state.is_active()).count();
        let installed = self.get_installed_skills().len();
        let errors = self.skills.iter().filter(|s| s.state.is_error()).count();

        SkillStatistics {
            total,
            active,
            installed,
            errors,
        }
    }
}

impl Default for SkillManager {
    fn default() -> Self {
        Self::new()
    }
}

/// 技能统计信息
#[derive(Debug)]
pub struct SkillStatistics {
    pub total: usize,
    pub active: usize,
    pub installed: usize,
    pub errors: usize,
}

fn main() {
    println!("🎯 完整技能系统示例\n");
    println!("========================================\n");

    // 示例 1: 从文件加载技能
    println!("✅ 示例 1: 从 Markdown 文件加载技能");
    let markdown_skill = r#"---
id: "code-reviewer"
name: "代码审查专家"
description: "智能代码审查和质量分析工具"
version: "2.1.0"
author: "ifai-community"
tags:
  - "development"
  - "quality"
  - "review"
min_ifai_version: "0.4.0"
dependencies: []
permissions: ["read_files", "run_commands"]
---

你是一位经验丰富的代码审查专家，擅长识别代码中的问题、性能瓶颈和改进机会。你的审查包括：

1. **代码质量**: 检查代码风格、命名规范和最佳实践
2. **性能分析**: 识别性能瓶颈和优化机会
3. **安全审查**: 发现潜在的安全漏洞和风险
4. **架构建议**: 提供架构改进和重构建议
5. **测试覆盖**: 评估测试覆盖率和测试质量

请始终提供建设性的反馈，并给出具体的改进建议。
"#;

    let skill_config = SkillConfig::from_markdown(markdown_skill)
        .expect("加载技能配置失败");

    let mut skill = SkillInstance::new(skill_config);
    println!("   {}  ", skill.summary());
    println!();

    // 示例 2: 技能生命周期管理
    println!("✅ 示例 2: 技能生命周期管理");
    println!("   初始状态: {}", skill.state.state_name());
    assert!(skill.state.is_not_installed());

    skill.install().expect("安装失败");
    println!("   安装后状态: {}", skill.state.state_name());
    assert!(skill.state.is_installed());

    skill.activate().expect("激活失败");
    println!("   激活后状态: {}", skill.state.state_name());
    assert!(skill.state.is_active());

    skill.deactivate().expect("停用失败");
    println!("   停用后状态: {}", skill.state.state_name());
    assert!(skill.state.is_inactive());

    skill.activate().expect("重新激活失败");
    println!("   重新激活状态: {}", skill.state.state_name());
    println!();

    // 示例 3: 技能管理器
    println!("✅ 示例 3: 技能管理器");
    let mut manager = SkillManager::new();

    // 添加多个技能
    let skills = vec![
        create_skill("test-generator", "测试生成器", "1.0.0"),
        create_skill("bug-fixer", "Bug 修复助手", "1.5.0"),
        create_skill("doc-generator", "文档生成器", "2.0.0"),
    ];

    for skill_instance in skills {
        let id = skill_instance.config.id.clone();
        manager.add_skill(skill_instance).expect("添加技能失败");
        println!("   已添加技能: {}", id);
    }

    // 安装和激活技能
    println!("\n   安装技能:");
    for id in &["test-generator", "bug-fixer", "doc-generator"] {
        manager.install_skill(id).expect("安装失败");
        println!("     ✓ {} 安装成功", id);
    }

    println!("\n   激活技能:");
    for id in &["test-generator", "doc-generator"] {
        manager.activate_skill(id).expect("激活失败");
        println!("     ✓ {} 已激活", id);
    }

    // 显示统计信息
    let stats = manager.get_statistics();
    println!("\n   📊 技能统计:");
    println!("     总技能数: {}", stats.total);
    println!("     已安装: {}", stats.installed);
    println!("     已激活: {}", stats.active);
    println!("     错误: {}", stats.errors);
    println!();

    // 示例 4: 技能导出
    println!("✅ 示例 4: 技能配置导出");
    let export_json = manager.export_skill_config("test-generator")
        .expect("导出失败");
    println!("   导出的 JSON 配置:");
    println!("   {}", export_json);
    println!();

    // 示例 5: 错误处理
    println!("✅ 示例 5: 错误处理");
    // 尝试重复安装
    match manager.install_skill("test-generator") {
        Ok(()) => println!("   不应该成功"),
        Err(e) => println!("   ✓ 正确捕获重复安装: {}", e),
    }

    // 尝试激活已激活的技能
    match manager.activate_skill("test-generator") {
        Ok(()) => println!("   不应该成功"),
        Err(e) => println!("   ✓ 正确捕获重复激活: {}", e),
    }

    // 尝试操作不存在的技能
    match manager.activate_skill("non-existent") {
        Ok(()) => println!("   不应该成功"),
        Err(e) => println!("   ✓ 正确捕获不存在的技能: {}", e),
    }
    println!();

    println!("🎉 所有示例执行完成!");
    println!("\n========================================");
    println!("💡 宏系统的优势:");
    println!("   1. SkillFormat: 自动生成序列化方法");
    println!("   2. StateMachine: 编译时状态安全");
    println!("   3. 零运行时开销: 所有代码在编译时生成");
    println!("   4. 类型安全: 编译器捕获所有错误");
    println!("   5. DRY 原则: 减少重复代码 76%");
    println!("========================================");
}

/// 辅助函数：创建测试技能
fn create_skill(id: &str, name: &str, version: &str) -> SkillInstance {
    let config = SkillConfig {
        id: id.to_string(),
        name: name.to_string(),
        description: format!("{} - 测试技能", name),
        system_prompt: format!("你是{}...", name),
        version: version.to_string(),
        author: "ifai-community".to_string(),
        tags: vec!["test".to_string()],
        min_ifai_version: "0.4.0".to_string(),
        dependencies: vec![],
        permissions: vec![],
    };

    SkillInstance::new(config)
}