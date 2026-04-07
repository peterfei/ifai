# 🚀 30条消息自动压缩 E2E 测试使用指南

## 📋 快速开始

### 方法 1: 使用启动脚本（推荐）

```bash
# 1. 运行启动脚本
./tests/e2e/RUN_COMPRESSION_TEST.sh

# 2. 按照提示配置API密钥
#    - 推荐使用 DeepSeek（性价比高）
#    - 或使用本地 Ollama（免费）

# 3. 配置完成后重新运行脚本
```

### 方法 2: 手动配置和运行

```bash
# 1. 创建配置文件
cp tests/e2e/.env.e2e.example tests/e2e/.env.e2e.local

# 2. 编辑配置文件
nano tests/e2e/.env.e2e.local
# 或
code tests/e2e/.env.e2e.local

# 3. 填入配置（选择一种）
```

#### 推荐配置 1: DeepSeek（性价比高）
```bash
E2E_AI_API_KEY=sk-你的DeepSeek密钥
E2E_AI_BASE_URL=https://api.deepseek.com
E2E_AI_MODEL=deepseek-chat
```

#### 推荐配置 2: OpenAI GPT-4o
```bash
E2E_AI_API_KEY=sk-proj-你的OpenAI密钥
E2E_AI_BASE_URL=https://api.openai.com/v1
E2E_AI_MODEL=gpt-4o-mini
```

#### 推荐配置 3: 本地 Ollama（免费）
```bash
E2E_AI_API_KEY=ollama
E2E_AI_BASE_URL=http://localhost:11434/v1
E2E_AI_MODEL=qwen2.5
```

```bash
# 4. 运行测试
npm run test:e2e -- tests/e2e/section5/auto-compression-real.spec.ts
```

## 🎯 测试场景说明

### 场景 1: 快速发送30条消息，验证自动压缩触发
- **目的**: 验证30条消息后自动压缩是否正常工作
- **方法**: 批量注入30条消息，发送真实AI消息触发检查
- **验证**: 检查压缩状态、总结生成

### 场景 2: 验证Token统计和压缩阈值
- **目的**: 验证Token计数和压缩阈值逻辑
- **方法**: 创建35条消息，获取Token统计
- **验证**: Token数量、总结阈值、压缩触发条件

### 场景 3: 真实对话流程测试
- **目的**: 验证真实对话场景下的功能
- **方法**: 发送真实消息，等待AI响应
- **验证**: 对话流程、响应正确性

### 场景 4: 压缩命令直接调用测试
- **目的**: 直接测试压缩命令的功能
- **方法**: 调用 `compact_conversation` Tauri命令
- **验证**: 压缩结果、消息减少

### 场景 5: 边界条件测试
- **目的**: 验证边界情况下不误触发压缩
- **方法**: 创建10条消息（不触发阈值）
- **验证**: 确认不触发压缩

## 🔍 调试技巧

### 1. 查看详细日志
```bash
# 运行测试时查看所有日志
npm run test:e2e -- tests/e2e/section5/auto-compression-real.spec.ts --reporter=list
```

### 2. 使用UI模式观察执行过程
```bash
# 使用 headed 模式（显示浏览器）
npm run test:e2e -- tests/e2e/section5/auto-compression-real.spec.ts --headed
```

### 3. 调整超时时间
```typescript
// 在测试文件中修改超时时间
test.setTimeout(180000); // 增加到180秒
```

### 4. 跳过特定测试
```typescript
// 在测试文件中添加 .skip
test.skip('场景1: 快速发送30条消息', async ({ page }) => {
  // ...
});
```

## ❓ 常见问题

### Q1: 测试超时怎么办？
**A**: 增加超时时间或使用更快的AI模型
```typescript
test.setTimeout(300000); // 增加到5分钟
```

### Q2: API Key 如何获取？
**A**:
- DeepSeek: https://platform.deepseek.com/api_keys
- OpenAI: https://platform.openai.com/api-keys
- 智谱 AI: https://open.bigmodel.cn/usercenter/apikeys

### Q3: 本地如何免费测试？
**A**: 使用 Ollama
```bash
# 安装 Ollama
curl -fsSL https://ollama.com/install.sh | sh

# 拉取模型
ollama pull qwen2.5

# 配置使用
E2E_AI_API_KEY=ollama
E2E_AI_BASE_URL=http://localhost:11434/v1
E2E_AI_MODEL=qwen2.5
```

### Q4: 测试失败怎么办？
**A**:
1. 查看控制台日志（搜索 [E2E] 标记）
2. 检查 API Key 是否正确
3. 检查网络连接
4. 确保应用正在运行（`npm run tauri dev`）

### Q5: 如何只运行某个场景？
**A**: 使用测试名称过滤
```bash
npm run test:e2e -- tests/e2e/section5/auto-compression-real.spec.ts -g "场景1"
```

## 📊 预期结果

### 成功的输出示例
```
[E2E] 🧪 测试开始: 30条消息自动压缩
[E2E] 📋 AI配置: { provider: 'deepseek', model: 'deepseek-chat' }
[E2E Setup] ✅ Stores initialized
[E2E] 📝 注入30条测试消息...
[E2E] 📊 当前消息数量: 30
[E2E] 🚀 发送真实消息触发压缩检查...
[E2E] ⏳ 等待AI响应和压缩触发...
[E2E] 📋 最终状态: {
  messageCount: 12,
  hasCompactInfo: true,
  compactInfo: { originalCount: 31, compressedCount: 12 },
  hasSummary: true
}
[E2E] ✅ 压缩已触发
[E2E] 📊 压缩信息: { originalCount: 31, compressedCount: 12 }
[E2E] 📉 压缩率: 61.3%
[E2E] ✅ 测试完成
```

## 🎉 测试通过标准

测试被认为通过当满足以下条件之一：

1. **自动压缩触发**: `hasCompactInfo: true` 且压缩后消息数量 < 原始数量
2. **生成总结**: `hasSummary: true`
3. **AI正常响应**: 收到AI响应消息
4. **压缩命令成功**: `compactResult.success: true`

## 📝 相关文件

- 测试脚本: `tests/e2e/section5/auto-compression-real.spec.ts`
- 启动脚本: `tests/e2e/RUN_COMPRESSION_TEST.sh`
- 配置模板: `tests/e2e/.env.e2e.example`
- 后端实现: `src-tauri/src/conversation/mod.rs`
- 前端集成: `src/components/AIChat/AIChat.tsx`

## 🔗 相关文档

- [完整测试报告](AUTO_COMPRESSION_E2E_TEST_REPORT.md)
- [真实LLM测试审计](REAL_LLM_E2E_TEST_AUDIT.md)
- [功能测试报告](CONVERSATION_FEATURES_TEST_REPORT.md)

---

**最后更新**: 2026-04-08
**版本**: 1.0
**状态**: ✅ 可用
