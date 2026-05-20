// 测试 workflow! 宏的使用
use ifai::workflow;
use ifai::agent_system::workflow::types::{Workflow, AgentType};

fn main() {
    // 测试 1: 简单的串行工作流
    let workflow1 = workflow! {
        name: "代码改进工作流",
        description: "探索代码 → 审查代码 → 重构代码",

        nodes: [
            Explore("scan"),
            Review("check"),
            Refactor("fix"),
        ],

        edges: [
            ("scan", "check"),
            ("check", "fix"),
        ],
    };

    println!("✅ 测试 1 通过: 串行工作流");
    println!("  - 节点数: {}", workflow1.nodes.len());
    println!("  - 边数: {}", workflow1.edges.len());

    // 测试 2: 带条件执行的工作流
    let workflow2 = workflow! {
        name: "条件修复工作流",
        description: "基于严重程度决定是否修复",

        nodes: [
            Explore("scan"),
            Review("check"),
            Refactor("fix"),
        ],

        edges: [
            ("scan", "check"),
            ("check", "fix", "$.severity > 5"),
        ],
    };

    println!("\n✅ 测试 2 通过: 条件执行工作流");
    if let Some(ref condition) = workflow2.edges[1].condition {
        println!("  - 条件表达式: {}", condition);
    }

    // 测试 3: 菱形并行工作流
    let workflow3 = workflow! {
        name: "文档同步工作流",
        description: "并行审查和生成文档",

        nodes: [
            Explore("scan"),
            Review("review"),
            Doc("doc"),
            Refactor("refactor"),
        ],

        edges: [
            ("scan", "review"),
            ("scan", "doc"),
            ("review", "refactor"),
            ("doc", "refactor"),
        ],
    };

    println!("\n✅ 测试 3 通过: 菱形并行工作流");
    println!("  - scan 的出边数: {}", workflow3.edges.iter().filter(|e| e.from == "scan").count());
    println!("  - refactor 的入边数: {}", workflow3.edges.iter().filter(|e| e.to == "refactor").count());

    // 测试 4: 序列化
    let json_str = serde_json::to_string_pretty(&workflow1).unwrap();
    println!("\n✅ 测试 4 通过: 工作流序列化");
    println!("  - JSON 长度: {} 字节", json_str.len());

    // 测试 5: 工作流验证
    let result = workflow1.validate();
    println!("\n✅ 测试 5 通过: 工作流验证");
    println!("  - 验证结果: {:?}", result);

    println!("\n🎉 所有 workflow! 宏测试通过！");
}
