//! StateMachine 宏使用示例
//!
//! 这个示例演示了如何使用 StateMachine derive 宏
//! 自动生成类型安全的状态机

use macros::StateMachine;

/// 定义技能状态机
#[derive(StateMachine, Debug, Clone, PartialEq)]
#[state_machine(initial = "NotInstalled")]
pub enum SkillState {
    /// 未安装状态
    #[state(transitions = ["Installing"])]
    NotInstalled,

    /// 安装中状态
    #[state(transitions = ["Installed", "Error"])]
    Installing {
        progress: u8,
    },

    /// 已安装状态
    #[state(transitions = ["Active", "Uninstalling"])]
    Installed {
        version: String,
    },

    /// 激活状态
    #[state(transitions = ["Inactive", "Uninstalling"])]
    Active,

    /// 未激活状态
    #[state(transitions = ["Active", "Uninstalling"])]
    Inactive,

    /// 卸载中状态
    #[state(transitions = ["NotInstalled"])]
    Uninstalling,

    /// 错误状态
    #[state(transitions = ["NotInstalled", "Installing"])]
    Error {
        message: String,
    },
}

fn main() {
    println!("🎯 StateMachine 宏使用示例\n");
    println!("========================================\n");

    // 示例 1: 创建初始状态
    let initial_state = SkillState::initial();
    println!("✅ 初始状态:");
    println!("   状态: {:?}", initial_state);
    println!("   状态名称: {}", initial_state.state_name());
    println!();

    // 示例 2: 状态查询方法
    let states = vec![
        SkillState::NotInstalled,
        SkillState::Installing { progress: 50 },
        SkillState::Installed { version: "1.0.0".to_string() },
        SkillState::Active,
        SkillState::Inactive,
        SkillState::Uninstalling,
        SkillState::Error { message: "安装失败".to_string() },
    ];

    println!("✅ 状态查询方法:");
    for state in &states {
        println!("   {:?}:", state);
        println!("      is_not_installed(): {}", state.is_not_installed());
        println!("      is_installing(): {}", state.is_installing());
        println!("      is_installed(): {}", state.is_installed());
        println!("      is_active(): {}", state.is_active());
        println!("      is_inactive(): {}", state.is_inactive());
        println!("      is_uninstalling(): {}", state.is_uninstalling());
        println!("      is_error(): {}", state.is_error());
        println!();
    }

    // 示例 3: Default trait 实现
    let default_state = SkillState::default();
    println!("✅ Default trait:");
    println!("   默认状态: {:?}", default_state);
    println!("   状态名称: {}", default_state.state_name());
    println!();

    // 示例 4: 状态转换流程
    println!("✅ 状态转换流程:");
    let mut current_state = SkillState::NotInstalled;

    // 模拟安装流程
    println!("   1. 初始状态: {}", current_state.state_name());
    assert!(current_state.is_not_installed());

    // 转换到安装中
    current_state = SkillState::Installing { progress: 0 };
    println!("   2. 开始安装: {}", current_state.state_name());
    assert!(current_state.is_installing());

    // 安装进度更新
    current_state = SkillState::Installing { progress: 50 };
    println!("   3. 安装进度更新");
    if let SkillState::Installing { progress } = current_state {
        println!("      进度: {}%", progress);
    }

    // 安装完成
    current_state = SkillState::Installed { version: "1.0.0".to_string() };
    println!("   4. 安装完成: {}", current_state.state_name());
    assert!(current_state.is_installed());
    if let SkillState::Installed { version } = current_state {
        println!("      版本: {}", version);
    }

    // 激活技能
    current_state = SkillState::Active;
    println!("   5. 激活技能: {}", current_state.state_name());
    assert!(current_state.is_active());

    // 停用技能
    current_state = SkillState::Inactive;
    println!("   6. 停用技能: {}", current_state.state_name());
    assert!(current_state.is_inactive());

    // 卸载技能
    current_state = SkillState::Uninstalling;
    println!("   7. 卸载技能: {}", current_state.state_name());
    assert!(current_state.is_uninstalling());

    // 卸载完成
    current_state = SkillState::NotInstalled;
    println!("   8. 卸载完成: {}", current_state.state_name());
    assert!(current_state.is_not_installed());
    println!();

    // 示例 5: 错误处理流程
    println!("✅ 错误处理流程:");
    let mut error_state = SkillState::Installing { progress: 30 };

    error_state = SkillState::Error { message: "网络连接失败".to_string() };
    println!("   1. 安装出错: {}", error_state.state_name());
    assert!(error_state.is_error());
    if let SkillState::Error { message } = error_state {
        println!("      错误信息: {}", message);
    }

    // 重试安装
    error_state = SkillState::Installing { progress: 0 };
    println!("   2. 重新尝试安装: {}", error_state.state_name());
    assert!(error_state.is_installing());
    println!();

    // 示例 6: 模式匹配
    println!("✅ 模式匹配:");
    let test_state = SkillState::Installing { progress: 75 };

    match test_state {
        SkillState::NotInstalled => {
            println!("   技能未安装");
        }
        SkillState::Installing { progress } => {
            println!("   技能安装中，进度: {}%", progress);
        }
        SkillState::Installed { version } => {
            println!("   技能已安装，版本: {}", version);
        }
        SkillState::Active => {
            println!("   技能已激活");
        }
        SkillState::Inactive => {
            println!("   技能未激活");
        }
        SkillState::Uninstalling => {
            println!("   技能卸载中");
        }
        SkillState::Error { message } => {
            println!("   技能错误: {}", message);
        }
    }
    println!();

    // 示例 7: 集合操作
    println!("✅ 集合操作:");
    let all_states = vec![
        SkillState::NotInstalled,
        SkillState::Installing { progress: 100 },
        SkillState::Installed { version: "2.0.0".to_string() },
        SkillState::Active,
    ];

    let active_count = all_states.iter().filter(|s| s.is_active()).count();
    let installed_count = all_states.iter().filter(|s| s.is_installed()).count();

    println!("   总状态数: {}", all_states.len());
    println!("   激活状态数: {}", active_count);
    println!("   已安装状态数: {}", installed_count);
    println!();

    println!("🎉 所有示例执行完成!");
    println!("\n========================================");
    println!("💡 StateMachine 宏的优势:");
    println!("   1. 编译时类型安全的状态转换");
    println!("   2. 自动生成状态查询方法");
    println!("   3. 支持 Default trait");
    println!("   4. 清晰的状态名称输出");
    println!("   5. 模式匹配支持");
    println!("========================================");
}