## 扩展卡片类型测试指南

**✅ Phase E 完成！**
- 已实现 4 种扩展卡片类型
- 所有卡片已注册到 MessageCardRegistry
- 编译通过，零错误

---

### 🚀 快速测试

#### 1. FileChangeCard - 文件变更卡片

```javascript
window.__chatStore?.getState()?.addMessage({
  id:'test-file-change-'+Date.now(),
  role:'assistant',
  content:'',
  cardType:'file-change',
  data:{
    path:'src/components/LoginForm.tsx',
    change:{
      type:'create',
      additions:156,
      deletions:0,
      summary:'创建基于 React Hook Form 的登录表单组件'
    },
    language:'typescript'
  }
})
```

**预期效果**：
- 顶部标签：📄 文件变更 + 新建（绿色）
- 文件路径：src/components/LoginForm.tsx
- 语言标签：typescript
- 变更统计：+156
- 变更摘要

---

#### 2. ToolCallCard - 工具调用卡片（成功状态）

```javascript
window.__chatStore?.getState()?.addMessage({
  id:'test-tool-call-'+Date.now(),
  role:'assistant',
  content:'',
  cardType:'tool-call',
  data:{
    name:'execute_sql_query',
    description:'执行 SQL 查询获取用户列表',
    status:'success',
    args:{
      query:'SELECT * FROM users LIMIT 10'
    },
    result:{
      rows:10,
      data:[
        {id:1,name:'Alice',email:'alice@example.com'},
        {id:2,name:'Bob',email:'bob@example.com'}
      ]
    },
    duration:245
  }
})
```

**预期效果**：
- 顶部标签：🔧 工具调用 + 成功（绿色）
- 工具名称：execute_sql_query
- 描述：执行 SQL 查询获取用户列表
- 执行时长：245ms
- 可展开查看参数和结果

---

#### 3. ErrorFixCard - 错误修复卡片

```javascript
window.__chatStore?.getState()?.addMessage({
  id:'test-error-fix-'+Date.now(),
  role:'assistant',
  content:'',
  cardType:'error-fix',
  data:{
    message:"Type 'string' is not assignable to type 'number'",
    severity:'error',
    location:'src/components/LoginForm.tsx:42:5',
    suggestions:[
      {
        title:'将 userId 转换为 number',
        description:'使用 parseInt() 或 Number() 将字符串转换为数字',
        code:'const userId = parseInt(props.userId, 10);'
      },
      {
        title:'修改类型定义',
        description:'将 userId 的类型从 number 改为 string'
      }
    ]
  }
})
```

**预期效果**：
- 顶部标签：⚠️ 错误（红色）
- 错误消息：Type 'string' is not assignable...
- 错误位置：src/components/LoginForm.tsx:42:5
- 修复建议（可展开）
  - 将 userId 转换为 number
  - 修改类型定义

---

#### 4. ComposerCard - Composer 卡片

```javascript
window.__chatStore?.getState()?.addMessage({
  id:'test-composer-'+Date.now(),
  role:'assistant',
  content:'',
  cardType:'composer',
  data:{
    title:'重构登录模块',
    status:'reviewing',
    files:[
      {path:'src/components/LoginForm.tsx',additions:156,deletions:42},
      {path:'src/schema/loginSchema.ts',additions:28,deletions:0},
      {path:'src/types/auth.ts',additions:12,deletions:8}
    ],
    stats:{
      totalAdditions:196,
      totalDeletions:50,
      filesChanged:3
    },
    actions:[
      {label:'查看详情',action:'view-details'},
      {label:'应用变更',action:'apply'},
      {label:'取消',action:'cancel'}
    ]
  }
})
```

**预期效果**：
- 顶部标签：📝 Composer + 审查中（蓝色）
- 标题：重构登录模块
- 总统计：文件变更:3, 新增:+196, 删除:-50
- 文件列表（3 个文件）
- 操作按钮：查看详情 / 应用变更 / 取消

