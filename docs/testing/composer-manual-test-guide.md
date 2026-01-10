# Composer 2.0 手动测试指南

## 📋 测试准备

### 1. 启动开发服务器

```bash
# 商业版模式（推荐，包含完整功能）
APP_EDITION=commercial npm run dev

# 或社区版模式
npm run dev
```

服务器启动后访问: **http://localhost:1420**

---

## 🧪 测试方法

### 方法一：使用浏览器控制台测试脚本（推荐）

#### 步骤：

1. **打开开发者工具**
   - 按 `F12` 或 `Cmd+Option+I` (Mac)

2. **切换到 Console 标签**

3. **加载测试脚本**

   在 Console 中运行：
   ```javascript
   // 加载测试脚本
   fetch('/scripts/test-composer-integration.js')
     .then(r => r.text())
     .then(eval)
     .then(() => console.log('✅ 测试工具已加载'))
   ```

4. **注入模拟数据**
   ```javascript
   testComposer.inject()
   ```

5. **查看结果**
   - ✅ 应该看到新的 AI 消息出现
   - ✅ 消息下方应该显示"查看 Diff (3 个文件)"按钮
   - ✅ 按钮样式：蓝色背景 + 文件图标

6. **测试 Composer 面板**
   ```javascript
   testComposer.open()
   ```
   或直接点击"查看 Diff"按钮

7. **验证 UI 元素**
   - ✅ Composer 面板应该以模态框形式打开
   - ✅ 左侧显示文件列表（3个文件）
   - ✅ 右侧显示 Diff 视图
   - ✅ 顶部有"全部接受"和"全部拒绝"按钮
   - ✅ 每个文件有独立的接受/拒绝按钮

---

### 方法二：手动触发 AI 对话（真实环境）

#### 步骤：

1. **在聊天框中输入需要写入文件的请求**

   例如：
   ```
   创建一个简单的 Logger 工具类，包含 info、error、debug 方法
   ```

2. **等待 AI 响应并执行工具调用**

3. **验证结果**
   - ✅ 工具调用完成后，消息下方显示"查看 Diff"按钮
   - ✅ 点击按钮打开 Composer 面板
   - ✅ 查看所有生成的文件变更

---

### 方法三：直接操作 Store（高级）

#### 步骤：

1. **打开浏览器控制台**

2. **访问 chatStore**
   ```javascript
   const store = window.__chatStore.getState();
   ```

3. **手动添加测试消息**
   ```javascript
   store.addMessage({
       id: 'manual-test-' + Date.now(),
       role: 'assistant',
       content: '测试消息',
       toolCalls: [
           {
               id: 'tool-1',
               tool: 'agent_write_file',
               function: {
                   name: 'agent_write_file',
                   arguments: JSON.stringify({
                       rel_path: 'test.txt',
                       content: 'Hello, World!'
                   })
               },
               result: {
                   success: true,
                   message: 'File created',
                   originalContent: '',
                   newContent: 'Hello, World!'
               },
               status: 'completed'
           }
       ],
       timestamp: Date.now()
   });
   ```

4. **验证 UI 更新**

---

## ✅ 验证清单

### UI 显示验证

- [ ] **查看 Diff 按钮**
  - [ ] 蓝色背景 (`bg-blue-600`)
  - [ ] FileCode 图标
  - [ ] 显示文件数量
  - [ ] Hover 效果

- [ ] **Composer 面板**
  - [ ] 模态框遮罩 (`fixed inset-0 z-[210]`)
  - [ ] 面板容器 (`w-[95vw] h-[90vh]`)
  - [ ] 深色背景 (`bg-[#252526]`)

- [ ] **文件列表**
  - [ ] 左侧固定宽度 (`320px`)
  - [ ] 文件项显示：
    - [ ] 变更类型图标
    - [ ] 文件名
    - [ ] 目录路径
    - [ ] 接受/拒绝按钮

- [ ] **Diff 视图**
  - [ ] 右侧自适应宽度
  - [ ] 原始内容面板
  - [ ] 新内容面板
  - [ ] 代码高亮显示

### 交互验证

