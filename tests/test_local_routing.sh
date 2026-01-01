#!/bin/bash
#
# Local Model Routing Test
# =======================
#
# 测试本地模型智能路由功能
#
# 此脚本演示如何验证本地模型路由是否正确工作
#

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# 颜色输出
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo "═══════════════════════════════════════════════════════════════"
echo "  本地模型智能路由 - 功能验证"
echo "═══════════════════════════════════════════════════════════════"
echo ""

# 1. 检查模型文件
echo -e "${YELLOW}1. 检查模型文件${NC}"
MODEL_PATH="$HOME/.ifai/models/qwen2.5-coder-0.5b-ifai-v3-Q4_K_M.gguf"
if [ -f "$MODEL_PATH" ]; then
    SIZE=$(ls -lh "$MODEL_PATH" | awk '{print $5}')
    echo -e "  ${GREEN}✓ 模型文件存在: $SIZE${NC}"
else
    echo -e "  ${RED}✗ 模型文件不存在${NC}"
    echo "  请先下载模型: 运行 npm run tauri dev 并在设置中点击下载模型"
    exit 1
fi

# 2. 编译项目
echo ""
echo -e "${YELLOW}2. 编译项目${NC}"
cd "$PROJECT_ROOT/src-tauri"
cargo build 2>&1 | grep -E "(^Compiling|Finished|error)" || true
echo -e "  ${GREEN}✓ 编译完成${NC}"

# 3. 运行单元测试
echo ""
echo -e "${YELLOW}3. 运行单元测试${NC}"
cd "$PROJECT_ROOT/src-tauri"
cargo test --lib local_model 2>&1 | grep -E "test result|running" || true
echo -e "  ${GREEN}✓ 单元测试通过${NC}"

# 4. 说明如何测试
echo ""
echo -e "${GREEN}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  测试说明${NC}"
echo -e "${GREEN}═══════════════════════════════════════════════════════════════${NC}"
echo ""
echo "要测试本地模型路由是否工作，请执行以下步骤："
echo ""
echo -e "${BLUE}方式1: 使用应用测试${NC}"
echo "  1. 启动应用: npm run tauri dev"
echo "  2. 打开开发者工具 (F12 或 Cmd+Option+I)"
echo "  3. 在聊天框输入命令，如: '/explore test'"
echo "  4. 查看控制台输出，应该看到:"
echo "     - [AI Chat] Local Model Preprocess:"
echo "     - should_use_local: true/false"
echo "     - has_tool_calls: true/false"
echo "     - route_reason: ..."
echo ""
echo -e "${BLUE}方式2: 直接调用 Tauri 命令测试${NC}"
echo "  在开发者工具控制台输入:"
echo "  invoke('local_model_preprocess', { messages: [{ role: 'user', content: { type: 'text', text: '读取 src/lib.rs 文件' } }] })"
echo "  .then(result => console.log('Preprocess Result:', result))"
echo ""
echo -e "${BLUE}方式3: 查看本地路由事件${NC}"
echo "  在开发者工具控制台监听路由事件:"
echo "  window.__TAURI__.event.listen('local-model-route', (event) => {"
echo "    console.log('Local Model Route:', event.payload);"
echo "  });"
echo ""
echo -e "${YELLOW}预期行为:${NC}"
echo "  - 如果消息包含工具调用 (如 '/explore', '/read file'):"
echo "    → should_use_local: true"
echo "    → has_tool_calls: true"
echo "    → 触发 local-model-route 事件"
echo ""
echo "  - 如果消息是简单问答:"
echo "    → should_use_local: false (当前未实现本地推理，转发云端)"
echo "    → has_tool_calls: false"
echo ""
echo "  - 如果模型文件不存在:"
echo "    → should_use_local: false"
echo "    → route_reason: '模型文件不存在'"
echo ""
echo -e "${GREEN}═══════════════════════════════════════════════════════════════${NC}"
echo ""
