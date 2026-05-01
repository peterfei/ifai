//! 测试 PermissionStore::load() 和 is_allowed() 的集成
//!
//! 运行方式：
//! ```bash
//! cargo run --example test_permission_load
//! ```

use ifainew::bin::ifai::permission_store::{PermissionRule, PermissionStore, RuleType};
use serde_json::json;

fn main() {
    println!("=== PermissionStore 加载和查询测试 ===\n");

    // 1. 加载现有的权限文件
    println!("1. 加载权限文件...");
    let store = PermissionStore::load();
    println!("✓ 已加载 {} 条持久化规则", store.persistent.len());
    println!("✓ 已加载 {} 条会话规则", store.session.len());

    // 2. 显示所有规则
    println!("\n2. 显示所有持久化规则：");
    if store.persistent.is_empty() {
        println!("  (无规则)");
    } else {
        for (i, rule) in store.persistent.iter().enumerate() {
            println!(
                "  [{}] {} / {} / {:?}",
                i + 1,
                rule.tool_name,
                rule.pattern,
                rule.rule_type
            );
        }
    }

    // 3. 测试查询
    println!("\n3. 测试权限查询：");

    // 测试 bash pwd 命令
    let pwd_args = json!({"cmd": "pwd"});
    let pwd_allowed = store.is_allowed("bash", &pwd_args);
    println!(
        "  bash pwd: {}",
        if pwd_allowed {
            "✓ 允许"
        } else {
            "✗ 拒绝"
        }
    );

    // 测试 bash ls -la 命令
    let ls_args = json!({"cmd": "ls -la"});
    let ls_allowed = store.is_allowed("bash", &ls_args);
    println!(
        "  bash ls -la: {}",
        if ls_allowed {
            "✓ 允许"
        } else {
            "✗ 拒绝"
        }
    );

    // 测试 bash git diff 命令
    let git_args = json!({"cmd": "git diff --stat"});
    let git_allowed = store.is_allowed("bash", &git_args);
    println!(
        "  bash git diff --stat: {}",
        if git_allowed {
            "✓ 允许"
        } else {
            "✗ 拒绝"
        }
    );

    // 4. 测试模式提取
    println!("\n4. 测试模式提取：");
    let pwd_pattern = PermissionStore::extract_pattern("bash", &pwd_args);
    println!("  pwd 模式: {}", pwd_pattern);

    let ls_pattern = PermissionStore::extract_pattern("bash", &ls_args);
    println!("  ls -la 模式: {}", ls_pattern);

    let git_pattern = PermissionStore::extract_pattern("bash", &git_args);
    println!("  git diff --stat 模式: {}", git_pattern);

    // 5. 测试目标值提取
    println!("\n5. 测试目标值提取（用于匹配）：");
    let pwd_target = PermissionStore::extract_target_value("bash", &pwd_args);
    println!("  pwd 目标值: '{}'", pwd_target);

    let ls_target = PermissionStore::extract_target_value("bash", &ls_args);
    println!("  ls -la 目标值: '{}'", ls_target);

    let git_target = PermissionStore::extract_target_value("bash", &git_args);
    println!("  git diff --stat 目标值: '{}'", git_target);

    // 6. 测试匹配逻辑
    println!("\n6. 测试匹配逻辑：");
    println!(
        "  模式 'pwd:*' 匹配 'pwd': {}",
        PermissionStore::match_rule("pwd:*", "pwd")
    );
    println!(
        "  模式 'ls -la:*' 匹配 'ls -la': {}",
        PermissionStore::match_rule("ls -la:*", "ls -la")
    );
    println!(
        "  模式 'git diff:*' 匹配 'git diff --stat': {}",
        PermissionStore::match_rule("git diff:*", "git diff --stat")
    );

    println!("\n=== 测试完成 ===");
}
