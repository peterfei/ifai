# 流式骨架屏验证指南

## 🔍 手动验证步骤

### 1. 启动应用
```bash
npm run dev
```

### 2. 打开浏览器开发者工具
- 按 F12 或右键 → 检查
- 切换到 Console 标签页

### 3. 清空对话（如果有）
点击 "New Thread" 按钮

### 4. 发送一条消息
在输入框中输入 "你好" 并点击发送

### 5. 观察 Console 输出

您应该看到类似以下的日志：

```
[StreamingSkeleton] 调试信息: {
  isLoading: true,
  messageCount: 2,
  lastMessageId: "msg-xxx",
  lastMessageRole: "assistant",
  lastMessageIsStreaming: true,
  lastMessageContentLength: 10,
  hasStreamingContent: true,
  shouldShowSkeleton: false  // 🔥 关键值
}

[StreamingSkeleton] 组件已渲染！ {
  timestamp: "2025-...",
  containerClass: "flex flex-col gap-2 p-3"
}
```

### 6. 检查 DOM 状态

在 Console 中运行以下命令：

```javascript
// 检查骨架屏元素
document.querySelector('[data-testid="streaming-message-skeleton"]')

// 检查消息数量
document.querySelectorAll('[data-testid^="message-"]').length

// 检查骨架屏的父元素
const skeleton = document.querySelector('[data-testid="streaming-message-skeleton"]');
skeleton?.parentElement?.parentElement;  // 查看它在哪个容器中
```

### 7. 预期结果

#### 场景 A：骨架屏应该显示
- `shouldShowSkeleton: true`
- 看到 `[StreamingSkeleton] 组件已渲染！`
- DOM 中存在 `[data-testid="streaming-message-skeleton"]`
- 骨架屏在消息列表底部（不是输入框下面）

#### 场景 B：骨架屏不应该显示
- `shouldShowSkeleton: false`
- 可能看到也可能看不到 `[StreamingSkeleton] 组件已渲染！`
- 即使看到，也应该立即消失

## 🐛 问题诊断

### 如果 `shouldShowSkeleton` 总是 `false`

可能原因：
1. `isLoading` 在发送消息后立即变为 `false`
2. `hasStreamingContent` 检测过于敏感（消息一创建就认为有内容了）

解决方案：
- 检查 ChatStore 中 `isLoading` 的更新时机
- 调整 `hasStreamingContent` 的检测逻辑

### 如果骨架屏出现在输入框下面

可能原因：
- 骨架屏被渲染到了错误的容器中

解决方案：
- 检查 VirtualMessageList 的结构
- 确保骨架屏在消息列表容器内

### 如果骨架屏一直显示不消失

可能原因：
- `isLoading` 没有在流式结束后更新为 `false`
- `hasStreamingContent` 检测不正确

解决方案：
- 检查流式响应完成时的状态更新
- 调整骨架屏消失的条件判断

## 📊 调试信息收集

请收集以下信息以便诊断问题：

1. **Console 日志截图**
   - 发送消息前后的完整 Console 输出

2. **DOM 结构截图**
   - Elements 面板中骨架屏元素的位置
   - 骨架屏元素的完整 HTML 结构

3. **状态信息**
   ```javascript
   // 在 Console 中运行
   {
     skeleton: document.querySelector('[data-testid="streaming-message-skeleton"]'),
     messages: document.querySelectorAll('[data-testid^="message-"]').length,
     scrollContainer: document.querySelector('[data-testid="chat-scroll-container"]'),
     inputContainer: document.querySelector('[data-testid="chat-input-container"]')
   }
   ```
