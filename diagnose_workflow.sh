#!/bin/bash
# 工作流系统全面诊断

echo "🔍 E2E 工作流系统诊断"
echo "=========================================="
echo ""

# 1. 检查配置文件
echo "📋 1. 检查 E2E 配置文件..."
ENV_FILE="tests/e2e/.env.e2e.local"
if [ -f "$ENV_FILE" ]; then
    echo "✅ 配置文件存在: $ENV_FILE"
    
    # 读取关键配置
    API_KEY=$(grep "^E2E_AI_API_KEY=" "$ENV_FILE" | cut -d'=' -f2)
    BASE_URL=$(grep "^E2E_AI_BASE_URL=" "$ENV_FILE" | cut -d'=' -f2)
    MODEL=$(grep "^E2E_AI_MODEL=" "$ENV_FILE" | cut -d'=' -f2)
    
    echo "   - API Key: ${API_KEY:0:20}..."
    echo "   - Base URL: $BASE_URL"
    echo "   - Model: $MODEL"
else
    echo "❌ 配置文件不存在: $ENV_FILE"
fi
echo ""

# 2. 测试 API 连接
echo "🌐 2. 测试 AI API 连接..."
if [ -n "$API_KEY" ]; then
    echo "📤 发送测试请求到: $BASE_URL"
    
    RESPONSE=$(curl -s -w "\n%{http_code}" \
        --max-time 10 \
        -X POST "$BASE_URL/chat/completions" \
        -H "Content-Type: application/json" \
        -H "Authorization: Bearer $API_KEY" \
        -d '{
            "model": "'$MODEL'",
            "messages": [
                {"role": "user", "content": "test"}
            ]
        }' 2>&1)
    
    HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
    BODY=$(echo "$RESPONSE" | sed '$d')
    
    echo "📊 HTTP Status: $HTTP_CODE"
    
    if [ "$HTTP_CODE" = "200" ]; then
        echo "✅ API 连接成功"
    elif [ "$HTTP_CODE" = "429" ]; then
        echo "⚠️  API 返回 429 - 可能原因："
        echo "   - 套餐过期"
        echo "   - 配额用尽"
        echo "   - 请求过于频繁"
        ERROR_MSG=$(echo "$BODY" | grep -o '"message":"[^"]*"' | cut -d'"' -f4)
        if [ -n "$ERROR_MSG" ]; then
            echo "   - 错误信息: $ERROR_MSG"
        fi
    else
        echo "❌ API 返回错误状态码: $HTTP_CODE"
        echo "📄 响应: $BODY"
    fi
else
    echo "⚠️  跳过 API 测试（未找到 API Key）"
fi
echo ""

# 3. 检查工作流代码
echo "📁 3. 检查工作流系统代码..."
WORKFLOW_FILES=(
    "src-tauri/src/agent_system/workflow/executor.rs"
    "src-tauri/src/agent_system/workflow/runner.rs"
    "src-tauri/src/commands/workflow_commands.rs"
    "src/stores/chat/sendMessage/WorkflowIntentHandler.ts"
)

for file in "${WORKFLOW_FILES[@]}"; do
    if [ -f "$file" ]; then
        echo "✅ $file"
    else
        echo "❌ $file 不存在"
    fi
done
echo ""

# 4. 检查编译状态
echo "🔨 4. 检查 Rust 编译状态..."
cd src-tauri
COMPILE_OUTPUT=$(cargo check --lib 2>&1)
if echo "$COMPILE_OUTPUT" | grep -q "Finished"; then
    echo "✅ Rust 编译成功"
else
    echo "⚠️  Rust 编译有问题"
fi
cd ..
echo ""

# 5. 总结
echo "=========================================="
echo "📊 诊断总结"
echo ""
echo "🔧 下一步操作建议："

if [ "$HTTP_CODE" = "429" ]; then
    echo "1. ⚠️  API 套餐问题（429 错误）"
    echo "   - 访问: https://bigmodel.cn/claude-code"
    echo "   - 续订或更换 API 套餐"
    echo "   - 或使用其他 AI 提供商"
elif [ "$HTTP_CODE" = "200" ]; then
    echo "1. ✅ API 连接正常"
    echo "   - 可以运行工作流测试"
    echo "   - 启动应用: npm run tauri:dev"
else
    echo "1. ⚠️  请检查 API 配置"
    echo "   - 验证 API Key 是否正确"
    echo "   - 确认 Base URL 和 Model 配置"
fi

echo ""
echo "=========================================="
