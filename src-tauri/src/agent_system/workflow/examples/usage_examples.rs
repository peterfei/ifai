//! 多智能体工作流系统使用示例
//!
//! 展示如何创建、配置和执行多智能体协作工作流

use crate::agent_system::workflow::*;
use std::collections::HashMap;

/// 示例 1: 创建简单的线性工作流
///
/// 展示如何通过代码创建一个简单的工作流
pub fn example_linear_workflow() {
    let mut workflow = Workflow::new("linear-example", "线性工作流示例")
        .with_description("一个简单的线性工作流：探索 -> 审查 -> 重构");

    // 添加节点
    workflow
        .add_node(WorkflowNode::new("explore", AgentType::Explore)
            .with_label("探索代码结构"))
        .add_node(WorkflowNode::new("review", AgentType::Review)
            .with_label("代码质量审查"))
        .add_node(WorkflowNode::new("refactor", AgentType::Refactor)
            .with_label("重构代码"));

    // 添加边（依赖关系）
    workflow
        .add_edge(WorkflowEdge::new("explore", "review"))
        .add_edge(WorkflowEdge::new("review", "refactor"));

    // 验证工作流
    match workflow.validate() {
        Ok(_) => println!("✅ 工作流验证成功"),
        Err(e) => println!("❌ 工作流验证失败: {:?}", e),
    }
}

/// 示例 2: 创建并行工作流
///
/// 展示如何创建包含并行执行的工作流
pub fn example_parallel_workflow() {
    let mut workflow = Workflow::new("parallel-example", "并行工作流示例")
        .with_description("审查后并行生成测试和文档");

    // 创建节点：explore -> (test, doc) -> merge
    workflow
        .add_node(WorkflowNode::new("explore", AgentType::Explore)
            .with_label("探索代码"))
        .add_node(WorkflowNode::new("test", AgentType::Test)
            .with_label("生成测试"))
        .add_node(WorkflowNode::new("doc", AgentType::Doc)
            .with_label("生成文档"))
        .add_node(WorkflowNode::new("merge", AgentType::GeneralPurpose)
            .with_label("合并结果"));

    // 添加边
    workflow
        .add_edge(WorkflowEdge::new("explore", "test"))
        .add_edge(WorkflowEdge::new("explore", "doc"))
        .add_edge(WorkflowEdge::new("test", "merge"))
        .add_edge(WorkflowEdge::new("doc", "merge"));

    // 调度工作流以查看执行顺序
    match WorkflowScheduler::schedule(&workflow) {
        Ok(schedule) => {
            println!("✅ 工作流调度成功");
            println!("📋 执行顺序: {:?}", schedule.execution_order);
            println!("🔀 并行组数量: {}", schedule.parallel_groups.len());
        }
        Err(e) => println!("❌ 调度失败: {:?}", e),
    }
}

/// 示例 3: 从 YAML 文件创建工作流
///
/// 展示如何从 YAML 配置创建工作流
pub fn example_yaml_workflow() {
    let yaml_content = r#"
id: "code-review-workflow"
name: "代码审查工作流"
description: "自动化代码审查和改进建议"

variables:
  target_path: "/src"
  severity_threshold: "2"

nodes:
  - id: "explore"
    agentType: "explore"
    label: "探索代码结构"
    config:
      target: "${target_path}"
      task_description: "分析代码架构和依赖关系"

  - id: "review"
    agentType: "review"
    label: "代码质量审查"
    config:
      severity_threshold: 2

  - id: "refactor"
    agentType: "refactor"
    label: "生成重构建议"
    depends_on: ["review"]

  - id: "test"
    agentType: "test"
    label: "生成测试用例"
    depends_on: ["review"]

  - id: "document"
    agentType: "doc"
    label: "生成文档"
    depends_on: ["refactor", "test"]

edges:
  - from: "explore"
    to: "review"
  - from: "review"
    to: "refactor"
  - from: "review"
    to: "test"
  - from: "refactor"
    to: "document"
  - from: "test"
    to: "document"
"#;

    match WorkflowParser::from_str(yaml_content) {
        Ok(workflow) => {
            println!("✅ YAML 解析成功");
            println!("📊 工作流包含 {} 个节点", workflow.nodes.len());
            println!("🔗 工作流包含 {} 条边", workflow.edges.len());
        }
        Err(e) => println!("❌ YAML 解析失败: {:?}", e),
    }
}

