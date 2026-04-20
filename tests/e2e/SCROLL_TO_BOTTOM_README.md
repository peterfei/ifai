# 滚动到底部功能 E2E 测试说明

## 测试概述

本测试套件用于验证聊天应用中发送消息后自动滚动到底部的功能，特别是在长历史消息场景下的行为。

## 测试文件

- **文件路径**: `tests/e2e/scroll-to-bottom-after-send.test.ts`
- **运行方式**: `npm run test:e2e scroll-to-bottom-after-send`

## 测试场景

### 1. 基础滚动测试 (`应该在发送消息后自动滚动到底部，即使有长历史消息`)

**测试步骤**:
1. 创建 20 条历史消息（触发虚拟滚动）
2. 用户手动滚动到中间位置
3. 用户发送新消息
4. 验证滚动条是否移动到底部

**验证点**:
- 距离底部小于 100px
- 最后一条消息可见

### 2. 特殊命令测试 (`应该在发送特殊命令消息后也滚动到底部`)

**测试步骤**:
1. 创建 15 条历史消息
2. 用户手动滚动到中间位置
3. 发送 `/help` 命令
4. 验证滚动到底部

**验证点**:
- 距离底部小于 100px

### 3. 虚拟滚动边界测试 (`应该在虚拟滚动边界（15条消息）时正确切换滚动策略`)

**测试场景**:
- **场景1**: 14条消息（虚拟滚动未启用）
- **场景2**: 15条消息（虚拟滚动启用）
- **场景3**: 30条消息（虚拟滚动稳定工作）

**验证点**:
- 每个场景下发送消息后都能正确滚动到底部
- 虚拟滚动切换不影响滚动功能

### 4. 时序验证测试 (`应该验证滚动到底部的详细时序`)

**测试目的**: 验证滚动行为在不同时间点的表现

**检查点**:
- 发送后 0ms
- 发送后 50ms
- 发送后 100ms
- 发送后 500ms
- 发送后 1000ms（最终状态）

**验证点**:
- 最终距离底部小于 100px

## 技术实现

### 测试数据生成

测试使用 `window.__chatStore` 直接添加消息到状态中：

```typescript
await page.evaluate((msgNum) => {
  const chatStore = (window as any).__chatStore;
  if (chatStore) {
    chatStore.getState().addMessage({
      id: `test-history-${msgNum}`,
      role: msgNum % 2 === 0 ? 'user' : 'assistant',
      content: `历史消息 ${msgNum} - 这是一条用于测试滚动到底部功能的长消息`,
      timestamp: Date.now() - (20 - msgNum) * 60000, // 模拟时间间隔
    });
  }
}, i);
```

### 元素选择器

测试使用多个后备选择器以确保兼容性：

```typescript
const chatContainer = page.locator('[data-testid="chat-scroll-container"]');
const inputBox = page.locator('input[placeholder*="输入"], textarea[placeholder*="输入"], [data-testid="chat-input"]');
const sendButton = page.locator('button[aria-label*="发送"], button:has-text("发送"), [data-testid="chat-send-button"]');
```

### 滚动验证

通过计算距离底部的距离来验证滚动是否成功：

```typescript
const distanceFromBottom = await chatContainer.evaluate((el) => {
  return el.scrollHeight - el.scrollTop - el.clientHeight;
});

// 验证距离底部小于 100px
expect(distanceFromBottom).toBeLessThan(100);
```

## 手动测试

测试文件中包含可在浏览器控制台执行的测试代码，用于手动验证：

1. 打开应用
2. 打开浏览器开发者工具（F12）
3. 切换到 Console 标签
4. 复制并执行测试代码（见测试文件中的 `设置测试环境` 测试用例）

## 虚拟滚动说明

### 虚拟滚动启用条件

虚拟滚动在消息数量 >= 15 时自动启用。

### 虚拟滚动实现

- 使用 `@tanstack/react-virtual` 库
- 滚动到底部通过 `virtualizer.scrollToIndex(lastIndex, { align: 'end' })` 实现
- 对于短对话（< 15条消息），使用直接的 `scrollTop` 赋值

### 滚动策略切换

```typescript
const scrollToBottom = () => {
  const container = scrollContainerRef.current;
  if (!container) return;

  if (rawMessages.length >= 15) {
    // 使用虚拟滚动 API
    virtualMessageListRef.current?.scrollToBottom();
  } else {
    // 直接操作 scrollTop
    container.scrollTop = container.scrollHeight;
  }
};
```

## 调试信息

测试会在控制台输出详细的调试信息：

```
初始状态: { scrollTop: 0, scrollHeight: 10000, clientHeight: 500, messageCount: 20 }
手动滚动到中间后: { scrollTop: 5000 }
发送消息后: { scrollTop: 9500, scrollHeight: 10000, distanceFromBottom: 50, messageCount: 21 }
```

## 故障排查

### 测试失败常见原因

1. **选择器不匹配**: 检查 DOM 结构是否与选择器匹配
2. **时间不足**: 增加等待时间，特别是虚拟滚动场景
3. **Store 未初始化**: 确保 `window.__chatStore` 已正确初始化

### 运行单个测试

```bash
npm run test:e2e -- scroll-to-bottom-after-send.test.ts:27
```

### 使用 Playwright Inspector

```bash
npm run test:e2e -- --debug scroll-to-bottom-after-send
```

## 相关文件

- `src/components/AIChat/AIChat.tsx` - 主聊天组件，包含滚动逻辑
- `src/components/AIChat/VirtualMessageList.tsx` - 虚拟滚动列表组件
- `src/hooks/useChatScrollController.ts` - 滚动控制器 Hook
- `tests/e2e/setup-utils.ts` - E2E 测试环境设置

## 版本历史

- **v1.0.0** - 初始版本，包含基础滚动测试
- **v1.1.0** - 添加虚拟滚动边界测试
- **v1.2.0** - 添加时序验证测试
- **v1.3.0** - 修复选择器，使用 `chat-scroll-container` 替代 `chat-container`
- **v1.4.0** - 改用 `setupE2ETestEnvironment` 和 `window.__chatStore`
