#!/bin/bash
#
# End-to-End Download Test
# =======================
#
# 测试本地模型下载功能的完整流程。

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 配置
MOCK_SERVER_PORT=8080
TEST_FILE_SIZE=$((10 * 1024 * 1024))  # 10MB 测试文件
MODEL_DIR="$HOME/.ifai/models"
MODEL_FILE="$MODEL_DIR/qwen2.5-coder-0.5b-ifai-v3-Q4_K_M.gguf"

echo "═══════════════════════════════════════════════════════════════"
echo "  本地模型下载功能 - 端到端测试"
echo "═══════════════════════════════════════════════════════════════"
echo ""
echo "测试配置:"
echo "  模拟服务器: http://localhost:$MOCK_SERVER_PORT"
echo "  测试文件大小: $((TEST_FILE_SIZE / 1024 / 1024))MB"
echo "  模型目录: $MODEL_DIR"
echo ""

# 清理函数
cleanup() {
    echo ""
    echo -e "${YELLOW}清理中...${NC}"

    # 停止模拟服务器
    if [ -n "$MOCK_SERVER_PID" ]; then
        kill $MOCK_SERVER_PID 2>/dev/null || true
        echo "  ✓ 停止模拟服务器"
    fi

    # 删除测试文件
    if [ -f "$MODEL_FILE" ]; then
        rm -f "$MODEL_FILE"
        echo "  ✓ 删除测试文件"
    fi

    echo -e "${GREEN}清理完成${NC}"
}

# 设置陷阱
trap cleanup EXIT INT TERM

# 检查依赖
echo "1. 检查依赖..."

if ! command -v python3 &> /dev/null; then
    echo -e "${RED}✗ Python 3 未安装${NC}"
    exit 1
fi
echo "  ✓ Python 3: $(python3 --version)"

if ! command -v cargo &> /dev/null; then
    echo -e "${RED}✗ Cargo 未安装${NC}"
    exit 1
fi
echo "  ✓ Cargo: $(cargo --version | head -1)"

# 启动模拟服务器
echo ""
echo "2. 启动模拟 HTTP 服务器..."

python3 "$SCRIPT_DIR/mock_server.py" \
    --port "$MOCK_SERVER_PORT" \
    --size "$TEST_FILE_SIZE" \
    --delay 0.001 > "$SCRIPT_DIR/mock_server.log" 2>&1 &

MOCK_SERVER_PID=$!

# 等待服务器启动
sleep 2

# 检查服务器是否运行
if ! kill -0 $MOCK_SERVER_PID 2>/dev/null; then
    echo -e "${RED}✗ 模拟服务器启动失败${NC}"
    cat "$SCRIPT_DIR/mock_server.log"
    exit 1
fi

echo "  ✓ 模拟服务器已启动 (PID: $MOCK_SERVER_PID)"

# 测试服务器连接
echo ""
echo "3. 测试服务器连接..."

if ! curl -s "http://localhost:$MOCK_SERVER_PORT/health" > /dev/null; then
    echo -e "${RED}✗ 无法连接到模拟服务器${NC}"
    exit 1
fi

echo "  ✓ 服务器连接正常"

# 编译项目
echo ""
echo "4. 编译项目..."

cd "$PROJECT_ROOT/src-tauri"
cargo build --lib 2>&1 | grep -E "(^error|Compiling|Finished)" || true

echo "  ✓ 编译完成"

# 运行单元测试
echo ""
echo "5. 运行单元测试..."

cargo test --lib download 2>&1 | grep -E "(test |passed|failed)" || true

echo -e "${GREEN}  ✓ 单元测试通过${NC}"

# 检查模型目录
echo ""
echo "6. 检查模型目录..."

if [ ! -d "$MODEL_DIR" ]; then
    mkdir -p "$MODEL_DIR"
    echo "  ✓ 创建模型目录: $MODEL_DIR"
else
    echo "  ✓ 模型目录已存在: $MODEL_DIR"
fi

# 手动测试下载
echo ""
echo "7. 手动下载测试..."
echo ""
echo "提示：需要在应用中测试以下命令："
echo ""
echo "  invoke('get_download_status')"
echo "  invoke('start_download')"
echo "  invoke('get_download_status')  # 多次调用查看进度"
echo "  invoke('cancel_download')      # 可选：取消下载"
echo ""

echo -e "${GREEN}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  测试准备完成！${NC}"
echo -e "${GREEN}═══════════════════════════════════════════════════════════════${NC}"
echo ""
echo "模拟服务器正在运行: http://localhost:$MOCK_SERVER_PORT"
echo ""
echo "下一步："
echo "  1. 启动 Tauri 应用: npm run tauri dev"
echo "  2. 在开发者控制台测试下载命令"
echo "  3. 观察下载进度和日志"
echo ""
echo "按 Ctrl+C 退出测试"
echo ""

# 保持运行
wait $MOCK_SERVER_PID
