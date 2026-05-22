## ProgressCard 测试指南

**✅ Phase D 集成完成！**
- MessageCardRegistry 已集成到 MessageItem
- 现在可以测试 ProgressCard 渲染了

---

### 🚀 快速测试（一行命令）

如果应用已启动，直接在控制台粘贴：

```javascript
window.__chatStore?.getState()?.addMessage({id:'test-'+Date.now(),role:'assistant',content:'',cardType:'progress',data:{title:'探索项目代码库结构',agentId:'explore',progress:{currentStep:4,totalSteps:8,percentage:50}}})
```

---

### 方法 1：浏览器控制台（完整版）

1. **启动应用**
   ```bash
   npm run tauri:dev
   ```

2. **打开浏览器开发者工具**
   - Windows/Linux: `F12` 或 `Ctrl+Shift+I`
   - macOS: `Cmd+Option+I`

3. **复制粘贴以下代码到控制台**
   ```javascript
   (function() {
     // 访问 chatStore（应用暴露的是 window.__chatStore）
     const chatStoreHook = window.__chatStore;

     if (!chatStoreHook) {
       console.error('❌ 找不到 window.__chatStore，请确保应用已启动');
       console.log('💡 提示：启动应用后，打开开发者工具，然后重新运行此脚本');
       return;
     }

     // 从 hook 获取 store 实例
     const chatStore = chatStoreHook.getState?.();
     if (!chatStore || !chatStore.addMessage) {
       console.error('❌ chatStore.getState() 返回无效对象');
       return;
     }

     // 创建测试消息
     const testMessage = {
       id: 'test-progress-' + Date.now(),
       role: 'assistant',
       content: '',
       cardType: 'progress',
       data: {
         title: '探索项目代码库结构',
         agentId: 'explore',
         progress: {
           currentStep: 4,
           totalSteps: 8,
           percentage: 50
         }
       }
     };

     // 添加消息
     chatStore.addMessage(testMessage);

     console.log('✅ ProgressCard 测试消息已添加！');
     console.log('💡 再次添加请按↑箭头然后Enter');
   })();
   ```

4. **查看效果**
   - 测试消息会出现在聊天流中
   - 显示：Agent 头像 + 任务标题 + "步骤 4/8" + 进度条

---

### 方法 2：测试不同 Agent

**测试 review（代码审查）进度：**
```javascript
const addReviewProgress = () => {
  const chatStore = window.__chatStore?.getState?.();
  if (!chatStore) {
    console.error('❌ 找不到 chatStore');
    return;
  }
  chatStore.addMessage({
    id: 'test-review-' + Date.now(),
    role: 'assistant',
    content: '',
    cardType: 'progress',
    data: {
      title: '审查 PR #123: 添加用户认证功能',
      agentId: 'review',
      progress: { currentStep: 2, totalSteps: 5, percentage: 40 }
    }
  });
};
addReviewProgress();
```

**测试 refactor（重构）进度：**
```javascript
const addRefactorProgress = () => {
  const chatStore = window.__chatStore?.getState?.();
  if (!chatStore) {
    console.error('❌ 找不到 chatStore');
    return;
  }
  chatStore.addMessage({
    id: 'test-refactor-' + Date.now(),
    role: 'assistant',
    content: '',
    cardType: 'progress',
    data: {
      title: '重构 AIChat 组件（拆分消息渲染器）',
      agentId: 'refactor',
      progress: { currentStep: 6, totalSteps: 12, percentage: 50 }
    }
  });
};
addRefactorProgress();
```

---

### 方法 3：连续添加多条进度消息

```javascript
const addMultipleProgress = () => {
  const chatStore = window.__chatStore?.getState?.();
  if (!chatStore) {
    console.error('❌ 找不到 chatStore');
    return;
  }

  const progressData = [
    { title: '步骤 1：扫描目录', agent: 'explore', step: 1, total: 8 },
    { title: '步骤 2：分析文件', agent: 'explore', step: 2, total: 8 },
    { title: '步骤 3：识别依赖', agent: 'explore', step: 3, total: 8 },
    { title: '步骤 4：生成报告', agent: 'explore', step: 4, total: 8 },
  ];

  progressData.forEach((data, i) => {
    setTimeout(() => {
      chatStore.addMessage({
        id: 'test-prog-' + i + '-' + Date.now(),
        role: 'assistant',
        content: '',
        cardType: 'progress',
        data: {
          title: data.title,
          agentId: data.agent,
          progress: {
            currentStep: data.step,
            totalSteps: data.total,
            percentage: Math.round((data.step / data.total) * 100)
          }
        }
      });
    }, i * 1000);
  });

  console.log('✅ 将在 4 秒内添加 4 条进度消息');
};

addMultipleProgress();
```

---

### 预期效果

ProgressCard 应该显示为：

```
┌─────────────────────────────────────┐
│ [EXP] 探索项目代码库结构            │  ← Agent 头像 + 标题
│ 步骤 4/8                            │  ← 步骤文本
│ ████████░░░░░░░ 50%                │  ← 进度条
└─────────────────────────────────────┘
```

---

### 常见问题

**Q: 控制台报错 "找不到 window.__chatStore"**
- A:
  1. 确保应用已启动（`npm run tauri:dev`）
  2. 等待应用完全加载（看到聊天界面）
  3. 在控制台输入 `window.__chatStore` 检查是否存在
  4. 如果仍报错，尝试刷新页面后重新运行脚本

**Q: 消息添加了但看不到 ProgressCard**
- A: 已修复！Phase D 集成已完成，MessageCardRegistry 已集成到 AIChat

**Q: 如何清除测试消息**
- A: 刷新页面或使用 `window.__chatStore.getState().setState({ messages: [] })`

**Q: 如何验证 MessageCard 是否已注册？**
- A: 在控制台运行：
  ```javascript
  // 检查 ProgressCard 是否已注册
  import('/src/gui/conversation/MessageCardRegistry.js').then(m => {
    console.log('已注册的卡片类型:', m.getRegisteredCardTypes());
    console.log('progress 组件:', m.getCardComponent('progress'));
  });
  ```
