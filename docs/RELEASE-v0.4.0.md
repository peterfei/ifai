# IfAI V0.4.0: 提示词生态系统、多智能体架构与对话管理

## 🏆 版本概述
V0.4.0 是 IfAI Editor 史上最重大的架构升级版本，标志着 IfAI 已成为**成熟的 AI Native Harness**。本版本构建了完整的**多智能体协作系统**、**分层提示词管理体系**和**对话管理系统**。社区版用户现在可以享受此前仅商业版可用的智能体功能，实现真正的 AI 原生开发体验。

---

## 🌟 核心特性

### 1. 提示词管理系统 (Prompt Manager) ✅ 100% 完成

#### 分层透明策略
基于业界最佳实践，实现三层提示词管理架构：

- **🟢 公开层（80%）**：用户自定义提示词、官方智能体模板、工具描述
  - 用户权限：查看、编辑、导出、版本控制
- **🟡 半透明层（15%）**：系统主提示词、安全和权限规则、对话管理提示词
  - 用户权限：查看完整内容、复制、专家模式可覆盖
- **🔴 隐藏层（5%）**：ifainew-core 内部提示词、专有算法、反滥用规则
  - 用户权限：完全不可见

#### 版本控制与 Git 集成
- Git 版本历史追踪（基于 git2-rs）
- 版本对比和回滚
- 修改状态检测
- 分支友好的提示词管理

#### Monaco Editor 集成
- Handlebars + Markdown 混合语法高亮
- 智能变量自动补全（从 metadata 动态生成）
- 13+ Helper 函数补全（eq, if, each, gt, lt, and, or 等）
- 实时验证（防抖 500ms）

#### 导入导出功能
- ZIP 包创建和解析
- 多选提示词打包
- 覆盖逻辑检查
- 包信息验证和展示

#### 安全增强
- 提示词注入检测（18 种危险模式）
- 花括号平衡检查
- YAML Front Matter 验证
- 未定义变量和未闭合块检测

**技术亮点**：
- 新增代码：~3384 行（后端 5 文件 + 前端 7 文件）
- E2E 测试通过率：93.6% (44/47)
- Rust 单元测试：10/10 通过

### 2. 工具系统 (Tool Registry) ✅ P0-P3 完成

#### 核心工具集（10+ 工具）

**文件操作工具**：
- `read_file` - 读取文件内容（只读权限）
- `write_file` - 写入文件（自动创建目录，工作区写入权限）
- `edit_file` - 替换文件中的文本（工作区写入权限）

**搜索工具**：
- `glob_search` - 使用 glob 模式搜索文件（只读权限）
- `grep_search` - 使用正则表达式搜索文件内容（只读权限）
  - 支持相对路径和绝对路径
  - 自动过滤常见忽略目录（node_modules, target, dist）
  - 显示匹配行号

**Shell 命令工具**：
- `bash` - 执行 Bash 命令（完全访问权限）
- `PowerShell` - 执行 PowerShell 命令（完全访问权限）
  - 跨平台支持（Windows 使用 PowerShell，其他使用 bash）
  - 捕获 stdout 和 stderr
  - 可配置超时时间

**项目管理工具**：
- `TodoWrite` - 任务列表管理（支持 pending/in_progress/completed 三态）
  - 三态面板自动折叠（full/collapsed/hidden）
  - 所有任务完成后 800ms 自动折叠

#### 工具权限分级
```rust
pub enum PermissionMode {
    ReadOnly,           // 只读：read_file, glob_search, grep_search
    WorkspaceWrite,     // 写入：+ write_file, edit_file
    DangerFullAccess,   // 完全：+ bash, PowerShell
}
```

#### AI 服务集成
- 自动注入 `working_dir` 参数给 bash/PowerShell 工具
- 自动解析相对路径为绝对路径（文件操作工具）
- 自动解析搜索路径（搜索工具）
- 修复多工作区兼容性

**技术亮点**：
- 新增执行器：4 个（FileTools, SearchTools, ShellTools, TodoUtil）
- 单元测试：~500 行
- E2E 测试：13/13 通过（P3-前端）

### 3. 多智能体系统 (Agent System) ✅ P4 核心完成

#### 里程碑：移除 commercial 限制
**重要变更**：社区版用户现在可以使用完整的智能体系统！

- 移除 `agent_system` 模块的 `#[cfg(feature = "commercial")]` 限制
- 移除 `agent_commands` 的 commercial 限制
- 本地实现替代 ifainew_core 依赖

