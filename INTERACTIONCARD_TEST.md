## InteractionCard 测试指南

**✅ Phase C.3 完成！**
- MessageCardRegistry 已集成到 AIChat
- ProgressCard 已实现并测试通过
- ApprovalCard 已实现并测试通过
- InteractionCard 已实现并测试通过

---

### 🚀 快速测试

#### 1. InteractionCard - 单选模式

```javascript
window.__chatStore?.getState()?.addMessage({
  id:'test-'+Date.now(),
  role:'assistant',
  content:'',
  cardType:'interaction',
  data:{
    type:'single',
    title:'选择迁移策略',
    question:'请选择您偏好的登录模块迁移策略：',
    compactAsk:'正在征求您的意见...',
    options:[
      {id:'full',label:'全面重构',desc:'重新实现整个登录模块，代码更整洁',tag:'推荐',tagColor:'brand'},
      {id:'incr',label:'渐进式改造',desc:'保留现有接口，逐步替换内部实现',tag:'稳妥'},
      {id:'hybrid',label:'混合方案',desc:'核心逻辑重写，UI 层渐进替换',tag:'平衡',tagColor:'amber'}
    ],
    onSelect:'continue'
  }
})
```

**预期效果**：
- 顶部标签：💬 LLM 提问
- 标题：➡ 选择迁移策略
- 问题描述
- 3 个选项（Radio 圆圈 + 标签 + 描述 + tag）
- 点击任一选项 → 高亮 + 800ms 后自动确认
- 底部：请选择一个选项...

---

#### 2. InteractionCard - 多选模式

```javascript
window.__chatStore?.getState()?.addMessage({
  id:'test-'+Date.now(),
  role:'assistant',
  content:'',
  cardType:'interaction',
  data:{
    type:'multiple',
    title:'选择扫描范围',
    question:'请选择需要安全扫描的检查项（可多选）：',
    compactAsk:'请选择扫描范围...',
    options:[
      {id:'sqli',label:'SQL 注入检测',desc:'扫描数据库查询中的拼接注入风险',tag:'高危',tagColor:'red'},
      {id:'xss',label:'XSS 漏洞检测',desc:'扫描前端模板中的跨站脚本风险',tag:'高危',tagColor:'red'},
      {id:'dep',label:'依赖漏洞检查',desc:'检查第三方库的已知 CVE 漏洞',tag:'中危',tagColor:'amber'},
      {id:'secret',label:'密钥泄露检测',desc:'扫描硬编码密钥和凭据泄露风险',tag:'中危',tagColor:'amber'}
    ],
    onSelect:'continue'
  }
})
```

**预期效果**：
- 顶部标签：💬 LLM 提问
- 标题：➡ 选择扫描范围
- 问题描述
- 4 个选项（Checkbox 方框 + 标签 + 描述 + tag）
- 点击选项 → toggle 选中状态
- 确认按钮：确认选择 (N)
- 底部：请勾选选项后确认...

---

### 完整测试函数

```javascript
function testAllInteractionCards() {
  const chatStore = window.__chatStore?.getState?.();
  if (!chatStore) {
    console.error('❌ 找不到 chatStore');
    return;
  }

  // 1. 单选交互
  chatStore.addMessage({
    id:'test-interaction-single-'+Date.now(),
    role:'assistant',
    content:'',
    cardType:'interaction',
    data:{
      type:'single',
      title:'选择迁移策略',
      question:'请选择您偏好的登录模块迁移策略：',
      compactAsk:'正在征求您的意见...',
      options:[
        {id:'full',label:'全面重构',desc:'重新实现整个登录模块，代码更整洁',tag:'推荐',tagColor:'brand'},
        {id:'incr',label:'渐进式改造',desc:'保留现有接口，逐步替换内部实现',tag:'稳妥'},
        {id:'hybrid',label:'混合方案',desc:'核心逻辑重写，UI 层渐进替换',tag:'平衡',tagColor:'amber'}
      ],
      onSelect:'continue'
    }
  });

  // 2. 多选交互
  chatStore.addMessage({
    id:'test-interaction-multi-'+Date.now(),
    role:'assistant',
    content:'',
    cardType:'interaction',
    data:{
      type:'multiple',
      title:'选择扫描范围',
      question:'请选择需要安全扫描的检查项（可多选）：',
      compactAsk:'请选择扫描范围...',
      options:[
        {id:'sqli',label:'SQL 注入检测',desc:'扫描数据库查询中的拼接注入风险',tag:'高危',tagColor:'red'},
        {id:'xss',label:'XSS 漏洞检测',desc:'扫描前端模板中的跨站脚本风险',tag:'高危',tagColor:'red'},
        {id:'dep',label:'依赖漏洞检查',desc:'检查第三方库的已知 CVE 漏洞',tag:'中危',tagColor:'amber'},
        {id:'secret',label:'密钥泄露检测',desc:'扫描硬编码密钥和凭据泄露风险',tag:'中危',tagColor:'amber'}
      ],
      onSelect:'continue'
    }
  });

  console.log('✅ 已添加 2 条交互卡片测试消息！');
  console.log('📊 单选交互 + 多选交互');
}

// 执行测试
testAllInteractionCards();
```

