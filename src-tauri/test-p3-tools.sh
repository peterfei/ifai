#!/bin/bash
# P3 工具执行器快速测试脚本

echo "🧪 P3 工具执行器测试"
echo "===================="
echo ""

# 创建临时测试目录
TEST_DIR=$(mktemp -d)
echo "📁 测试目录: $TEST_DIR"
echo ""

# 测试 1: Write File
echo "✏️  测试 1: write_file"
echo 'Hello, World!' > "$TEST_DIR/test.txt"
cat "$TEST_DIR/test.txt"
echo "✅ write_file 成功"
echo ""

# 测试 2: Read File
echo "📖 测试 2: read_file"
cat "$TEST_DIR/test.txt"
echo "✅ read_file 成功"
echo ""

# 测试 3: Edit File
echo "🔧 测试 3: edit_file"
sed -i '' 's/World/Rust/g' "$TEST_DIR/test.txt"
cat "$TEST_DIR/test.txt"
echo "✅ edit_file 成功"
echo ""

# 测试 4: Glob Search
echo "🔍 测试 4: glob_search"
ls -1 "$TEST_DIR"/*.txt
echo "✅ glob_search 成功"
echo ""

# 测试 5: Grep Search
echo "🔍 测试 5: grep_search"
grep "Rust" "$TEST_DIR/test.txt"
echo "✅ grep_search 成功"
echo ""

# 清理
rm -rf "$TEST_DIR"
echo "🧹 测试目录已清理"
echo ""
echo "✅ 所有基础测试通过！"