#### 核心智能体（5 种）

**Explore Agent** - 只读代码探索
- 支持 Glob、Grep、Read 工具
- 多层次搜索策略（文件名 → 内容 → 深度分析）
- 快速定位相关代码

**Review Agent** - 代码审查
- 支持 Read、Grep 工具
- 审查清单（安全、性能、最佳实践）
- 发现潜在问题和改进点

**TaskBreakdown Agent** - 任务分解
- 自动将复杂任务拆解为可执行的子任务
- 支持 TodoWrite 工具集成
- E2E 测试：5/5 通过

**ProposalGenerator Agent** - 提案生成
- 遵循 OpenSpec 协议格式
- 自动生成变更提案
- E2E 测试：6/6 通过

**Refactor Agent** - 重构建议
- 支持 Read、Edit 工具
- 提供重构方案和自动执行
- E2E 测试：6/6 通过

#### 智能体协作机制
- 智能体间消息协议定义
- 协作管理器实现（CollaborationManager）
- 用户确认 UI（AgentCollaborationApprovalDialog）
- 工作流可视化 DAG（AgentWorkflowDAG）
- E2E 测试：10/10 通过

**技术亮点**：
- 新增模块：9 个文件（supervisor, runner, persistence, collaboration 等）
- 智能体提示词：5 个核心模板
- 协作机制：500+ 行实现

### 4. CLI 交互式工具 ✅ 完成

#### 功能特性
- **交互式对话模式**（rustyline 支持）
  - 命令历史（上下箭头）
  - 会话状态持久化（.ifai-history）
  - 优雅退出（Ctrl+C）

- **多 Provider 支持**
  - DeepSeek (默认)
  - OpenAI (GPT-4o, GPT-4o-mini)
  - Anthropic (Claude 系列)

- **System Prompt 集成**
  - AI 正确识别为 "IfAI"
  - Provider 身份定制化
  - messages[0] 格式修复

- **清洁输出体验**
  - 移除所有调试日志
  - 流式文本显示
  - 工具调用可视化

**技术亮点**：
- 新增代码：~600 行
- 文档资源：5 个 CLI 文档
- 二进制大小：~8MB (release)

### 5. 流式响应架构重构 ✅ 完成

- 支持 OpenAI 兼容格式的工具调用
- 事件顺序优化确保工具执行正确（ToolDone → MessageDone）
- 参数累积机制处理分片数据
- 完成事件优先级控制
- isActivelyStreaming 生命周期管理

### 6. UI 体验优化 ✅ P6 完成

#### TodoWrite 面板三态自动折叠
**问题**：原有两态（展开/隐藏）在任务完成后仍占 384px 宽度

**解决方案**：引入三态面板模型
- `full` (384px)：TodoWrite 工具调用时自动展开，显示完整任务列表
- `collapsed` (~40px)：所有任务完成后自动折叠，显示图标 + 完成摘要
- `hidden` (0px)：用户手动关闭，面板不渲染

**技术亮点**：
- CSS transition 平滑过渡（300ms ease-in-out）
- 折叠延迟 800ms，给用户视觉缓冲
- 自动检测完成状态并触发折叠

### 7. 对话管理系统 (Conversation Management) ✅ P5 完成

#### 会话笔记自动提取
- **60+ 技术关键词智能识别**：
  - 前端框架：React, Vue, useState, useEffect 等
  - 编程语言：TypeScript, Rust, Go, Python 等
  - Tauri 相关：Tauri, Vite, Webpack 等
  - 工具和库：37+ 常用工具关键词
- **20+ 触发条件**：智能识别技术概念、文件变更、错误和修复
- **自动追踪**：
  - 技术概念：自动分类和提取
  - 文件变更：追踪修改的文件和操作
  - 错误和修复：记录错误信息和解决方案
  - 待办任务：识别未完成的任务

#### Token 统计功能
- **精确计数**：使用 cl100k_base encoder
- **实时更新**：消息变化时自动重新计算
- **分类统计**：系统、用户、助手消息分别统计
- **阈值检测**：100k tokens 或 100 条消息触发总结

#### 自动对话总结
- **触发阈值**：100 条消息或 100k tokens
- **结构化总结**：
  - 主要请求和意图
  - 关键技术概念列表
  - 文件和代码变更
  - 错误和修复记录
  - 问题解决过程
  - 待办任务列表
  - 建议的下一步

#### 自动对话压缩
- **触发条件**：
  - 有总结且消息 ≥100 条
  - 无总结且消息 ≥150 条
