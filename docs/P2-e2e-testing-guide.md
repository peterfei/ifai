# P2 TodoWrite E2E 测试指南

## 概述

本指南说明如何对 P2 TodoWrite 功能进行端到端测试。

## 测试文件

- **测试文件**: `tests/e2e/p2-todowrite.spec.ts`
- **组件**: `src/components/TodoWrite/TodoWritePanel.tsx`
- **Store**: `src/stores/todoWriteStore.ts`
- **Service**: `src/services/taskStoreService.ts`

## 前置条件

### 1. Tauri 开发环境

确保 Tauri 后端正在运行：

```bash
# 终端 1：启动 Tauri 开发服务器
npm run tauri:dev
```

### 2. 配置 E2E 环境

创建 `tests/e2e/.env.e2e.local` 文件：

```bash
# AI Provider 配置
VITE_AI_PROVIDER=openai
VITE_AI_API_KEY=sk-your-api-key-here
VITE_AI_MODEL=gpt-4o

# 或使用 DeepSeek
VITE_AI_PROVIDER=deepseek
VITE_AI_API_KEY=sk-your-deepseek-key
VITE_AI_MODEL=deepseek-chat
```

## 运行测试

### 基本命令

```bash
# 运行所有 P2 TodoWrite 测试
npm run test:e2e -- p2-todowrite.spec.ts

# 运行单个测试用例
npm run test:e2e -- p2-todowrite.spec.ts -g "should auto-open"

# 显示浏览器运行（调试模式）
npm run test:e2e:headed -- p2-todowrite.spec.ts

# UI 模式（交互式调试）
npm run test:e2e:ui -- p2-todowrite.spec.ts

# 调试模式（逐步执行）
npm run test:e2e:debug -- p2-todowrite.spec.ts
```

### 快速测试

```bash
# 只运行快速测试
npm run test:e2e:fast

# 运行中等速度的测试
npm run test:e2e:medium
```

## 测试用例说明

### 1. 自动打开面板测试

```typescript
test('should auto-open TodoWrite panel when AI creates tasks')
```

**流程**：
1. 用户输入触发 TodoWrite 的提示词
2. AI 调用 TodoWrite 工具
3. 用户批准工具调用
4. 验证任务面板自动打开
5. 验证任务数量正确

### 2. 任务状态更新测试

```typescript
test('should update task status correctly')
```

**流程**：
1. 直接操作 store 创建任务
2. 打开任务面板
3. 点击"开始"按钮 → 验证状态变为"进行中"
4. 点击"完成"按钮 → 验证状态变为"已完成"

### 3. 任务删除测试

```typescript
test('should delete task correctly')
```

**流程**：
1. 创建测试任务
2. 点击删除按钮
3. 验证任务被删除

### 4. 清空任务测试

```typescript
test('should clear all tasks')
```

**流程**：
1. 创建多个任务
2. 点击清空按钮
3. 验证所有任务被清空

### 5. 统计信息测试

```typescript
test('should display correct task statistics')
```

**流程**：
1. 创建不同状态的任务
2. 验证统计信息正确显示

### 6. 关闭面板测试

```typescript
test('should close panel when close button clicked')
```

**流程**：
1. 打开任务面板
2. 点击关闭按钮
3. 验证面板关闭

### 7. 刷新任务测试

```typescript
test('should refresh tasks from backend')
```

**流程**：
1. 打开任务面板
2. 点击刷新按钮
3. 验证刷新动画显示

## data-testid 属性

为支持 E2E 测试，TodoWritePanel 组件添加了以下 testid：

| 元素 | testid |
|------|--------|
| 面板容器 | `todowrite-panel` |
| 任务数量 | `task-count` |
| 关闭按钮 | `close-panel-button` |
| 刷新按钮 | `refresh-tasks-button` |
| 清空按钮 | `clear-tasks-button` |
| 待办统计 | `stat-pending` |
| 进行中统计 | `stat-in-progress` |
| 已完成统计 | `stat-completed` |
| 任务项 | `task-item` |
| 任务状态 | `task-status` |
| 开始按钮 | `task-start-button` |
| 完成按钮 | `task-complete-button` |
| 删除按钮 | `task-delete-button` |
| 刷新图标 | `refresh-icon` |

## 调试技巧

### 1. 使用 page.pause()

在测试中添加断点：

```typescript
test('debug example', async ({ page }) => {
  await page.goto('/');
  await page.pause(); // 暂停执行，打开 Playwright Inspector
  // 继续测试...
});
```

### 2. 查看浏览器日志

测试会自动捕获浏览器控制台错误：

```typescript
page.on('console', msg => {
  if (msg.type() === 'error') {
    console.log('[Browser Error]', msg.text());
  }
});
```

### 3. 直接操作 Store

在测试中直接操作 store 进行快速测试：

```typescript
await page.evaluate(() => {
  const useTodoWriteStore = (window as any).__todoWriteStore;
  useTodoWriteStore.getState().syncFromToolCall([
    { content: 'Test Task', activeForm: 'Test Task', status: 'pending' },
  ]);
  useTodoWriteStore.getState().setPanelOpen(true);
});
```

### 4. 截图和录屏

```typescript
// 截图
await page.screenshot({ path: 'screenshot.png' });

// 录屏（在 test 配置中启用）
// use: { video: 'retain-on-failure' }
```

## 测试报告

### 生成 HTML 报告

```bash
# 运行测试后
npm run test:e2e:report
```

### 查看失败测试

```bash
# 只运行失败的测试
npm run test:e2e -- p2-todowrite.spec.ts --repeat=0
```

## 常见问题

### 1. 测试超时

如果测试超时，增加超时时间：

```typescript
test('slow test', async ({ page }) => {
  // ...
}, { timeout: 60000 }); // 60秒超时
```

### 2. Tauri bridge 未初始化

确保在测试前等待 Tauri 初始化：

```typescript
await setupE2ETestEnvironment(page, {
  useRealAI: true,
});
await page.waitForTimeout(3000);
```

### 3. 元素未找到

使用 `waitFor` 等待元素：

```typescript
await expect(page.locator('[data-testid="todowrite-panel"]'))
  .toBeVisible({ timeout: 10000 });
```

## CI/CD 集成

### GitHub Actions 示例

```yaml
name: E2E Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: macos-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '20'
      - run: npm ci
      - run: npm run test:e2e -- p2-todowrite.spec.ts
```

## 下一步

- [ ] 添加更多边界条件测试
- [ ] 添加并发操作测试
- [ ] 添加性能测试
- [ ] 添加可访问性测试