---

### 交互测试

#### 单选模式
1. **点击任一选项**
   - Radio 圆圈填充蓝色
   - 选项高亮（蓝色边框 + 背景）
   - 800ms 后自动确认
   - 显示绿色 ✓ 标记
   - 控制台输出：`[MessageItem] Card action: select`

#### 多选模式
1. **点击选项**
   - Checkbox 方框显示蓝色 ✓
   - 选项高亮
   - 确认按钮更新计数：确认选择 (N)

2. **再次点击**
   - 取消选中
   - 确认按钮计数减少

3. **点击确认按钮**
   - 按钮变绿色 ✓ "已确认"
   - 所有选项禁用
   - 控制台输出：`[MessageItem] Card action: select`

---

### 标签颜色测试

**支持的标签颜色**：
- `brand`（蓝色）：推荐、高收益
- `emerald`（绿色）：低风险
- `amber`（黄色）：平衡、中危
- `red`（红色）：高危
- 默认（灰色）：其他

---

### 所有卡片类型完整测试

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

  // 2. ApprovalCard
  chatStore.addMessage({
    id:'test-approval-'+Date.now(),
    role:'assistant',
    content:'',
    cardType:'approval',
    data:{
      title:'确认 Schema 变更',
      description:'重构Agent 建议将手动状态管理替换为 React Hook Form + Zod 验证方案。',
      overallRisk:'medium',
      files:[{path:'src/components/LoginForm.tsx',change:'+42 -18',risk:'medium'}],
      onApprove:'continue',
      onReject:'stop'
    }
  });

  // 3. InteractionCard (single)
  chatStore.addMessage({
    id:'test-interaction-single-'+Date.now(),
    role:'assistant',
    content:'',
    cardType:'interaction',
    data:{
      type:'single',
      title:'选择迁移策略',
      question:'请选择您偏好的登录模块迁移策略：',
      compactAsk:'正在征求您的意见...',
      options:[
        {id:'full',label:'全面重构',desc:'重新实现整个登录模块',tag:'推荐',tagColor:'brand'}
      ],
      onSelect:'continue'
    }
  });

  // 4. InteractionCard (multiple)
  chatStore.addMessage({
    id:'test-interaction-multi-'+Date.now(),
    role:'assistant',
    content:'',
    cardType:'interaction',
    data:{
      type:'multiple',
      title:'选择扫描范围',
      question:'请选择需要安全扫描的检查项：',
      compactAsk:'请选择扫描范围...',
      options:[
        {id:'sqli',label:'SQL 注入检测',desc:'扫描数据库查询注入风险',tag:'高危',tagColor:'red'}
      ],
      onSelect:'continue'
    }
  });

  console.log('✅ 已添加 4 条测试消息！');
  console.log('📊 Progress + Approval + Interaction(single) + Interaction(multiple)');
}

// 执行测试
testAllCards();
```

---

### 常见问题

**Q: 单选点击后没有自动确认？**
- A: 等待 800ms 延迟，这是设计的行为（模拟网络请求）

**Q: 多选确认按钮禁用？**
- A: 需要至少选择一个选项

**Q: 如何清除测试消息？**
- A: 刷新页面或使用 `window.__chatStore.getState().setState({ messages: [] })`

---

### Phase C 完成总结

✅ **Phase C.1**: WORKFLOW_DSL 扩展
✅ **Phase C.2**: ApprovalCard 实现
✅ **Phase C.3**: InteractionCard 实现
✅ **Phase C.4**: 测试验证

**下一步**：提交代码，准备实施其他功能
