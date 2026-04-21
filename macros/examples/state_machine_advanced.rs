//! StateMachine 增强功能示例
//!
//! 这个示例演示了 Phase 2 新增的状态机增强功能：
//! - 状态转换验证
//! - 允许的转换查询
//! - 转换规则检查

use macros::StateMachine;

/// 定义技能状态机
#[derive(StateMachine, Debug, Clone, PartialEq)]
#[state_machine(initial = "NotInstalled")]
pub enum SkillState {
    /// 未安装状态
    #[state(transitions = ["Installing", "Loaded"])]
    NotInstalled,

    /// 安装中状态
    #[state(transitions = ["Installed", "Error"])]
    Installing {
        progress: u8,
    },

    /// 已安装状态
    #[state(transitions = ["Active", "Inactive", "Uninstalling"])]
    Installed {
        version: String,
    },

    /// 激活状态
    #[state(transitions = ["Inactive", "Uninstalling"])]
    Active,

    /// 未激活状态
    #[state(transitions = ["Active", "Uninstalling"])]
    Inactive,

    /// 已加载状态
    #[state(transitions = ["Active", "Uninstalling"])]
    Loaded,

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
    println!("🎯 StateMachine 增强功能示例\n");
    println!("========================================\n");

    // 示例 1: 状态转换验证
    println!("✅ 示例 1: 状态转换验证");
    let current = SkillState::NotInstalled;
    let target = SkillState::Installing { progress: 0 };

    let can_transition = current.can_transition_to(&target);
    println!("   从 {:?} 转换到 {:?}: {}",
        current.state_name(), target.state_name(), can_transition);
    assert!(can_transition, "应该可以转换");

    // 测试无效转换
    let invalid_target = SkillState::Active;
    let cannot_transition = current.can_transition_to(&invalid_target);
    println!("   从 {:?} 转换到 {:?}: {}",
        current.state_name(), invalid_target.state_name(), cannot_transition);
    assert!(!cannot_transition, "不应该能直接转换");
    println!();

    // 示例 2: validate_transition 方法
    println!("✅ 示例 2: validate_transition 方法");
    let installed = SkillState::Installed { version: "1.0.0".to_string() };

    match installed.validate_transition(&SkillState::Active) {
        Ok(()) => {
            println!("   ✓ 从 {:?} 转换到 Active: 有效",
                installed.state_name());
        }
        Err(e) => {
            println!("   ✗ 转换验证失败: {}", e);
        }
    }

    match installed.validate_transition(&SkillState::NotInstalled) {
        Ok(()) => {
            println!("   ✗ 不应该能直接转换到 NotInstalled");
        }
        Err(e) => {
            println!("   ✓ 正确捕获无效转换: {}", e);
        }
    }
    println!();

    // 示例 3: 获取允许的转换列表
    println!("✅ 示例 3: 获取允许的转换列表");
    let states = vec![
        SkillState::NotInstalled,
        SkillState::Installing { progress: 50 },
        SkillState::Installed { version: "1.0.0".to_string() },
        SkillState::Active,
        SkillState::Error { message: "错误".to_string() },
    ];

    for state in &states {
        let allowed = state.allowed_transitions();
        println!("   {:?} 可以转换到:", state.state_name());
        for target in allowed {
            println!("      → {}", target);
        }
    }
    println!();

    // 示例 4: 复杂转换路径验证
    println!("✅ 示例 4: 复杂转换路径验证");
    let path = vec![
        SkillState::NotInstalled,
        SkillState::Installing { progress: 100 },
        SkillState::Installed { version: "1.0.0".to_string() },
        SkillState::Active,
        SkillState::Inactive,
        SkillState::Uninstalling,
    ];

    println!("   验证转换路径:");
    for window in path.windows(2) {
        let from = &window[0];
        let to = &window[1];

        match from.validate_transition(to) {
            Ok(()) => {
                println!("      ✓ {} → {}",
                    from.state_name(), to.state_name());
            }
            Err(e) => {
                println!("      ✗ {} → {}: {}",
                    from.state_name(), to.state_name(), e);
            }
        }
    }
    println!();

    // 示例 5: 状态机规则完整性检查
    println!("✅ 示例 5: 状态机规则完整性检查");

