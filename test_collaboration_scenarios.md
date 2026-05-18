# Agent 协作功能测试场景

本文档提供了用于测试 v0.5.2 Agent 协作功能的自然语言输入示例。

## 快速开始

1. 启动 ifai CLI：`ifai`
2. 依次测试以下场景
3. 观察 Agent 是否正确使用协作工具

---

## 场景 1：并行协作（Parallel）

### 输入
```
请帮我审查 src-tauri/src/agent_system/ 目录的代码，并同时生成测试用例
```

### 预期行为
- ReAct Agent 使用 `call_agent_parallel` 工具
- 同时调用 review_agent 和 test_agent
- 使用 `aggregate_results` 合并两个 Agent 的结果

### 验证点
✓ 看到并行调用两个 Agent 的日志
✓ 收到合并后的审查和测试结果

---

## 场景 2：知识链协作（KnowledgeChain）

### 输入
```
请执行以下协作任务：
1. 探索 src-tauri/src/harness/tool/ 目录的代码结构
2. 将探索结果传递给 review_agent 进行代码审查
3. 根据审查结果重构代码
4. 最后生成测试用例
```

### 预期行为
- ReAct Agent 依次调用各个 Agent
- 使用 `share_knowledge` 在 Agent 间传递中间结果
- 每个后续 Agent 能够使用前一个 Agent 的知识

### 验证点
✓ 看到知识共享的日志输出
✓ 每个 Agent 的结果包含前一个 Agent 的发现

---

## 场景 3：菱形协作（Diamond）

### 输入
```
请分别审查前端（src/）和后端（src-tauri/src/）代码，然后汇总他们的改进建议
```

### 预期行为
- ReAct Agent 并行调用两个审查任务
- 使用 `aggregate_results` 的 merge 或 vote 策略汇总结果

### 验证点
✓ 并行执行两个审查任务
✓ 收到汇总的建议列表

---

## 场景 4：进度监控

### 输入
```
启动一个完整的代码改进工作流，包括探索、审查、重构、测试、文档，并实时报告进度
```

### 预期行为
- ReAct Agent 使用 `monitor_progress` 订阅工作流进度
- 定期报告当前状态和完成情况

### 验证点
✓ 看到进度更新的日志
✓ 收到工作流状态的报告

---

## 场景 5：复杂多阶段协作

### 输入
```
我想对 src-tauri/src/agent_system/workflow/ 模块进行全面改进：

1. 先并行探索代码结构和分析复杂度
2. 将结果传递给审查团队（同时进行代码审查和安全审查）
3. 根据审查结果决定是重构还是只是改进文档
4. 最后生成测试用例

请在每个阶段完成后向我报告进度
```

### 预期行为
- 组合使用多种协作模式
- 多次使用 `share_knowledge` 传递信息
- 使用 `monitor_progress` 报告状态
- 使用 `aggregate_results` 汇总审查意见

### 验证点
✓ 看到完整的协作流程
✓ 每个阶段都有进度报告
✓ 最终结果包含所有 Agent 的输出

---

## 场景 6：结果聚合策略测试

### 输入
```
请让三个 Agent 分别审查同一个文件并提出改进建议，然后用 vote 策略选择最普遍的建议
```

### 预期行为
- 并行调用多个 review_agent
- 使用 `aggregate_results` 的 vote 策略

### 验证点
✓ 看到多个审查结果
✓ 最终结果是投票选择的建议

---

## 场景 7：条件协作

### 输入
```
探索 src-tauri/src/agent_system/ 目录，如果代码复杂度超过 10，则进行深度审查；否则只生成文档
```

### 预期行为
- 先执行探索和复杂度分析
- 根据结果决定后续协作路径

### 验证点
✓ 看到条件判断的日志
✓ 执行路径符合预期条件

---

## 调试提示

如果协作功能没有按预期工作，可以：

1. **检查工具可用性**
   ```
   列出所有可用的工具
   ```

2. **查看 ReAct Agent 日志**
   - 查找 "call_agent_parallel" 关键字
   - 查找 "share_knowledge" 关键字
   - 查找 "aggregate_results" 关键字
   - 查找 "monitor_progress" 关键字

3. **明确指定工具使用**
   ```
   请使用 call_agent_parallel 工具同时调用 review_agent 和 test_agent
   ```

4. **检查工具权限**
   - 确认 tool_approval_config.json 包含协作工具
   - 确认工具配置为 "safe" 类型

---

## 预期输出格式

### 成功的并行调用示例
```
Action: call_agent_parallel
Agents: [review_agent, test_agent]
Observation: 并行调用完成，收到 2 个结果
```

### 成功的知识共享示例
```
Action: share_knowledge
From: explore_agent
To: review_agent
Knowledge: 发现 15 个文件，包含 3 个主要模块
Observation: 知识已共享
```

### 成功的结果聚合示例
```
Action: aggregate_results
Results: [结果1, 结果2, 结果3]
Strategy: merge
Observation: 已合并所有结果
```

---

## 测试检查清单

使用此清单验证所有协作功能：

- [ ] 场景 1：Parallel 并行协作
- [ ] 场景 2：KnowledgeChain 知识链
- [ ] 场景 3：Diamond 菱形协作
- [ ] 场景 4：进度监控
- [ ] 场景 5：复杂多阶段协作
- [ ] 场景 6：结果聚合策略
- [ ] 场景 7：条件协作

所有场景通过后，协作系统测试完成！✅
