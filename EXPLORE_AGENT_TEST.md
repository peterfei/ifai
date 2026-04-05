# Explore Agent 测试指南

## 📋 测试目标

验证 Explore Agent 在社区版中正常工作，能够执行只读代码探索任务。

## ✅ 前置条件

- [x] 移除 agent_system commercial 限制
- [x] 移除 agent_commands commercial 限制
- [x] 本地实现文件操作工具
- [x] 编译通过（cargo check）

## 🧪 测试步骤

### 1. 启动应用

```bash
# 方式 1: 开发模式
npm run tauri dev

# 方式 2: 构建后运行
npm run tauri build
open target/release/bundle/macos/IfAI.app
```

### 2. 测试 Explore Agent

#### 测试用例 1: 简单项目探索

**任务**: 探索当前项目的文件结构

**步骤**:
1. 打开应用
2. 在聊天框输入：`探索项目结构，重点关注 src 目录`
3. 观察 Agent 执行过程
4. 验证结果

**预期结果**:
- ✅ Agent 成功启动
- ✅ 调用 `agent_scan_project` 工具
- ✅ 返回项目结构概览
- ✅ 列出关键文件和目录

#### 测试用例 2: 搜索特定功能

**任务**: 查找工具系统相关代码

**步骤**:
1. 输入：`查找工具浏览器（ToolExplorer）相关的所有文件`
2. 观察 Agent 执行过程
3. 验证结果

**预期结果**:
- ✅ Agent 使用 grep 搜索 "ToolExplorer"
- ✅ 使用 glob 查找相关文件
- ✅ 列出找到的文件路径
- ✅ 提供简要说明

#### 测试用例 3: 只读约束验证

**任务**: 尝试修改文件（应该被拒绝）

**步骤**:
1. 输入：`创建一个新文件 test.txt`
2. 观察 Agent 响应

**预期结果**:
- ✅ Agent 拒绝执行
- ✅ 提示这是只读模式
- ✅ 不调用写入工具

## 🔍 日志检查

### 前端日志

在浏览器开发者工具中查看：

```javascript
// 检查 agent 状态
window.__agentStore.getState().runningAgents

// 检查 agent 事件
window.__agentStore.getState().listeners
```

### 后端日志

在终端中查看 Rust 日志：

```
[AgentCommands] 🔥 launch_agent ENTRY
[AgentRunner] Starting task for: explore
[AgentTools] Executing tool: agent_scan_project
```

## ⚠️ 常见问题

### 问题 1: Agent 启动失败

**症状**: 前端显示 "Launch failed"

**可能原因**:
1. AI Provider 配置错误
2. 项目根路径未设置
3. commercial 特定依赖未移除

**解决方案**:
1. 检查 Settings -> AI Provider 配置
2. 确保已打开项目文件夹
3. 查看终端日志获取详细错误

### 问题 2: 工具调用失败

**症状**: Agent 启动但工具调用报错

**可能原因**:
1. 工具未正确注册
2. 文件路径权限问题
3. 工具参数格式错误

**解决方案**:
1. 检查 lib.rs 中工具注册
2. 确保项目路径可读
3. 查看 agent_tools.rs 日志

## ✅ 测试检查清单

- [ ] Agent 成功启动
- [ ] `agent_scan_project` 工具调用成功
- [ ] `agent_batch_read` 工具调用成功
- [ ] `grep` 搜索功能正常
- [ ] `glob` 文件查找正常
- [ ] 只读约束生效（拒绝写入操作）
- [ ] 结果返回正确
- [ ] UI 显示正常（GlobalAgentMonitor）

## 📊 预期工具调用

Explore Agent 应该调用以下工具：

1. **agent_scan_project** - 项目概览扫描
2. **agent_batch_read** - 批量读取文件
3. **grep** - 搜索文件内容
4. **glob** - 文件名模式匹配
5. **read** - 单文件读取
6. **bash** - Shell 命令（只读，如 ls, git status）

**不应该调用**:
- ~~agent_write_file~~ - 写入文件
- ~~agent_delete_file~~ - 删除文件

## 🎯 成功标准

Explore Agent 测试通过的标准：

1. ✅ 无编译错误
2. ✅ Agent 可在社区版启动
3. ✅ 只读工具调用成功
4. ✅ 返回正确的探索结果
5. ✅ UI 正常显示 Agent 状态
6. ✅ 只读约束生效

## 📝 测试记录

### 测试日期: 2026-04-05

#### 测试环境
- **版本**: v0.3.12
- **Edition**: Community
- **Commit**: e48aefe

#### 测试结果
- [ ] 编译测试: ✅ 通过
- [ ] 启动测试: ⏳ 待测试
- [ ] 功能测试: ⏳ 待测试

#### 备注
- 已移除 commercial 限制
- Explore Agent 提示词版本: v2.2.0
- 工具集: glob, grep, read, bash, agent_batch_read, agent_scan_project

---

**下一步**: 执行上述测试步骤并记录结果
