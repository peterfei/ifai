## 消息卡片测试指南

**✅ Phase C 完成！**
- MessageCardRegistry 已集成到 AIChat
- ProgressCard 已实现并测试通过
- ApprovalCard 已实现并测试通过

---

### 🚀 快速测试

#### 1. ProgressCard 测试

```javascript
window.__chatStore?.getState()?.addMessage({
  id:'test-'+Date.now(),
  role:'assistant',
  content:'',
  cardType:'progress',
  data:{
    title:'探索项目代码库结构',
    agentId:'explore',
    progress:{currentStep:4,totalSteps:8,percentage:50}
  }
})
```

**预期效果**：
- Agent 头像 (EXP) + 任务标题
- 步骤 4/8
- 进度条 ████████░░░░░░░ 50%

---

#### 2. ApprovalCard 测试（中等风险）

```javascript
window.__chatStore?.getState()?.addMessage({
  id:'test-'+Date.now(),
  role:'assistant',
  content:'',
  cardType:'approval',
  data:{
    title:'确认 Schema 变更',
    description:'重构Agent 建议将手动状态管理替换为 React Hook Form + Zod 验证方案。需修改登录表单组件及相关类型定义。',
    overallRisk:'medium',
    files:[
      {path:'src/components/LoginForm.tsx',change:'+42 -18',risk:'medium'},
      {path:'src/schema/loginSchema.ts',change:'+15 -0',risk:'low'},
      {path:'src/types/auth.ts',change:'+8 -3',risk:'low'}
    ],
    onApprove:'continue',
    onReject:'stop'
  }
})
```

**预期效果**：
- 顶部标签：🔔 需要审批 + 中风险
- 标题：📋 确认 Schema 变更
- 描述文本
- 文件列表（3 个文件，带风险标签）
- 操作按钮：确认执行 ✓ / 拒绝 ✗
- 底部：等待您的审批决定...

---

#### 3. ApprovalCard 测试（高风险）

```javascript
window.__chatStore?.getState()?.addMessage({
  id:'test-'+Date.now(),
  role:'assistant',
  content:'',
  cardType:'approval',
  data:{
    title:'确认安全漏洞修复',
    description:'分析Agent 在 PR #142 中发现 SQL 注入风险和 XSS 漏洞。建议立即修复后再合并。',
    overallRisk:'high',
    files:[
      {path:'src/api/userSearch.ts',change:'+28 -14',risk:'high'},
      {path:'src/components/UserList.tsx',change:'+15 -8',risk:'high'}
    ],
    onApprove:'continue',
    onReject:'stop'
  }
})
```

**预期效果**：
- 风险标签显示红色 "高风险"
- 文件列表显示红色风险标签
- 紧急警告提示

---

### 完整测试函数

```javascript
function testAllCards() {
  const chatStore = window.__chatStore?.getState?.();
  if (!chatStore) {
    console.error('❌ 找不到 chatStore');
    return;
  }

  // 1. ProgressCard
  chatStore.addMessage({
    id:'test-prog-'+Date.now(),
    role:'assistant',
    content:'',
    cardType:'progress',
    data:{
      title:'探索项目代码库结构',
      agentId:'explore',
      progress:{currentStep:4,totalSteps:8,percentage:50}
    }
  });

  // 2. ApprovalCard (medium risk)
  chatStore.addMessage({
    id:'test-approval-med-'+Date.now(),
    role:'assistant',
    content:'',
    cardType:'approval',
    data:{
      title:'确认 Schema 变更',
      description:'重构Agent 建议将手动状态管理替换为 React Hook Form + Zod 验证方案。需修改登录表单组件及相关类型定义。',
      overallRisk:'medium',
      files:[
        {path:'src/components/LoginForm.tsx',change:'+42 -18',risk:'medium'},
        {path:'src/schema/loginSchema.ts',change:'+15 -0',risk:'low'},
        {path:'src/types/auth.ts',change:'+8 -3',risk:'low'}
      ],
      onApprove:'continue',
      onReject:'stop'
    }
  });

  // 3. ApprovalCard (high risk)
  chatStore.addMessage({
    id:'test-approval-high-'+Date.now(),
    role:'assistant',
    content:'',
    cardType:'approval',
    data:{
      title:'确认安全漏洞修复',
      description:'分析Agent 在 PR #142 中发现 SQL 注入风险和 XSS 漏洞。建议立即修复后再合并。',
      overallRisk:'high',
      files:[
        {path:'src/api/userSearch.ts',change:'+28 -14',risk:'high'},
        {path:'src/components/UserList.tsx',change:'+15 -8',risk:'high'}
      ],
      onApprove:'continue',
      onReject:'stop'
    }
  });

  console.log('✅ 已添加 3 条测试消息！');
  console.log('📊 ProgressCard + ApprovalCard (medium) + ApprovalCard (high)');
}

// 执行测试
testAllCards();
```

---

### 交互测试

点击 ApprovalCard 的按钮：
1. **点击 "确认执行"**：按钮变为绿色 ✓ "已批准"
2. **点击 "拒绝"**：按钮变为红色 ✗ "已拒绝"
3. **控制台输出**：`[MessageItem] Card action: approve/reject`

---

### 常见问题

**Q: 控制台报错 "找不到 window.__chatStore"**
- A: 确保应用已启动（`npm run tauri:dev`）
- A: 等待应用完全加载（看到聊天界面）

**Q: 卡片显示不正常**
- A: 检查浏览器控制台是否有错误
- A: 刷新页面重新测试

**Q: 如何清除测试消息**
- A: 刷新页面
- A: 或使用 `window.__chatStore.getState().setState({ messages: [] })`

---

### 下一步

Phase C 将继续实现：
- InteractionCard（LLM 交互问答卡片）
- 更多卡片类型
