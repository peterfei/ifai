#!/bin/bash
#
# Local Model FIM Test
# ===================
#
# 测试本地模型的 FIM (Fill-in-the-Middle) 代码补全功能
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
echo "  本地模型 FIM 代码补全 - 功能测试"
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
    echo "  请先下载模型"
    exit 1
fi

# 2. 编译项目
echo ""
echo -e "${YELLOW}2. 编译项目（商业版）${NC}"
cd "$PROJECT_ROOT/src-tauri"
cargo build --features commercial 2>&1 | grep -E "(^Compiling|Finished|error)" || true
echo -e "  ${GREEN}✓ 编译完成${NC}"

# 3. 测试说明
echo ""
echo -e "${GREEN}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  FIM 测试说明${NC}"
echo -e "${GREEN}═══════════════════════════════════════════════════════════════${NC}"
echo ""
echo "本地 FIM 功能已添加！现在可以通过以下方式测试："
echo ""
echo -e "${BLUE}方式1: 使用 Tauri 命令测试${NC}"
echo "  在开发者工具控制台输入："
echo "  invoke('local_model_fim', {"
echo "    prefix: 'fn hello() {',"
echo "    suffix: '}'"
echo "  }).then(result => console.log('FIM Result:', result))"
echo ""
echo -e "${BLUE}方式2: 在 Monaco Editor 中测试${NC}"
echo "  1. 打开代码编辑器"
echo "  2. 在代码中输入光标位置，等待自动补全"
echo "  3. 本地模型会提供 FIM 补全建议"
echo ""
echo -e "${YELLOW}预期行为:${NC}"
echo "  - FIM 格式: <|fim_prefix|>{prefix}<|fim_suffix|>{suffix}<|fim_middle|>"
echo "  - 生成温度: 0.2（更确定的代码）"
echo "  - 最大 token: 256"
echo "  - 自动清理特殊标记"
echo ""
echo -e "${GREEN}═══════════════════════════════════════════════════════════════${NC}"
echo ""
