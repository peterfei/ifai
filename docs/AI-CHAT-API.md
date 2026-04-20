# AI Chat HTTP API 使用指南

> **版本**: v1.0
> **最后更新**: 2025-01-17

---

## 📋 目录

- [概述](#概述)
- [快速开始](#快速开始)
- [API 端点](#api-端点)
- [请求格式](#请求格式)
- [响应格式](#响应格式)
- [使用示例](#使用示例)
- [错误处理](#错误处理)
- [常见问题](#常见问题)

---

## 概述

AI Chat HTTP API 提供了基于 SSE (Server-Sent Events) 的 AI 聊天流式响应接口，支持多种 AI 提供商（DeepSeek、OpenAI、Anthropic 等）。

### 特性

- ✅ **流式响应** - 实时返回 AI 生成的内容
- ✅ **多提供商支持** - DeepSeek、OpenAI、Anthropic 等
- ✅ **错误处理** - 完善的错误事件机制
- ✅ **工具调用** - 支持 AI 工具调用（待实现）
- ✅ **SSE 协议** - 使用标准 Server-Sent Events

### 架构

```
客户端
  ↓ HTTP POST /api/ai/chat/stream
HTTP API Server (Axum)
  ↓ stream_chat()
HarnessAIService
  ↓ HTTP 请求
AI Provider API (DeepSeek/OpenAI/etc)
  ↓ SSE 流
HTTP API Server
  ↓ SSE
客户端
```

---

## 快速开始

### 1. 启动 Tauri 应用

```bash
# 启用 HTTP API
ENABLE_HTTP_API=true npm run tauri dev
```

### 2. 测试端点

```bash
# 使用测试脚本
AI_API_KEY=sk-xxx ./scripts/test-ai-chat-api.sh

# 或使用 curl
curl -N -X POST http://localhost:3333/api/ai/chat/stream \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [{"role": "user", "content": "你好"}],
    "provider_config": {
      "name": "deepseek",
      "api_key": "sk-xxx",
      "base_url": "https://api.deepseek.com"
    },
    "model": "deepseek-chat"
  }'
```

---

## API 端点

### POST /api/ai/chat/stream

提供 AI 聊天的 SSE 流式响应。

**请求方法**: POST

**Content-Type**: application/json

**响应类型**: text/event-stream (SSE)

**参数**: 无（URL 参数）

---

## 请求格式

### 请求体结构

```typescript
interface AIChatRequest {
  messages: AIChatMessage[];
  provider_config: AIProviderConfig;
  model: string;
  enable_tools?: boolean;
}

interface AIChatMessage {
  role: string;  // "user" | "assistant" | "system"
  content: string;
}

interface AIProviderConfig {
  name: string;      // 提供商名称
  api_key: string;   // API 密钥
  base_url: string;  // API 基础 URL
}
```

### 请求示例

```json
{
  "messages": [
    {
      "role": "user",
      "content": "请用一句话介绍你自己"
    }
  ],
  "provider_config": {
    "name": "deepseek",
    "api_key": "sk-your-api-key",
    "base_url": "https://api.deepseek.com"
  },
  "model": "deepseek-chat",
  "enable_tools": false
}
```

---

## 响应格式

### SSE 事件类型

#### 1. content_delta - 内容增量

```json
{
  "event_type": "content_delta",
  "content_delta": "你好",
  "tool_call": null,
  "error": null,
  "finish_reason": null
}
```

#### 2. done - 完成

```json
{
  "event_type": "done",
  "content_delta": null,
  "tool_call": null,
  "error": null,
  "finish_reason": "stop"
}
```

#### 3. error - 错误

```json
{
  "event_type": "error",
  "content_delta": null,
  "tool_call": null,
  "error": {
    "code": "AI_SERVICE_ERROR",
    "message": "详细错误信息"
  },
  "finish_reason": null
}
```

### 完整响应示例

```
data: {"event_type":"content_delta","content_delta":"你好","tool_call":null,"error":null,"finish_reason":null}

data: {"event_type":"content_delta","content_delta":"！我是","tool_call":null,"error":null,"finish_reason":null}

data: {"event_type":"content_delta","content_delta":"IfAI","tool_call":null,"error":null,"finish_reason":null}

data: {"event_type":"done","content_delta":null,"tool_call":null,"error":null,"finish_reason":"stop"}
```

---

## 使用示例

### JavaScript (Fetch API)

```javascript
const response = await fetch('http://localhost:3333/api/ai/chat/stream', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    messages: [
      { role: 'user', content: '你好，请介绍一下你自己' }
    ],
    provider_config: {
      name: 'deepseek',
      api_key: 'sk-your-api-key',
      base_url: 'https://api.deepseek.com'
    },
    model: 'deepseek-chat',
    enable_tools: false
  })
});

const reader = response.body.getReader();
const decoder = new TextDecoder();

while (true) {
  const { done, value } = await reader.read();
  if (done) break;

  const chunk = decoder.decode(value);
  const lines = chunk.split('\n');

  for (const line of lines) {
    if (line.startsWith('data: ')) {
      const data = JSON.parse(line.substring(6));

      if (data.event_type === 'content_delta') {
        process.stdout.write(data.content_delta);
      } else if (data.event_type === 'done') {
        console.log('\n✅ 完成');
      } else if (data.event_type === 'error') {
        console.error('❌ 错误:', data.error.message);
      }
    }
  }
}
```

### Python

```python
import requests
import json

def stream_chat(messages, api_key, base_url, model):
    url = "http://localhost:3333/api/ai/chat/stream"
    payload = {
        "messages": messages,
        "provider_config": {
            "name": "deepseek",
            "api_key": api_key,
            "base_url": base_url
        },
        "model": model,
        "enable_tools": False
    }

    response = requests.post(url, json=payload, stream=True)

    for line in response.iter_lines():
        if line:
            line = line.decode('utf-8')
            if line.startswith('data: '):
                data = json.loads(line[6:])
                if data['event_type'] == 'content_delta':
                    print(data['content_delta'], end='', flush=True)
                elif data['event_type'] == 'done':
                    print('\n✅ 完成')
                elif data['event_type'] == 'error':
                    print(f"\n❌ 错误: {data['error']['message']}")

# 使用示例
stream_chat(
    messages=[{"role": "user", "content": "你好"}],
    api_key="sk-your-api-key",
    base_url="https://api.deepseek.com",
    model="deepseek-chat"
)
```

### curl

```bash
curl -N -X POST http://localhost:3333/api/ai/chat/stream \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [{"role": "user", "content": "你好"}],
    "provider_config": {
      "name": "deepseek",
      "api_key": "sk-your-api-key",
      "base_url": "https://api.deepseek.com"
    },
    "model": "deepseek-chat"
  }' | while read -r line; do
    if [[ $line == data:* ]]; then
      data="${line#data:}"
      event_type=$(echo "$data" | jq -r '.event_type')
      if [ "$event_type" = "content_delta" ]; then
        echo "$data" | jq -r '.content_delta'
      elif [ "$event_type" = "done" ]; then
        echo ""
        echo "✅ 完成"
      fi
    fi
  done
```

---

## 错误处理

### HTTP 错误码

| 状态码 | 说明 |
|--------|------|
| 503   | AI 服务不可用 |
| 500   | 内部服务器错误 |

### SSE 错误事件

```json
{
  "event_type": "error",
  "error": {
    "code": "AI_SERVICE_ERROR",
    "message": "API 请求失败: 401 Unauthorized"
  }
}
```

### 错误码列表

| 错误码 | 说明 |
|--------|------|
| `AI_SERVICE_ERROR` | AI 服务调用失败 |
| `NETWORK_ERROR` | 网络错误 |
| `TIMEOUT` | 请求超时 |
| `API_ERROR` | AI API 返回错误 |

---

## 常见问题

### Q1: 如何配置不同的 AI 提供商？

**A**: 修改 `provider_config` 中的 `name` 和 `base_url`：

```json
{
  "provider_config": {
    "name": "openai",
    "api_key": "sk-xxx",
    "base_url": "https://api.openai.com/v1"
  },
  "model": "gpt-4"
}
```

### Q2: 如何启用工具调用？

**A**: 设置 `enable_tools: true`（目前功能待实现）：

```json
{
  "enable_tools": true
}
```

### Q3: SSE 连接超时怎么办？

**A**: 客户端应该实现重连机制，使用 SSE 的自动重连功能。

### Q4: 如何处理多轮对话？

**A**: 在 `messages` 数组中包含历史消息：

```json
{
  "messages": [
    {"role": "user", "content": "你好"},
    {"role": "assistant", "content": "你好！有什么可以帮助你的？"},
    {"role": "user", "content": "介绍一下你自己"}
  ]
}
```

---

## 更多资源

- [测试脚本](../scripts/test-ai-chat-api.sh)
- [E2E 测试指南](../tests/e2e/SSE-E2E-GUIDE.md)
- [HTTP API 源码](../src-tauri/src/http_api.rs)
- [Harness AI Service](../src-tauri/src/harness_ai_service.rs)

---

**最后更新**: 2025-01-17
**维护者**: AI Editor Team