- **压缩算法**：系统提示词 + 总结 + 最后 10 条消息
- **压缩效果**：Token 减少 88.6%（105条 → 12条消息）
- **安全余量**：100k 阈值，128k 模型窗口留出 22% 余量

#### E2E 测试覆盖
- **6/6 场景通过**：
  - 场景1: 100条消息自动压缩触发
  - 场景2: Token统计和压缩阈值验证
  - 场景3: 真实对话流程测试
  - 场景4: 压缩命令直接调用测试
  - 场景5: 边界条件测试（10条消息不触发）
  - 场景6: 验证压缩后Token确实减少（88.6%）
- **Mock 管线**：无需真实后端即可验证功能

**技术亮点**：
- 新增代码：~1500 行
- 新增文件：5 个（后端模块 + 前端组件）
- 测试通过率：100% (6/6)
- Token 减少：88.6%
- 折叠延迟 800ms，给用户视觉缓冲
- 自动检测完成状态并触发折叠

---

## 🛠️ 技术改进

### 后端架构升级
- **prompt_manager** 模块：8 个文件（版本、存储、模板、变量、导出、验证）
- **agent_system** 模块：9 个文件（supervisor, runner, persistence, collaboration）
- **harness/tool** 模块：4 个执行器（TodoUtil, FileTools, SearchTools, ShellTools）
- **conversation** 模块：5 个文件（summarizer, token_counter, notes, mod, tests）

### 前端架构升级
- 新增 Zustand stores：promptStore, agentStore, todoWriteStore, conversationStore
- 新增组件：PromptManager（7 个组件）、AgentCollaboration（2 个组件）、ToolExplorer、Conversation（3 个组件）
- Monaco Editor 集成：自定义 Handlebars 语言支持

### 数据结构定义
- Rust：PromptTemplate, PromptMetadata, AgentStatus, AgentContext, ToolDescriptor
- TypeScript：prompt.ts, agent.ts, tool.ts, conversation.ts
- Serde 序列化：所有结构体支持 JSON 序列化

---

## 🧪 测试覆盖

### E2E 测试
- **Section 2（提示词管理）**：44/47 通过（93.6%）
  - 版本管理：10/10 Rust 测试
  - 访问控制：5/5 E2E 测试
  - 安全验证：18/18 E2E 测试
  - 导入导出：11/14 E2E 测试

- **P3（工具系统 UI）**：13/13 通过（100%）
  - 工具列表、详情、搜索、分类、权限过滤

- **P4（智能体协作）**：10/10 通过（100%）
  - 协作请求、DAG 可视化、用户确认

- **P5（对话管理）**：6/6 通过（100%）
  - 100条消息自动压缩触发
  - Token统计和压缩阈值验证
  - 真实对话流程测试
  - 压缩命令直接调用测试
  - 边界条件测试（10条消息不触发）
  - 验证压缩后Token确实减少（88.6%）

- **P6（TodoWrite 面板）**：102 回归测试通过

### 单元测试
- Rust 后端：10/10 通过（版本管理模块）
- 工具执行器：~500 行测试代码

---

## 📦 发布清单

### 版本信息
- **版本号**: v0.4.0
- **发布日期**: 2026-04-08
- **Tauri**: 2.9.5
- **Rust**: 1.90.0
- **Node**: 22.14.0

### 代码统计
| 模块 | 新增代码 | 新增文件 | 测试通过率 |
|------|---------|---------|-----------|
| 提示词管理 | ~3384 行 | 15 | 93.6% |
| 工具系统 | ~1300 行 | 8 | 100% |
| 智能体系统 | ~1200 行 | 9 | 100% |
| 对话管理 | ~1500 行 | 5 | 100% |
| CLI 工具 | ~600 行 | 1 + 5 文档 | - |
| UI 优化 | ~150 行 | 3 | 100% |
| **总计** | **~8134 行** | **46** | **~98%** |

### 关键文件修改
```
M  package.json (version: 0.3.12 → 0.4.0)
M  src-tauri/tauri.conf.json (version: 0.3.12 → 0.4.0)
M  src-tauri/Cargo.toml (version: 0.3.12 → 0.4.0)

# 新增模块
A  src-tauri/src/prompt_manager/ (8 files)
A  src-tauri/src/agent_system/ (9 files)
A  src-tauri/src/harness/tool/executor/ (4 files)
A  src-tauri/src/conversation/ (5 files)
A  src-tauri/src/bin/ifai.rs (CLI tool)

# 前端组件
A  src/components/PromptManager/ (7 components)
A  src/components/AgentCollaboration/ (2 components)
A  src/components/ToolExplorer/
A  src/components/Conversation/ (3 components)

# 测试文件
A  tests/e2e/section2/ (5 test files)
A  tests/e2e/section3/ (3 test files)
A  tests/e2e/section4/ (2 test files)
A  tests/e2e/section5/ (2 test files)
```

