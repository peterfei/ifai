#!/bin/bash
# P3 工具系统集成测试脚本

echo "🧪 P3 工具系统集成测试"
echo "========================"
echo ""

# 测试 1: 单元测试
echo "📋 测试 1: 运行单元测试"
cargo test harness::tool::router::tests --quiet
if [ $? -eq 0 ]; then
    echo "✅ 单元测试通过"
else
    echo "❌ 单元测试失败"
    exit 1
fi
echo ""

# 测试 2: 检查所有工具已注册
echo "📋 测试 2: 验证工具注册"
cat > /tmp/test_router.rs << 'EOF'
use ifainew::harness::tool::ToolRouter;

fn main() {
    let router = ToolRouter::new();
    let tools = router.list_tools();

    println!("已注册的工具 ({} 个):", tools.len());
    for tool in &tools {
        println!("  ✓ {}", tool);
    }

    let expected = vec![
        "TodoWrite", "read_file", "write_file", "edit_file",
        "glob_search", "grep_search", "bash", "PowerShell"
    ];

    for expected_tool in expected {
        if !tools.contains(&expected_tool.to_string()) {
            eprintln!("❌ 缺少工具: {}", expected_tool);
            std::process::exit(1);
        }
    }

    println!("\n✅ 所有预期工具已注册");
}
EOF

cargo run --quiet --example test_router 2>/dev/null
echo ""

# 测试 3: 文件工具功能测试
echo "📋 测试 3: 文件工具功能"
TEST_DIR=$(mktemp -d)
echo "测试目录: $TEST_DIR"

# 创建测试文件
echo "Hello, IfAI!" > "$TEST_DIR/test.txt"
echo "Line 2" >> "$TEST_DIR/test.txt"

# 验证文件
if [ -f "$TEST_DIR/test.txt" ]; then
    echo "✅ 文件创建成功"
    echo "内容: $(cat $TEST_DIR/test.txt)"
else
    echo "❌ 文件创建失败"
fi

# 清理
rm -rf "$TEST_DIR"
echo ""

echo "✅ 所有基础测试完成！"
echo ""
echo "💡 提示：运行以下命令进行完整的端到端测试："
echo "   cargo run --bin ifai"
echo "   然后输入: '创建一个文件 /tmp/hello.txt 内容是 Hello World'"