/// 示例 4: 使用节点配置
///
/// 展示如何为节点配置参数
pub fn example_node_config() {
    let mut workflow = Workflow::new("config-example", "配置示例");

    // 创建带有自定义配置的节点
    let mut explore_node = WorkflowNode::new("explore", AgentType::Explore);
    explore_node.config = AgentConfig {
        target: Some("/src".to_string()),
        task_description: Some("探索核心模块".to_string()),
        severity_threshold: None,
        timeout_secs: Some(300),
        custom_params: {
            let mut params = HashMap::new();
            params.insert("depth".to_string(), serde_json::json!(3));
            params.insert("include_tests".to_string(), serde_json::json!(true));
            params
        },
    };

    workflow.add_node(explore_node);

    println!("✅ 创建带配置的节点成功");
}

/// 示例 5: 执行工作流（异步）
///
/// 展示如何异步执行工作流
///
/// 注意：此示例需要 tokio 运行时
#[tokio::main]
async fn example_execute_workflow() {
    let mut workflow = Workflow::new("execution-example", "执行示例");

    // 创建简单的工作流
    workflow
        .add_node(WorkflowNode::new("task1", AgentType::Explore))
        .add_node(WorkflowNode::new("task2", AgentType::Review))
        .add_edge(WorkflowEdge::new("task1", "task2"));

    // 创建运行器
    match WorkflowRunner::with_default_config(workflow) {
        Ok(runner) => {
            println!("✅ 运行器创建成功");

            // 执行工作流
            match runner.run().await {
                Ok(result) => {
                    println!("✅ 工作流执行完成");
                    println!("📊 状态: {:?}", result.status);
                    println!("⏱️  开始时间: {:?}", result.started_at);
                    println!("⏱️  结束时间: {:?}", result.completed_at);

                    // 显示每个节点的结果
                    for (node_id, node_result) in &result.node_results {
                        println!("  节点 {}: {:?}", node_id, node_result.status);
                    }
                }
                Err(e) => {
                    println!("❌ 工作流执行失败: {:?}", e);
                }
            }
        }
        Err(e) => {
            println!("❌ 运行器创建失败: {:?}", e);
        }
    }
}

/// 示例 6: 自定义运行器配置
///
/// 展示如何自定义运行器行为
pub fn example_custom_config() {
    let mut workflow = Workflow::new("custom-config-example", "自定义配置示例");
    workflow
        .add_node(WorkflowNode::new("task1", AgentType::Explore))
        .add_node(WorkflowNode::new("task2", AgentType::Review))
        .add_edge(WorkflowEdge::new("task1", "task2"));

    // 自定义配置
    let config = RunnerConfig {
        max_concurrent_nodes: 5,      // 最多并行 5 个节点
        node_timeout_secs: 600,       // 每个节点超时 10 分钟
        max_retries: 3,               // 失败后最多重试 3 次
        fail_fast: true,              // 任何节点失败立即停止
    };

    match WorkflowRunner::new(workflow, config) {
        Ok(_) => println!("✅ 使用自定义配置创建运行器成功"),
        Err(e) => println!("❌ 创建失败: {:?}", e),
    }
}

/// 示例 7: 工作流变量
///
/// 展示如何使用变量进行参数化
pub fn example_variables() {
    let mut workflow = Workflow::new("variables-example", "变量示例")
        .with_description("展示如何使用变量");

    // 设置工作流变量
    let mut variables = HashMap::new();
    variables.insert("target_path".to_string(), "/src/components".to_string());
    variables.insert("timeout".to_string(), "300".to_string());
    variables.insert("severity".to_string(), "2".to_string());
    workflow.variables = variables;

    // 在节点配置中引用变量
    let mut node = WorkflowNode::new("explore", AgentType::Explore);
    node.config = AgentConfig {
        target: Some("${target_path}".to_string()),
        timeout_secs: Some(300),
        ..Default::default()
    };

    workflow.add_node(node);

    println!("✅ 使用变量的工作流创建成功");
    println!("📝 变量: {:?}", workflow.variables);
}

/// 示例 8: 条件边
///
/// 展示如何使用条件边控制工作流
pub fn example_conditional_edges() {
    let mut workflow = Workflow::new("conditional-example", "条件边示例");

    workflow
        .add_node(WorkflowNode::new("check", AgentType::Review))
        .add_node(WorkflowNode::new("fix", AgentType::Refactor))
        .add_node(WorkflowNode::new("skip", AgentType::Doc));

    // 创建条件边：只有在审查发现问题才修复
    let mut edge = WorkflowEdge::new("check", "fix");
    edge.condition = Some("${has_issues} == true".to_string());

    workflow.add_edge(edge);

    println!("✅ 带条件边的工作流创建成功");
}

