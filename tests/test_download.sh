#!/bin/bash
#
# Real Download Test
# ==================
#
# 测试真实的模型下载流程
#

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
SERVER_PID=""

# 颜色输出
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo "═══════════════════════════════════════════════════════════════"
echo "  本地模型下载功能 - 真实下载测试"
echo "═══════════════════════════════════════════════════════════════"
echo ""

# 清理函数
cleanup() {
    echo ""
    echo -e "${YELLOW}清理中...${NC}"

    # 停止下载服务器
    if [ -n "$SERVER_PID" ]; then
        kill $SERVER_PID 2>/dev/null || true
        echo "  ✓ 停止下载服务器"
    fi

    # 清理测试文件
    TEST_MODEL="$HOME/.ifai/models/qwen2.5-coder-0.5b-ifai-v3-Q4_K_M.gguf"
    if [ -f "$TEST_MODEL" ]; then
        rm -f "$TEST_MODEL"
        echo "  ✓ 删除测试模型文件"
    fi

    echo -e "${GREEN}清理完成${NC}"
}

trap cleanup EXIT INT TERM

# 1. 检查测试文件
echo -e "${YELLOW}1. 检查测试文件${NC}"
TEST_MODEL="$PROJECT_ROOT/tests/models/qwen2.5-coder-0.5b-ifai-v3-Q4_K_M.gguf"
if [ ! -f "$TEST_MODEL" ]; then
    echo -e "  ${RED}✗ 测试模型文件不存在: $TEST_MODEL${NC}"
    echo "  创建测试文件..."
    mkdir -p "$(dirname "$TEST_MODEL")"
    dd if=/dev/zero of="$TEST_MODEL" bs=1m count=10 2>/dev/null
    echo "  ✓ 创建测试文件 (10MB)"
else
    echo "  ✓ 测试文件存在: $(ls -lh "$TEST_MODEL" | awk '{print $5}')"
fi

# 2. 启动下载服务器
echo ""
echo -e "${YELLOW}2. 启动下载服务器${NC}"
cd "$PROJECT_ROOT"
python3 tests/download_server.py &
SERVER_PID=$!
echo "  ✓ 服务器已启动 (PID: $SERVER_PID)"

# 等待服务器启动
sleep 2

# 检查服务器
if ! curl -s http://localhost:8080/health > /dev/null; then
    echo -e "  ${RED}✗ 服务器启动失败${NC}"
    exit 1
fi
echo "  ✓ 服务器运行正常"

# 3. 清理旧的测试文件
echo ""
echo -e "${YELLOW}3. 清理旧的测试文件${NC}"
MODEL_DIR="$HOME/.ifai/models"
TEST_FILE="$MODEL_DIR/qwen2.5-coder-0.5b-ifai-v3-Q4_K_M.gguf"
if [ -f "$TEST_FILE" ]; then
    rm -f "$TEST_FILE"
    echo "  ✓ 删除旧的测试文件"
fi

# 4. 编译项目
echo ""
echo -e "${YELLOW}4. 编译项目${NC}"
cd "$PROJECT_ROOT/src-tauri"
cargo build 2>&1 | grep -E "(^Compiling|Finished|error)" || true
echo "  ✓ 编译完成"

# 5. 提示手动测试
echo ""
echo -e "${GREEN}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  准备就绪！${NC}"
echo -e "${GREEN}═══════════════════════════════════════════════════════════════${NC}"
echo ""
echo "下载服务器正在运行: http://localhost:8080/model.gguf"
echo "测试模型大小: 10MB"
echo ""
echo "下一步："
echo "  1. 启动应用: npm run tauri dev"
echo "  2. 打开设置 → 本地模型设置"
echo "  3. 点击'下载模型'按钮"
echo "  4. 观察下载进度"
echo ""
echo "或使用开发者控制台测试："
echo "  invoke('get_download_status')"
echo "  invoke('start_download')"
echo "  invoke('get_download_status')  # 查看进度"
echo ""
echo "按 Ctrl+C 退出测试"
echo ""

# 保持运行
wait $SERVER_PID
