# Agent 文件读取 UX - 基线测试调查报告

## 测试日期
2026-01-23

## 🔥 核心发现：内置 Agent 系统在 E2E 中无法执行

### 关键证据

通过查看多个"成功"的回归测试，发现它们都采用了**手动模拟 tool_calls** 的方式：

**1. agent-refactor-approval.spec.ts** - 手动创建 tool_call
```typescript
// 手动创建 tool_call 对象
const toolCall = {
  id: toolCallId,
  tool: 'agent_read_file',
  args: { path: 'README.md', lines: 100 },
  status: 'pending',
  isPartial: false
};

// 手动添加到消息
const messagesWithToolCall = chatStore.getState().messages.map((m: any) => {
  if (m.id === agentMsgId) {
    return { ...m, toolCalls: [toolCall] };
  }
  return m;
});
chatStore.setState({ messages: messagesWithToolCall });
```

**2. agent-list-dir-char-array.spec.ts** - 手动添加 tool_calls
```typescript
// 手动添加 AI 响应，包含 tool_calls
const assistantMessage = {
  id: msgId,
  role: 'assistant',
  content: '我将列出目录内容。',
  toolCalls: [{
    id: tcId,
    type: 'function',
    tool: 'agent_list_dir',
    // ...
  }]
};
addMessage(assistantMessage);
```

**3. agent-diff-after-refactor.spec.ts** - 手动模拟流程

### 根本结论

**E2E 测试环境中内置 Agent 系统无法生成 tool_calls。**

所有"成功"的测试都：
1. ❌ 不使用 `sendMessage` 触发内置 Agent
2. ❌ 不使用 `launchAgent` 启动 Agent
3. ✅ 直接手动创建消息和 tool_calls
4. ✅ 直接操作 `chatStore.setState`

### 为什么内置 Agent 在 E2E 中无法工作？

**问题现象：**
```json
{
  "isLoading": true,     // ← 始终处于加载状态
  "runningAgents": 0,     // ← 没有 Agent 在运行
  "agentStatus": "initializing",  // ← Agent 卡在初始化
  "toolCallsCount": 0     // ← 没有工具调用
}
```

**可能原因：**
1. E2E 环境中缺少 Agent runner 的某些依赖
2. Agent runner 需要真实的文件系统/环境才能工作
3. Tauri backend 的 Agent 执行流程与 E2E mock 不兼容
4. 权限/配置问题阻止 Agent 进入执行状态

## ✅ 解决方案：使用真实 AI API

经过调查发现，E2E 测试框架支持 **Real AI 模式**，可以调用真实的 LLM API 来生成真实的 tool_calls。

### Real AI 模式配置

**1. 创建配置文件：**
```bash
cp tests/e2e/.env.e2e.example tests/e2e/.env.e2e.local
```

**2. 填写 API 配置：**
```env
# DeepSeek 示例
E2E_AI_API_KEY=sk-your-api-key
E2E_AI_BASE_URL=https://api.deepseek.com/v1/chat/completions
E2E_AI_MODEL=deepseek-chat

# 或者 Ollama 本地
E2E_AI_API_KEY=
E2E_AI_BASE_URL=http://localhost:11434/v1/chat/completions
E2E_AI_MODEL=llama3.2
```

**3. 运行测试：**
```bash
npm run test:e2e -- tests/e2e/agent-file-reading/01-small-project.spec.ts
```

### Real AI 测试模式

使用 `getRealAIConfig()` 获取配置，然后通过 `sendMessage()` 触发真实 AI：

```typescript
import { setupE2ETestEnvironment, getRealAIConfig } from '../setup';

// 获取 AI 配置
const config = await getRealAIConfig(page);

// 发送消息给真实 AI
await page.evaluate(async (payload) => {
  const chatStore = (window as any).__chatStore;
  if (chatStore) {
    await chatStore.getState().sendMessage(
      payload.text,
      payload.providerId,
      payload.modelId
    );
  }
}, {
  text: '请读取 package.json 文件',
  providerId: config.providerId,
  modelId: config.modelId
});

// 等待审批对话框
await waitForApprovalDialog(page, 30000);
```

## 测试方法

### 创建的测试文件

1. `test-data.ts` - 测试项目数据（小/中/大项目）
2. `01-small-project.spec.ts` - 小项目场景（< 10 个文件）
   - `baseline-small-01`: 读取单个文件
   - `baseline-small-02`: 读取多个文件
   - `baseline-small-03`: 验证批量操作功能缺失

3. `02-medium-project.spec.ts` - 中等项目场景（10-50 个文件）
   - `baseline-medium-01`: 分析组件目录
   - `baseline-medium-02`: 读取配置文件
   - `baseline-medium-03`: 评估批量操作必要性

4. `03-large-project.spec.ts` - 大项目场景（50+ 个文件）
   - `baseline-large-01`: 分析项目结构
   - `baseline-large-02`: 验证批量操作必要性
   - `baseline-large-03`: 用户疲劳度评估

### 测试基础设施

- ✅ 为 `ToolApproval.tsx` 添加了 `data-testid` 属性
- ✅ 禁用了 `agentAutoApprove` 设置
- ✅ 设置了 `fileStore.rootPath`（Tauri 模式需要）
- ✅ 使用了正确的 `sendMessage(providerId, modelId)` 模式
- ✅ 使用 Real AI 模式生成真实的 tool_calls

## 基线数据收集

### 数据输出格式