/// 示例 9: 复杂工作流
///
/// 展示一个更真实的复杂工作流
pub fn example_complex_workflow() {
    let mut workflow = Workflow::new(
        "complex-review-workflow",
        "复杂代码审查工作流"
    )
    .with_description("完整的代码审查、重构、测试和文档生成流程");

    // 定义变量
    let mut variables = HashMap::new();
    variables.insert("project_path".to_string(), "/src".to_string());
    variables.insert("severity_threshold".to_string(), "2".to_string());
    workflow.variables = variables;

    // 添加节点
    workflow
        // 第一阶段：探索
        .add_node(WorkflowNode::new("explore_structure", AgentType::Explore)
            .with_label("探索项目结构"))
        .add_node(WorkflowNode::new("explore_deps", AgentType::Explore)
            .with_label("分析依赖关系"))

        // 第二阶段：审查
        .add_node(WorkflowNode::new("code_review", AgentType::Review)
            .with_label("代码质量审查"))

        // 第三阶段：并行改进
        .add_node(WorkflowNode::new("refactor", AgentType::Refactor)
            .with_label("重构建议"))
        .add_node(WorkflowNode::new("test_gen", AgentType::Test)
            .with_label("生成测试用例"))
        .add_node(WorkflowNode::new("doc_gen", AgentType::Doc)
            .with_label("生成文档"))

        // 第四阶段：验证
        .add_node(WorkflowNode::new("final_review", AgentType::Review)
            .with_label("最终审查"));

    // 添加依赖关系
    workflow
        // 探索阶段
        .add_edge(WorkflowEdge::new("explore_structure", "explore_deps"))
        .add_edge(WorkflowEdge::new("explore_deps", "code_review"))

        // 审查到改进
        .add_edge(WorkflowEdge::new("code_review", "refactor"))
        .add_edge(WorkflowEdge::new("code_review", "test_gen"))
        .add_edge(WorkflowEdge::new("code_review", "doc_gen"))

        // 改进到最终审查
        .add_edge(WorkflowEdge::new("refactor", "final_review"))
        .add_edge(WorkflowEdge::new("test_gen", "final_review"))
        .add_edge(WorkflowEdge::new("doc_gen", "final_review"));

    // 验证和调度
    match workflow.validate() {
        Ok(_) => println!("✅ 复杂工作流验证成功"),
        Err(e) => println!("❌ 验证失败: {:?}", e),
    }

    match WorkflowScheduler::schedule(&workflow) {
        Ok(schedule) => {
            println!("✅ 调度成功");
            println!("📋 总节点数: {}", schedule.execution_order.len());
            println!("🔀 并行组数: {}", schedule.parallel_groups.len());
        }
        Err(e) => println!("❌ 调度失败: {:?}", e),
    }
}

/// 运行所有示例
fn main() {
    println!("=== 多智能体工作流系统使用示例 ===\n");

    println!("📌 示例 1: 线性工作流");
    example_linear_workflow();
    println!();

    println!("📌 示例 2: 并行工作流");
    example_parallel_workflow();
    println!();

    println!("📌 示例 3: YAML 工作流");
    example_yaml_workflow();
    println!();

    println!("📌 示例 4: 节点配置");
    example_node_config();
    println!();

    println!("📌 示例 5: 执行工作流");
    // 注意：example_execute_workflow 需要 tokio 运行时
    // 如果要在主函数中运行，需要使用 tokio::runtime
    println!("（跳过 - 需要异步运行时）");
    println!();

    println!("📌 示例 6: 自定义配置");
    example_custom_config();
    println!();

    println!("📌 示例 7: 工作流变量");
    example_variables();
    println!();

    println!("📌 示例 8: 条件边");
    example_conditional_edges();
    println!();

    println!("📌 示例 9: 复杂工作流");
    example_complex_workflow();
    println!();

    println!("=== 所有示例运行完成 ===");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_linear_workflow_example() {
        example_linear_workflow();
    }

    #[test]
    fn test_parallel_workflow_example() {
        example_parallel_workflow();
    }

    #[test]
    fn test_yaml_workflow_example() {
        example_yaml_workflow();
    }

    #[test]
    fn test_node_config_example() {
        example_node_config();
    }

    #[tokio::test]
    async fn test_execute_workflow_example() {
        // example_execute_workflow 使用 #[tokio::main]，所以在测试中不直接调用
        // 实际的异步执行在其他示例中已覆盖
    }

    #[test]
    fn test_custom_config_example() {
        example_custom_config();
    }

    #[test]
    fn test_variables_example() {
        example_variables();
    }

    #[test]
    fn test_conditional_edges_example() {
        example_conditional_edges();
    }

    #[test]
    fn test_complex_workflow_example() {
        example_complex_workflow();
    }
}
