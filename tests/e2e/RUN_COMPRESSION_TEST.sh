#!/bin/bash

# ===================================================================
# 自动压缩E2E测试快速启动脚本
# ===================================================================
#
# 用途：快速配置并运行30条消息自动压缩的E2E测试
#
# 使用方法：
#   1. chmod +x tests/e2e/RUN_COMPRESSION_TEST.sh
#   2. ./tests/e2e/RUN_COMPRESSION_TEST.sh
#
# ===================================================================

set -e

echo "========================================"
echo "🚀 自动压缩E2E测试快速启动"
echo "========================================"
echo ""

# 颜色定义
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# 检查配置文件
CONFIG_FILE="tests/e2e/.env.e2e.local"

if [ ! -f "$CONFIG_FILE" ]; then
    echo -e "${YELLOW}⚠️  配置文件不存在: $CONFIG_FILE${NC}"
    echo ""
    echo "📝 正在创建配置文件..."

    if [ ! -f "tests/e2e/.env.e2e.example" ]; then
        echo -e "${RED}❌ 错误: 找不到配置模板 tests/e2e/.env.e2e.example${NC}"
        exit 1
    fi

    cp tests/e2e/.env.e2e.example "$CONFIG_FILE"

    echo "✅ 配置文件已创建: $CONFIG_FILE"
    echo ""
    echo -e "${YELLOW}📋 请编辑配置文件，填入你的AI API配置：${NC}"
    echo ""
    echo "   1. DeepSeek（推荐，性价比高）:"
    echo "      E2E_AI_API_KEY=sk-你的DeepSeek密钥"
    echo "      E2E_AI_BASE_URL=https://api.deepseek.com"
    echo "      E2E_AI_MODEL=deepseek-chat"
    echo ""
    echo "   2. OpenAI:"
    echo "      E2E_AI_API_KEY=sk-proj-你的OpenAI密钥"
    echo "      E2E_AI_BASE_URL=https://api.openai.com/v1"
    echo "      E2E_AI_MODEL=gpt-4o-mini"
    echo ""
    echo "   3. 本地 Ollama（免费）:"
    echo "      E2E_AI_API_KEY=ollama"
    echo "      E2E_AI_BASE_URL=http://localhost:11434/v1"
    echo "      E2E_AI_MODEL=qwen2.5"
    echo ""
    echo "配置后重新运行此脚本"
    echo ""

    # 检查是否有编辑器命令
    if command -v code &> /dev/null; then
        read -p "是否用VSCode打开配置文件? (y/N): " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            code "$CONFIG_FILE"
            echo "✅ 已在VSCode中打开配置文件"
            echo "请保存后重新运行此脚本"
            exit 0
        fi
    fi

    exit 1
fi

# 加载配置
echo "📂 加载配置文件: $CONFIG_FILE"
source "$CONFIG_FILE"

# 验证配置
if [ -z "$E2E_AI_API_KEY" ] || [ "$E2E_AI_API_KEY" = "your-api-key-here" ]; then
    echo -e "${RED}❌ 错误: 请在 $CONFIG_FILE 中配置 E2E_AI_API_KEY${NC}"
    exit 1
fi

echo "✅ API Key: ${E2E_AI_API_KEY:0:8}..."
echo "✅ Base URL: $E2E_AI_BASE_URL"
echo "✅ Model: $E2E_AI_MODEL"
echo ""

# 检查Node.js
if ! command -v node &> /dev/null; then
    echo -e "${RED}❌ 错误: 未找到 Node.js${NC}"
    exit 1
fi

echo "========================================"
echo "🧪 开始运行E2E测试..."
echo "========================================"
echo ""

# 运行测试
npm run test:e2e -- tests/e2e/section5/auto-compression-real.spec.ts "$@"

# 检查测试结果
if [ $? -eq 0 ]; then
    echo ""
    echo "========================================"
    echo -e "${GREEN}✅ 测试完成！${NC}"
    echo "========================================"
else
    echo ""
    echo "========================================"
    echo -e "${RED}❌ 测试失败${NC}"
    echo "========================================"
    echo ""
    echo "调试建议："
    echo "1. 查看控制台日志（搜索 [E2E] 标记）"
    echo "2. 检查 API Key 是否正确"
    echo "3. 检查网络连接"
    echo "4. 增加超时时间（编辑测试文件中的 test.setTimeout）"
    echo ""
    exit 1
fi