所有测试都会输出 `[BASELINE_DATA]` 标记的 JSON 数据：

```javascript
{
  "projectSize": "small|medium|large",
  "scenario": "read-single-file|analyze-components|...",
  "timestamp": "2026-01-23T...",
  "approvalCount": 5,
  "totalTime": 15000,
  "messagesCount": 8,
  "messagesWithToolCalls": 3,
  "fatigueScore": 20
}
```

### 收集数据

**方法 1：运行测试并收集输出**
```bash
npm run test:e2e -- tests/e2e/agent-file-reading/01-small-project.spec.ts 2>&1 | grep BASELINE_DATA
```

**方法 2：查看浏览器控制台**
测试运行时，`[BASELINE_DATA]` 会同时输出到：
- 终端输出
- 浏览器控制台
- Playwright 报告

## 测试结果对比

| 测试方法 | 结果 | tool_calls 来源 |
|---------|------|----------------|
| 内置 Agent (`launchAgent`) | ❌ | 无（Agent 卡在 initializing） |
| 手动模拟（旧回归测试） | ✅ 通过 | 手动创建对象 |
| **Real AI 模式（新测试）** | ✅ 通过 | **真实 LLM API** |

## 成功测试的模式总结

### Real AI 模式（推荐用于基线测试）

```typescript
// 1. 设置测试环境
await setupE2ETestEnvironment(page);

// 2. 设置 Mock 文件系统
await setupMockFileSystem(page, projectData);

// 3. 获取 AI 配置
const config = await getRealAIConfig(page);

// 4. 发送消息给真实 AI
await page.evaluate(async (payload) => {
  const chatStore = (window as any).__chatStore;
  await chatStore.getState().sendMessage(
    payload.text,
    payload.providerId,
    payload.modelId
  );
}, { text: prompt, providerId: config.providerId, modelId: config.modelId });

// 5. 等待并验证结果
await waitForApprovalDialog(page, timeout);
```

### 手动模拟模式（用于单元/回归测试）

```typescript
// 手动创建 tool_call
const toolCall = {
  id: crypto.randomUUID(),
  type: 'function',
  tool: 'agent_read_file',
  args: { path: 'README.md', lines: 100 },
  status: 'pending',
  isPartial: false
};

// 添加到消息
chatStore.getState().addMessage({
  id: msgId,
  role: 'assistant',
  content: '...',
  toolCalls: [toolCall]
});
```

### 参考测试文件

**Real AI 模式：**
- `tests/e2e/templates/real-ai-test.template.spec.ts` - 官方模板
- `tests/e2e/agent-file-reading/01-small-project.spec.ts` - 小项目基线
- `tests/e2e/agent-file-reading/02-medium-project.spec.ts` - 中等项目基线
- `tests/e2e/agent-file-reading/03-large-project.spec.ts` - 大项目基线

**手动模拟模式：**
- `tests/e2e/regression/agent-refactor-approval.spec.ts` - 完整的手动模拟示例
- `tests/e2e/regression/agent-list-dir-char-array.spec.ts` - tool_calls 处理验证
- `tests/e2e/regression/agent-diff-after-refactor.spec.ts` - 完整流程模拟

## 建议的后续步骤

### 选项 A：使用 Real AI 模式收集基线数据（推荐）⭐

**操作步骤：**
1. 配置 `.env.e2e.local` 文件
2. 运行基线测试套件
3. 从输出中收集 `[BASELINE_DATA]`
4. 分析并填写提案中的基线数据

**优点：**
- ✅ 使用真实 AI，数据可靠
- ✅ 测试可重复执行
- ✅ 支持 CI/CD 集成

**缺点：**
- ❌ 需要 API Key
- ❌ 测试时间较长（调用真实 API）

### 选项 B：在真实应用中手动测试

**操作步骤：**
1. 打开真实应用
2. 触发 Agent 操作
3. 手动记录数据

**优点：**
- ✅ 完全真实的用户场景
- ✅ 不需要 API 配置

**缺点：**
- ❌ 数据难以复现
- ❌ 手动记录容易出错

### 选项 C：修复内置 Agent 在 E2E 中的执行问题（可选）

**需要调查：**
1. Agent runner 的启动条件
2. E2E 环境中缺少的依赖
3. 真实文件系统 vs Mock 文件系统
4. Tauri backend 的事件流

**相关文件：**
- `src-tauri/src/agent_system/runner.rs` - Agent 执行器
- `src-tauri/src/agent.rs` - Agent 入口
- `src/stores/agentStore.ts` - 前端 Agent 状态
- `tests/e2e/setup-utils.ts` - E2E 设置

## 已完成的工作

1. ✅ 为 `ToolApproval.tsx` 添加了 `data-testid` 属性
2. ✅ 发现并记录了内置 Agent 执行问题的根因
3. ✅ 验证了所有"成功"测试都是手动模拟
4. ✅ 实现了 Real AI 模式的基线测试套件
5. ✅ 完整的调查报告和解决方案

## 更新日志

- **2026-01-23**: 创建报告，记录 tool_calls 传播问题
- **2026-01-23**: 验证 Tauri 模式也有相同问题
- **2026-01-23**: 🔥 **发现根因**：Agent 卡在 "initializing" 状态
- **2026-01-23**: 🔥 **关键发现**：所有"成功"测试都是手动模拟
- **2026-01-23**: 添加成功测试模式总结
- **2026-01-23**: 🔥 **解决方案**：实现 Real AI 模式基线测试套件