- [ ] **打开面板**
  - [ ] 点击"查看 Diff"按钮
  - [ ] 面板以动画方式出现

- [ ] **切换文件**
  - [ ] 点击文件列表项
  - [ ] Diff 视图更新为选中文件

- [ ] **单个文件操作**
  - [ ] 点击 ✓ 按钮
  - [ ] 文件标记为"已应用"
  - [ ] 显示 Toast 提示

- [ ] **全部接受**
  - [ ] 点击"全部接受"按钮
  - [ ] 面板关闭
  - [ ] 显示成功提示

- [ ] **全部拒绝**
  - [ ] 点击"全部拒绝"按钮
  - [ ] 面板关闭
  - [ ] 显示提示

- [ ] **关闭面板**
  - [ ] 点击 ✕ 按钮
  - [ ] 面板关闭
  - [ ] 状态重置

---

## 🐛 常见问题

### 问题：找不到"查看 Diff"按钮

**原因**：
- 消息仍在流式输出中
- toolCalls.result 未正确设置
- 检测逻辑未识别文件变更

**解决**：
```javascript
// 检查消息状态
testComposer.check()

// 确认 toolCalls 包含 result.success
const store = window.__chatStore.getState();
const lastMsg = store.messages[store.messages.length - 1];
console.log('Last message:', lastMsg);
console.log('Tool calls:', lastMsg.toolCalls);
```

### 问题：点击按钮后无反应

**原因**：
- onOpenComposer 回调未正确传递
- Composer 状态未正确设置

**解决**：
```javascript
// 检查状态
const store = window.__chatStore.getState();
console.log('Store state:', store);

// 手动触发
store.setComposerOpen?.(true);
```

### 问题：Composer 面板样式异常

**原因**：
- CSS 文件未正确加载
- z-index 层级冲突

**解决**：
```javascript
// 检查 CSS 是否加载
const styles = document.styleSheets;
console.log('Loaded stylesheets:', Array.from(styles).map(s => s.href));

// 检查 DOM 结构
const panel = document.querySelector('.composer-diff-container');
console.log('Composer panel:', panel);
console.log('Computed styles:', window.getComputedStyle(panel));
```

---

## 📊 测试报告模板

```markdown
## Composer 2.0 测试报告

**测试日期**: 2025-XX-XX
**测试人员**: [Your Name]
**浏览器**: Chrome/Firefox/Safari [Version]

### 测试结果

| 功能项 | 状态 | 备注 |
|--------|------|------|
| 查看按钮显示 | ✅/❌ | |
| 面板打开 | ✅/❌ | |
| 文件列表显示 | ✅/❌ | |
| Diff 视图显示 | ✅/❌ | |
| 单个文件接受 | ✅/❌ | |
| 单个文件拒绝 | ✅/❌ | |
| 全部接受 | ✅/❌ | |
| 全部拒绝 | ✅/❌ | |
| 面板关闭 | ✅/❌ | |

### 发现的问题

1. [问题描述]
   - 复现步骤:
   - 期望行为:
   - 实际行为:

### 屏幕截图

[附上截图]

### 建议

[改进建议]
```

---

## 🎯 快速测试命令

```javascript
// 一键完整测试
async function quickTest() {
    console.log('🧪 开始快速测试...');

    // 1. 注入数据
    testComposer.inject();

    // 等待 UI 更新
    await new Promise(r => setTimeout(r, 1000));

    // 2. 打开面板
    testComposer.open();

    // 等待动画
    await new Promise(r => setTimeout(r, 500));

    // 3. 检查 DOM
    const panel = document.querySelector('.composer-diff-container');
    const fileItems = document.querySelectorAll('.composer-file-item');

    console.log('✅ 测试完成');
    console.log(`   - Composer 面板: ${panel ? '✅' : '❌'}`);
    console.log(`   - 文件项数量: ${fileItems.length}`);
}

// 运行快速测试
quickTest();
```

---

## 📚 相关文档

- [Composer 组件文档](../components/Composer/README.md)
- [API 文档](./api.md)
- [E2E 测试指南](./e2e-guide.md)