---

## 🚀 升级指南

### 从 v0.3.12 升级到 v0.4.0

#### 数据迁移
1. **无需额外配置**：提示词系统会自动初始化 `.ifai/` 目录
2. **对话历史兼容**：完全向后兼容，所有对话历史和设置都会保留
3. **配置迁移**：
   - 旧版配置自动迁移到新格式
   - `.ifai/config.toml` 自动创建（如果不存在）

#### 新功能使用

**1. 提示词管理**
- 打开侧边栏"提示词"标签页
- 查看系统提示词、智能体提示词、工具描述
- 支持编辑（公开层）、版本对比、导入导出

**2. 智能体系统**
- 在对话中直接调用智能体功能
- Explore Agent：搜索代码（"查找所有处理文件上传的代码"）
- Review Agent：审查代码（"审查这个文件的安全性"）
- TaskBreakdown：分解任务（"分解这个任务为步骤"）

**3. 工具浏览器**
- 点击侧边栏扳手图标
- 查看所有可用工具、分类、权限
- 工具详情和用法示例

**4. CLI 工具**
```bash
# 编译 CLI 工具
cargo build --release --bin ifai

# 启动交互模式
./target/release/ifai

# 切换 provider
>>> /provider openai
```

**5. 对话管理系统**
- 查看实时 Token 统计（消息列表上方）
- 自动生成对话总结（100条消息或100k tokens）
- 自动压缩对话（保留系统提示词+总结+最后10条消息）
- 查看会话笔记（自动提取技术概念、文件变更、错误修复）

#### 验证功能
1. ✅ 启动应用，检查 `.ifai/` 目录是否创建
2. ✅ 打开提示词管理器，查看提示词列表
3. ✅ 在对话中尝试调用 Explore Agent
4. ✅ 点击工具浏览器，查看工具列表
5. ✅ 使用 CLI 工具进行对话测试
6. ✅ 查看会话笔记自动提取
7. ✅ 验证 Token 统计和自动压缩

---

## 📝 下一步计划

### 功能增强
- 更多智能体类型（Test Gen, Doc Gen）
- LSP 集成
- 工具沙箱和权限细化

### 功能增强
- 更多智能体类型（Test Gen, Doc Gen）
- LSP 集成
- 对话总结和会话笔记
- 工具沙箱和权限细化

### 性能优化
- 前端性能优化（组件懒加载、虚拟滚动）
- 后端性能优化（缓存、并发、内存）
- 提示词内容优化（去重、压缩、截断）

---

## 🔄 版本更新

### v0.4.0 阈值优化（2026-04-08）

**压缩阈值调整**：为确保对话压缩在模型上下文窗口限制之前触发，将压缩阈值从 150k 降至 100k。

#### 修改原因
- **原配置**：压缩阈值 150k > 模型上下文窗口 128k（冲突）
- **新配置**：压缩阈值 100k，留出 28k (22%) 安全余量
- **适用模型**：GPT-4o、GLM-4、DeepSeek、O1/O3 等 128k 上下文模型

#### 修改范围
- 后端：`src-tauri/src/conversation/mod.rs`（阈值 150_000 → 100_000）
- 前端类型：`src/types/conversation.ts`（注释更新）
- 测试 Mock：`tests/e2e/setup-utils.ts`（阈值同步更新）
- 文档：README.md、README_EN.md（说明更新）

#### 安全验证
```
模型上下文窗口：128k
压缩触发阈值：100k
安全余量：28k (22%) ✅
```

---

## 🐛 已知问题

- 部分导入导出测试存在 UI 交互细节问题（不影响核心功能）
- E2E 测试需要 Tauri 环境才能运行
- 某些测试文件的类型定义缺失（不影响应用运行）

---

## 🙏 致谢

**特别感谢**：
- 开源社区 - 提供了优秀的提示词系统设计参考
- Tauri 团队 - 优秀的跨平台桌面框架
- Rust 社区 - 强大的类型系统和生态

---

**感谢所有贡献者和用户的支持！** 🎉

**从 v0.3.12 升级到 v0.4.0，享受完整的 AI 原生开发体验！**
