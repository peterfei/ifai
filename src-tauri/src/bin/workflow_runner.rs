//! 多智能体工作流命令行运行器
//!
//! 使用方法：
//! ```bash
//! cargo run --bin workflow_runner -- workflows/default-code-review.yml
//! ```

use ifai::agent_system::workflow::*;
use std::env;
use std::process;
use tokio::runtime::Runtime;

/// 打印使用说明
fn print_usage() {
    println!("多智能体工作流运行器\n");
    println!("使用方法:");
    println!("  cargo run --bin workflow_runner -- <workflow.yml>\n");
    println!("示例:");
    println!("  cargo run --bin workflow_runner -- workflows/default-code-review.yml");
    println!("  cargo run --bin workflow_runner -- workflows/simple-exploration.yml");
    println!("  cargo run --bin workflow_runner -- workflows/quality-check.yml\n");
    println!("可用的工作流:");
    println!("  • workflows/default-code-review.yml  - 完整代码审查流程");
    println!("  • workflows/simple-exploration.yml   - 简单代码探索");
    println!("  • workflows/quality-check.yml        - 代码质量检查\n");
}

/// 打印工作流信息
fn print_workflow_info(workflow: &Workflow) {
    println!("\n═══════════════════════════════════════════════════");
    println!("  工作流信息");
    println!("═══════════════════════════════════════════════════");
    println!("  ID: {}", workflow.id);
    println!("  名称: {}", workflow.name);
    println!("  描述: {}", workflow.description);
    println!("  节点数: {}", workflow.nodes.len());
    println!("  边数: {}", workflow.edges.len());

    if !workflow.variables.is_empty() {
        println!("  变量:");
        for (key, value) in &workflow.variables {
            println!("    {} = {}", key, value);
        }
    }

    println!("  节点列表:");
    for node in &workflow.nodes {
        println!("    • {} ({})", node.id, node.agent_type.as_str());
        if let Some(label) = &node.label {
            println!("      标签: {}", label);
        }
    }
    println!("═══════════════════════════════════════════════════\n");
}

/// 打印执行计划
fn print_execution_plan(schedule: &Schedule) {
    println!("═══════════════════════════════════════════════════");
    println!("  执行计划");
    println!("═══════════════════════════════════════════════════");
    println!("  执行顺序:");
    for (i, node_id) in schedule.execution_order.iter().enumerate() {
        println!("    {}. {}", i + 1, node_id);
    }

    if schedule.parallel_groups.len() > 1 {
        println!("\n  并行组:");
        for (i, group) in schedule.parallel_groups.iter().enumerate() {
            println!("    组 {}: {:?}", i, group);
        }
    }
    println!("═══════════════════════════════════════════════════\n");
}

/// 打印执行结果
fn print_result(result: &WorkflowResult) {
    println!("═══════════════════════════════════════════════════");
    println!("  执行结果");
    println!("═══════════════════════════════════════════════════");
    println!("  状态: {:?}", result.status);

    if let Some(started) = result.started_at {
        println!("  开始时间: {}", chrono::DateTime::<chrono::Utc>::from_timestamp(started, 0).unwrap().format("%Y-%m-%d %H:%M:%S"));
    }

    if let Some(completed) = result.completed_at {
        println!("  结束时间: {}", chrono::DateTime::<chrono::Utc>::from_timestamp(completed, 0).unwrap().format("%Y-%m-%d %H:%M:%S"));

        if let Some(started) = result.started_at {
            let duration = completed - started;
            println!("  执行时长: {} 秒", duration / 1000);
        }
    }

    println!("\n  节点结果:");
    for (node_id, node_result) in &result.node_results {
        let status_icon = match node_result.status {
            NodeStatus::Completed => "✅",
            NodeStatus::Failed => "❌",
            NodeStatus::Running => "🔄",
            NodeStatus::Pending => "⏳",
            NodeStatus::Skipped => "⏭️",
        };

        println!("    {} {} - {:?}", status_icon, node_id, node_result.status);

        if let Some(output) = &node_result.output {
            // 只显示前 100 个字符
            let preview = if output.len() > 100 {
                format!("{}...", &output[..100])
            } else {
                output.clone()
            };
            println!("      输出: {}", preview);
        }

        if let Some(error) = &node_result.error {
            println!("      错误: {}", error);
        }

        if node_result.started_at.is_some() || node_result.completed_at.is_some() {
            let start = node_result.started_at.unwrap_or(0);
            let end = node_result.completed_at.unwrap_or(0);
            if end > start {
                println!("      耗时: {} 秒", (end - start) / 1000);
            }
        }
    }

    if result.is_all_success() {
        println!("\n  ✅ 所有节点执行成功！");
    } else {
        println!("\n  ⚠️  部分节点执行失败或被跳过");
    }

    println!("═══════════════════════════════════════════════════\n");
}

fn main() {
    // 解析命令行参数
    let args: Vec<String> = env::args().collect();

    if args.len() < 2 {
        print_usage();
        process::exit(1);
    }

    let yaml_path = &args[1];

    // 读取 YAML 文件
    println!("📂 读取工作流文件: {}", yaml_path);
    let yaml_content = match std::fs::read_to_string(yaml_path) {
        Ok(content) => content,
        Err(e) => {
            eprintln!("❌ 无法读取文件: {}", e);
            process::exit(1);
        }
    };

    // 创建运行时
    let rt = match Runtime::new() {
        Ok(rt) => rt,
        Err(e) => {
            eprintln!("❌ 无法创建运行时: {}", e);
            process::exit(1);
        }
    };

    // 在异步运行时中执行
    rt.block_on(async {
        // 解析工作流
        println!("📝 解析工作流...");
        let workflow = match WorkflowParser::from_str(&yaml_content) {
            Ok(wf) => wf,
            Err(e) => {
                eprintln!("❌ YAML 解析失败: {}", e);
                process::exit(1);
            }
        };
        println!("✅ 工作流解析成功\n");

        // 打印工作流信息
        print_workflow_info(&workflow);

        // 验证工作流
        println!("🔍 验证工作流...");
        if let Err(e) = workflow.validate() {
            eprintln!("❌ 工作流验证失败: {:?}", e);
            process::exit(1);
        }
        println!("✅ 工作流验证通过\n");

        // 调度工作流
        println!("📋 调度工作流...");
        let schedule = match WorkflowScheduler::schedule(&workflow) {
            Ok(schedule) => schedule,
            Err(e) => {
                eprintln!("❌ 调度失败: {:?}", e);
                process::exit(1);
            }
        };
        println!("✅ 调度成功\n");
        print_execution_plan(&schedule);

        // 执行工作流
        println!("🚀 开始执行工作流...\n");
        let runner = match WorkflowRunner::with_default_config(workflow) {
            Ok(runner) => runner,
            Err(e) => {
                eprintln!("❌ 无法创建运行器: {}", e);
                process::exit(1);
            }
        };

        let result = match runner.run().await {
            Ok(result) => result,
            Err(e) => {
                eprintln!("❌ 执行失败: {}", e);
                process::exit(1);
            }
        };

        // 打印结果
        print_result(&result);

        // 根据执行结果设置退出码
        if result.is_all_success() {
            println!("✅ 工作流执行完成！");
            process::exit(0);
        } else {
            println!("⚠️  工作流执行完成，但部分节点失败");
            process::exit(1);
        }
    });
}
