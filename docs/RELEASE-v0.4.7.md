# IfAI v0.4.7 发布说明

<div align="center">
  <h2>🧠 持久化记忆系统 — 让 AI 跨会话记住你</h2>
  <p>零依赖纯 Markdown 存储，两层记忆架构，18μs 注入延迟</p>
  <p>2026-05-10</p>
</div>

---

## 🌟 核心新特性

### 1. 持久化记忆系统（Memory System）

IfAI 首次引入**跨会话持久化记忆**，AI 能够在对话中主动记住你的偏好、项目知识和技术决策，并在新会话中自动使用这些信息。

**架构亮点**：
- **零新依赖**：纯 Markdown 文件存储，不引入 SQLite 或向量数据库
- **两层记忆**：热记忆（始终注入 system prompt）+ 冷记忆（会话摘要归档）
- **空间隐喻组织**：Wing → Hall → Room 三层路径，如 `Project/Preferences/programming-languages`
- **AI 主动保存**：`MemorySave` 工具自动执行，对话中实时保存重要信息
- **会话后批量提取**：LLM 驱动的智能提取，自动从对话中挖掘值得记忆的信息
- **自动去重**：相同内容只更新日期，不会产生重复条目
- **外部化提示词**：`~/.ifai/prompts/memory/extract.md` 可自定义提取规则
- **TUI + GUI 共享**：同一份 `~/.ifai/memories.md`，跨界面无缝使用

**性能数据**：
- 注入延迟：**18μs 平均**（20 KB 文件 < 1ms）
- 建议上限：≤ 2000 tokens
- 测试覆盖：95% 单元测试覆盖率

### 2. 会话归档（冷记忆存储）

每次 TUI 会话结束后，系统自动生成会话摘要并保存到 `~/.ifai/sessions/`：
- 包含时间戳、模型信息、Token 统计、对话摘要
- 人类可浏览的 Markdown 格式
- 为未来语义搜索奠定基础

### 3. 智能压缩系统

TUI 新增智能上下文压缩，解决长对话的 Token 爆炸问题：
- **工具截断**：自动截断过长的工具输出，保留关键信息
- **模型感知阈值**：根据不同模型的上下文窗口大小动态调整压缩策略
- **AI 摘要**：LLM 驱动的对话摘要，保留核心上下文

---

## 🛠 Bug 修复

| 修复项 | 描述 |
|--------|------|
| Overlay 内容泄漏 | 修复 overlay 退出后内容残留到主屏幕的问题 |
| Agentic Loop 空转 | 消除工具审批导致的无限循环 |
| Ctrl+O/Ctrl+D 黑屏 | 修复 streaming 期间打开 overlay 导致的黑屏 |
| TodoWrite 遮挡内容区 | TodoWrite 面板与消息内容区视觉重叠修复 |
| TodoWrite 过早清空 | 修复任务完成时断链导致消息丢失 |
| LLM 连接超时 | 连接超时和 stream 异常断开现在有明确反馈 |
| Windows Alt+方向键 | 兼容 Windows 平台的 Alt+方向键输入 |
| 命令弹出框参数 | 修复斜杠命令参数拦截逻辑 |
| Overlay 屏幕花屏 | Ctrl+O overlay 在特定场景下的渲染异常 |
| Overlay 标题 | 中文化 overlay 标题 + 动态背景填充 |

---

## 🏗 技术改进

- **元编程 LLM 空参数处理**：统一修复所有 Provider 的空参数兼容性
- **MemorySave 自动审批**：双层权限修复（ToolRegistry + tool_approval_config.json）
- **外部化提示词模板**：记忆提取 prompt 支持用户自定义，带缓存机制
- **cargo fmt 全量格式化**：38 个文件代码风格统一

---

## 📦 安装与更新

### macOS
```bash
brew upgrade --cask ifai
```

### Windows
运行应用，在设置面板点击"检查更新"。

### 从源码构建
```bash
git clone https://github.com/peterfei/ifai.git
cd ifai
npm install
npm run tauri:community
```

---

## 📊 记忆系统文件结构

```
~/.ifai/
├── memories.md              # 热记忆（始终注入到 system prompt）
├── memories.meta.json       # 记忆元数据（访问频率、创建时间）
├── sessions/                # 冷记忆（会话摘要归档）
│   └── YYYY-MM-DD-{id}.md
└── prompts/
    └── memory/
        └── extract.md       # 记忆提取提示词（可自定义）
```

---

## 📝 完整 Commit 列表

```
1a5ba5dd chore: cargo fmt 全量格式化 + lint 清理
9ad00a27 docs(proposal): 标记提案任务为 100% 完成
9dd80b96 docs(memory): 完成提案 Phase 5-6 任务
d94fdf49 fix(memory): MemorySave 添加到工具审批配置（自动执行）
28d9616c fix(memory): MemorySave 工具自动执行（无需用户审批）
e9e50052 feat(memory): 记忆条目自动去重
bb55697b feat(memory): 外部化记忆提取提示词
81053fa5 feat(tui+cli): 实现会话归档功能（冷记忆存储）
a3e9f64c docs: 添加持久化记忆系统实现总结
d2fa0d83 feat(memory): Phase 4 - 实现会话后批量记忆提取 + LLM 调用
21db7e79 feat(memory): Phase 3 - 实现热记忆注入系统
632082e3 feat(memory): 实现持久化记忆系统 - 3层空间隐喻 + 跨会话学习
6b7b1760 fix(tui+session): overlay内容泄漏修复 + agentic loop空转消除
34d39b9b feat(tui): overlay 标题中文化 + 动态背景填充
580dd8e4 fix(tui): 修复Ctrl+O overlay屏幕"花"的问题
41b4b058 fix(tui): 修复TodoWrite任务过早清空导致断链的问题
93425510 feat: 元编程重构 LLM 空参数处理，统一修复 Provider 兼容性
79865a9d feat(tui): 智能压缩系统 - 工具截断 + 模型感知阈值 + AI 摘要
e53f4a32 fix(tui): TodoWrite 面板与内容区间留出 1 行间隔消除视觉重叠
a4945c06 fix(tui): TodoWrite 面板遮挡内容区
f4d90d95 fix(tui): LLM 连接超时无反馈 + stream 异常断开静默
7dd98aa6 fix(tui): streaming 期间 Ctrl+O/Ctrl+D 黑屏 + overlay 退出重入问题
57f03d05 fix(tui): Windows Alt+方向键兼容 + 命令弹出框参数拦截修复 + 帮助面板两列布局
```

---

<div align="center">
  <p><strong>Made with ❤️ by peterfei</strong></p>
</div>