    // 测试所有定义的转换
    let test_cases = vec![
        (SkillState::NotInstalled, SkillState::Installing { progress: 0 }, true),
        (SkillState::NotInstalled, SkillState::Loaded, true),
        (SkillState::Installing { progress: 50 }, SkillState::Installed { version: "1.0.0".to_string() }, true),
        (SkillState::Installing { progress: 50 }, SkillState::Error { message: "失败".to_string() }, true),
        (SkillState::Installed { version: "1.0.0".to_string() }, SkillState::Active, true),
        (SkillState::Installed { version: "1.0.0".to_string() }, SkillState::Inactive, true),
        (SkillState::Installed { version: "1.0.0".to_string() }, SkillState::Uninstalling, true),
        (SkillState::Active, SkillState::Inactive, true),
        (SkillState::Active, SkillState::Uninstalling, true),
        (SkillState::Inactive, SkillState::Active, true),
        (SkillState::Loaded, SkillState::Active, true),
        (SkillState::Uninstalling, SkillState::NotInstalled, true),
        (SkillState::Error { message: "错误".to_string() }, SkillState::NotInstalled, true),
        (SkillState::Error { message: "错误".to_string() }, SkillState::Installing { progress: 0 }, true),
        // 无效转换测试
        (SkillState::NotInstalled, SkillState::Active, false),
        (SkillState::Active, SkillState::Installing { progress: 0 }, false),
        (SkillState::Installed { version: "1.0.0".to_string() }, SkillState::NotInstalled, false),
    ];

    let mut passed = 0;
    let mut failed = 0;

    for (from, to, expected_valid) in test_cases {
        let is_valid = from.can_transition_to(&to);
        let status = if is_valid == expected_valid {
            passed += 1;
            "✓"
        } else {
            failed += 1;
            "✗"
        };
        println!("   {} {} → {} (预期: {}, 实际: {})",
            status,
            from.state_name(),
            to.state_name(),
            if expected_valid { "有效" } else { "无效" },
            if is_valid { "有效" } else { "无效" }
        );
    }

    println!("\n   统计: 通过 {}, 失败 {}", passed, failed);
    println!();

    // 示例 6: 实际应用场景 - 安全的状态转换
    println!("✅ 示例 6: 实际应用场景 - 安全的状态转换");

    let mut current_state = SkillState::initial();
    println!("   初始状态: {}", current_state.state_name());

    // 模拟技能安装流程
    let transitions = vec![
        SkillState::Installing { progress: 0 },
        SkillState::Installing { progress: 50 },
        SkillState::Installing { progress: 100 },
        SkillState::Installed { version: "1.0.0".to_string() },
        SkillState::Active,
    ];

    for next_state in transitions {
        match current_state.validate_transition(&next_state) {
            Ok(()) => {
                println!("   ✓ {} → {}",
                    current_state.state_name(), next_state.state_name());
                current_state = next_state;
            }
            Err(e) => {
                println!("   ✗ 无法转换到 {}: {}",
                    next_state.state_name(), e);
                break;
            }
        }
    }

    println!("   最终状态: {}", current_state.state_name());
    println!();

    // 示例 7: 错误恢复流程
    println!("✅ 示例 7: 错误恢复流程");
    let error_state = SkillState::Error {
        message: "网络连接失败".to_string()
    };

    println!("   当前状态: {} ({})",
        error_state.state_name(),
        if let SkillState::Error { message } = &error_state {
            message
        } else { "" }
    );

    // 显示从错误状态可以转换到的状态
    let recovery_options = error_state.allowed_transitions();
    println!("   可恢复到的状态:");
    for option in recovery_options {
        println!("      → {}", option);
    }

    // 尝试恢复
    let recovery_state = SkillState::Installing { progress: 0 };
    match error_state.validate_transition(&recovery_state) {
        Ok(()) => {
            println!("   ✓ 可以从错误状态恢复到: {}", recovery_state.state_name());
        }
        Err(e) => {
            println!("   ✗ 恢复失败: {}", e);
        }
    }
    println!();

    println!("🎉 所有示例执行完成!");
    println!("\n========================================");
    println!("💡 Phase 2 新增功能:");
    println!("   1. ✓ can_transition_to() - 检查转换是否有效");
    println!("   2. ✓ validate_transition() - 验证转换并返回详细错误");
    println!("   3. ✓ allowed_transitions() - 获取允许的转换列表");
    println!("   4. ✓ 编译时类型安全");
    println!("   5. ✓ 运行时转换验证");
    println!("========================================");
}