---

### 完整测试函数

```javascript
function testAllExtendedCards() {
  const chatStore = window.__chatStore?.getState?.();
  if (!chatStore) {
    console.error('❌ 找不到 chatStore');
    return;
  }

  // 1. FileChangeCard (create)
  chatStore.addMessage({
    id:'test-file-create-'+Date.now(),
    role:'assistant',
    content:'',
    cardType:'file-change',
    data:{
      path:'src/components/LoginForm.tsx',
      change:{type:'create',additions:156,deletions:0,summary:'创建登录表单'},
      language:'typescript'
    }
  });

  // 2. FileChangeCard (modify)
  chatStore.addMessage({
    id:'test-file-modify-'+Date.now(),
    role:'assistant',
    content:'',
    cardType:'file-change',
    data:{
      path:'src/components/UserList.tsx',
      change:{type:'modify',additions:42,deletions:18,summary:'添加虚拟滚动'},
      language:'typescript'
    }
  });

  // 3. ToolCallCard (success)
  chatStore.addMessage({
    id:'test-tool-success-'+Date.now(),
    role:'assistant',
    content:'',
    cardType:'tool-call',
    data:{
      name:'execute_sql_query',
      description:'执行 SQL 查询获取用户列表',
      status:'success',
      args:{query:'SELECT * FROM users LIMIT 10'},
      result:{rows:10,data:[{id:1,name:'Alice'}]},
      duration:245
    }
  });

  // 4. ToolCallCard (running)
  chatStore.addMessage({
    id:'test-tool-running-'+Date.now(),
    role:'assistant',
    content:'',
    cardType:'tool-call',
    data:{
      name:'search_files',
      description:'搜索包含 "useState" 的所有文件',
      status:'running',
      args:{pattern:'useState',path:'./src'}
    }
  });

  // 5. ErrorFixCard (error)
  chatStore.addMessage({
    id:'test-error-'+Date.now(),
    role:'assistant',
    content:'',
    cardType:'error-fix',
    data:{
      message:"Type 'string' is not assignable to type 'number'",
      severity:'error',
      location:'src/components/LoginForm.tsx:42:5',
      suggestions:[
        {title:'转换为 number',description:'使用 parseInt()'},
        {title:'修改类型',description:'改为 string'}
      ]
    }
  });

  // 6. ErrorFixCard (warning with auto-fix)
  chatStore.addMessage({
    id:'test-warning-'+Date.now(),
    role:'assistant',
    content:'',
    cardType:'error-fix',
    data:{
      message:'Warning: componentWillMount is deprecated',
      severity:'warning',
      location:'src/components/LoginForm.tsx:28:10',
      suggestions:[
        {title:'迁移到 componentDidMount',description:'将初始化逻辑移到 componentDidMount'}
      ],
      autoFixed:true
    }
  });

  // 7. ComposerCard (reviewing)
  chatStore.addMessage({
    id:'test-composer-'+Date.now(),
    role:'assistant',
    content:'',
    cardType:'composer',
    data:{
      title:'重构登录模块',
      status:'reviewing',
      files:[
        {path:'src/components/LoginForm.tsx',additions:156,deletions:42}
      ],
      stats:{totalAdditions:196,totalDeletions:50,filesChanged:3},
      actions:[
        {label:'查看详情',action:'view-details'},
        {label:'应用变更',action:'apply'}
      ]
    }
  });

  console.log('✅ 已添加 7 条扩展卡片测试消息！');
  console.log('📊 FileChange(x2) + ToolCall(x2) + ErrorFix(x2) + Composer');
}

// 执行测试
testAllExtendedCards();
```

---

### 所有卡片类型完整测试（Phase A-E）

