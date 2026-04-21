#!/bin/bash

# AI Chat HTTP API 测试脚本
#
# 功能：
# - 测试 /api/ai/chat/stream SSE 端点
# - 验证流式响应
# - 测试错误处理
#
# 使用方法：
#   1. 启动 Tauri 应用：ENABLE_HTTP_API=true npm run tauri dev
#   2. 运行测试：./scripts/test-ai-chat-api.sh

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 配置
API_BASE_URL="${API_BASE_URL:-http://localhost:3333}"

echo "========================================="
echo "🧪 AI Chat HTTP API 测试"
echo "========================================="
echo "API URL: $API_BASE_URL"
echo ""

# 测试 1: 健康检查
echo -e "${YELLOW}测试 1: 健康检查${NC}"
curl -s -X POST "$API_BASE_URL/api/health" | jq '.'
echo ""

# 测试 2: AI chat 流式端点（带真实 API）
echo -e "${YELLOW}测试 2: AI chat 流式端点${NC}"
echo "请确保已配置有效的 API Key..."

# 检查是否有 API Key
if [ -z "$AI_API_KEY" ]; then
    echo -e "${RED}错误: 未设置 AI_API_KEY 环境变量${NC}"
    echo "使用方法: AI_API_KEY=sk-xxx ./scripts/test-ai-chat-api.sh"
    exit 1
fi

# 测试 DeepSeek API
echo -e "${YELLOW}测试 DeepSeek API...${NC}"
curl -N -X POST "$API_BASE_URL/api/ai/chat/stream" \
  -H "Content-Type: application/json" \
  -d "{
    \"messages\": [
      {\"role\": \"user\", \"content\": \"你好，请用一句话介绍你自己\"}
    ],
    \"provider_config\": {
      \"name\": \"deepseek\",
      \"api_key\": \"$AI_API_KEY\",
      \"base_url\": \"https://api.deepseek.com\"
    },
    \"model\": \"deepseek-chat\",
    \"enable_tools\": false
  }" | while read -r line; do
    # 解析 SSE 事件
    if [[ $line == data:* ]]; then
      data="${line#data:}"
      event_type=$(echo "$data" | jq -r '.event_type // empty')

      case "$event_type" in
        "content_delta")
          content=$(echo "$data" | jq -r '.content_delta // empty')
          if [ -n "$content" ]; then
            echo -n "$content"
          fi
          ;;
        "done")
          echo ""
          echo -e "${GREEN}✅ 流式输出完成${NC}"
          finish_reason=$(echo "$data" | jq -r '.finish_reason // empty')
          echo "完成原因: $finish_reason"
          ;;
        "error")
          echo ""
          echo -e "${RED}❌ 错误事件${NC}"
          error_code=$(echo "$data" | jq -r '.error.code // empty')
          error_msg=$(echo "$data" | jq -r '.error.message // empty')
          echo "错误代码: $error_code"
          echo "错误消息: $error_msg"
          ;;
      esac
    fi
  done

echo ""
echo -e "${GREEN}=========================================${NC}"
echo -e "${GREEN}✅ 测试完成${NC}"
echo -e "${GREEN}=========================================${NC}"