```javascript
function testAllCards() {
  const chatStore = window.__chatStore?.getState?.();
  if (!chatStore) {
    console.error('❌ 找不到 chatStore');
    return;
  }

  // Phase B: ProgressCard
  chatStore.addMessage({
    id:'test-prog-'+Date.now(),
    role:'assistant',
    content:'',
    cardType:'progress',
    data:{title:'探索项目代码库结构',agentId:'explore',progress:{currentStep:4,totalSteps:8,percentage:50}}
  });

  // Phase C.2: ApprovalCard
  chatStore.addMessage({
    id:'test-approval-'+Date.now(),
    role:'assistant',
    content:'',
    cardType:'approval',
    data:{
      title:'确认 Schema 变更',
      description:'重构Agent 建议将手动状态管理替换为 React Hook Form。',
      overallRisk:'medium',
      files:[{path:'src/components/LoginForm.tsx',change:'+42 -18',risk:'medium'}],
      onApprove:'continue',
      onReject:'stop'
    }
  });

  // Phase C.3: InteractionCard (single)
  chatStore.addMessage({
    id:'test-interaction-'+Date.now(),
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

  // Phase E.2: FileChangeCard
  chatStore.addMessage({
    id:'test-file-'+Date.now(),
    role:'assistant',
    content:'',
    cardType:'file-change',
    data:{
      path:'src/components/LoginForm.tsx',
      change:{type:'create',additions:156,deletions:0,summary:'创建登录表单'},
      language:'typescript'
    }
  });

  // Phase E.3: ToolCallCard
  chatStore.addMessage({
    id:'test-tool-'+Date.now(),
    role:'assistant',
    content:'',
    cardType:'tool-call',
    data:{
      name:'execute_sql_query',
      description:'执行 SQL 查询获取用户列表',
      status:'success',
      args:{query:'SELECT * FROM users LIMIT 10'},
      result:{rows:10},
      duration:245
    }
  });

  // Phase E.4: ErrorFixCard
  chatStore.addMessage({
    id:'test-error-'+Date.now(),
    role:'assistant',
    content:'',
    cardType:'error-fix',
    data:{
      message:"Type 'string' is not assignable to type 'number'",
      severity:'error',
      location:'src/components/LoginForm.tsx:42:5',
      suggestions:[
        {title:'转换为 number',description:'使用 parseInt()'}
      ]
    }
  });

  // Phase E.5: ComposerCard
  chatStore.addMessage({
    id:'test-composer-'+Date.now(),
    role:'assistant',
    content:'',
    cardType:'composer',
    data:{
      title:'重构登录模块',
      status:'reviewing',
      files:[{path:'src/components/LoginForm.tsx',additions:156,deletions:42}],
      stats:{totalAdditions:196,totalDeletions:50,filesChanged:3}
    }
  });

  console.log('✅ 已添加 7 条测试消息！');
  console.log('📊 完整的 Phase A-E 卡片类型测试');
}

// 执行测试
testAllCards();
```

---

### 卡片类型总结

**Phase B**:
- ✅ ProgressCard - 进度卡片

**Phase C**:
- ✅ ApprovalCard - 审批卡片
- ✅ InteractionCard - 交互卡片

**Phase E**:
- ✅ FileChangeCard - 文件变更卡片
- ✅ ToolCallCard - 工具调用卡片
- ✅ ErrorFixCard - 错误修复卡片
- ✅ ComposerCard - Composer 卡片

**总计：7 种消息卡片类型**

---

### 交互功能测试

#### ToolCallCard
- 点击卡片展开/收起
- 查看参数和结果

#### ErrorFixCard
- 点击建议展开/收起
- 查看代码示例

#### ComposerCard
- 点击操作按钮触发 onAction 回调

---

### 常见问题

**Q: 卡片显示不正常？**
- A: 检查控制台是否有错误
- A: 刷新页面重新测试

**Q: 如何清除测试消息？**
- A: 刷新页面
- A: 或使用 `window.__chatStore.getState().setState({ messages: [] })`
