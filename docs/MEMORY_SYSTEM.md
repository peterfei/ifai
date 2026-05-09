# IfAI 记忆系统用户指南

## 概述

IfAI 记忆系统是一个跨会话持久化记忆功能，让 AI 能够记住你的偏好、项目知识和技术决策，并在新会话中自动使用这些信息。

**核心特性**：
- 🧠 **自动记忆**：AI 在对话中主动保存重要信息
- 💾 **持久化存储**：所有记忆保存在本地 Markdown 文件
- 🔄 **跨会话共享**：TUI 和 GUI 界面共享同一记忆库
- ✏️ **可编辑**：你可以手动编辑记忆文件
- 🔄 **自动去重**：相同内容自动更新日期，不会重复

---

## 文件结构

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

## 空间隐喻

记忆使用"空间隐喻"组织，类似建筑的层级结构：

```
Wing（建筑）     Hall（大厅）        Room（房间）
├── Project    → Preferences      → programming-languages
│              → ProjectKnowledge → api-endpoints
│              → Decisions        → architecture
│              └── WorkflowPatterns → code-review
└── User       → Preferences      → communication-style
              → ...
```

**路径格式**：
- 2 层：`Preferences/programming-languages`
- 3 层：`Project/Preferences/programming-languages`

---

## 使用方法

### 1. 自动记忆（AI 主动保存）

在对话中，当你明确表达偏好或做出决策时，AI 会自动保存：

```
你：记住，我喜欢用 TypeScript 而不是 JavaScript
AI：✓ 已保存到 Preferences/programming-languages: 使用 TypeScript 而非 JavaScript
```

**AI 会主动保存的场景**：
- 编程语言/框架偏好
- 技术选型决策
- 项目架构决定
- 工作流模式
- 交流风格

### 2. 手动编辑记忆文件

直接编辑 `~/.ifai/memories.md`：

```markdown
# User Memories

## Preferences
- [2025-05-10] 使用 TypeScript 进行前端开发
- [2025-05-10] 代码审查关注安全性和可维护性

## Project/Preferences
### programming-languages
- [2025-05-10] 主要使用 Rust 和 TypeScript

## Decisions
- [2025-05-10] 采用 PostgreSQL 作为主数据库
```

### 3. 自定义记忆提取规则

编辑 `~/.ifai/prompts/memory/extract.md`，自定义 AI 如何提取记忆：

```markdown
你是一个专业的记忆提取助手。

## 提取规则
1. **用户偏好**：编程语言、工具、框架等
2. **重要决策**：架构决策、技术选型
3. **领域知识**：项目特定知识

## 输出格式
**[类别]** 记忆内容

例如：
**[Preferences]** 使用 TypeScript 而非 JavaScript
```

---

## 记忆分类

### Preferences（偏好）
个人偏好设置，如编程语言、工具、交流风格等。

**示例路径**：
- `Preferences/programming-languages`
- `Preferences/communication-style`
- `Project/Preferences/code-style`

### ProjectKnowledge（项目知识）
项目特定的技术知识、API 使用方式、配置要求等。

**示例路径**：
- `ProjectKnowledge/api-endpoints`
- `ProjectKnowledge/database-schema`
- `Project/ProjectKnowledge/auth-flow`

### Decisions（决策）
项目架构决策、技术选型、设计模式选择等。

**示例路径**：
- `Decisions/architecture`
- `Decisions/technology-stack`
- `Project/Decisions/api-design`

### WorkflowPatterns（工作流模式）
开发流程、代码审查流程、测试策略等。

**示例路径**：
- `WorkflowPatterns/code-review`
- `WorkflowPatterns/testing`
- `Project/WorkflowPatterns/deployment`

---

## 冷记忆（会话归档）

每次会话结束后，系统会自动生成会话摘要并保存到 `~/.ifai/sessions/`：

```
~/.ifai/sessions/
└── 2025-05-10-abc123.md
```

**冷记忆内容**：
- 会话时间戳
- 使用的模型
- Token 统计
- 对话摘要（用户消息 + AI 回复的简短版本）

**用途**：
- 人类可浏览的历史记录
- 未来可能支持语义搜索
- 不自动注入到 system prompt

---

## 高级功能

### 记忆去重

系统自动检测重复内容并更新日期：

```markdown
# 第一次保存
- [2025-05-08] 使用 TypeScript

# AI 再次确认相同偏好
- [2025-05-10] 使用 TypeScript  # ← 日期更新，不添加新条目
```

### 记忆元数据追踪

系统追踪记忆的使用情况：

```json
{
  "content_hash": "abc123...",
  "access_count": 5,
  "first_created": "2025-05-08",
  "last_accessed": "2025-05-10"
}
```

**未来扩展**：
- 高价值记忆优先展示（`access_count >= 5`）
- 基于元数据的自动过期清理

### 外部化提示词

你可以完全自定义记忆提取规则：

```bash
# 编辑提取提示词
vim ~/.ifai/prompts/memory/extract.md

# 清除缓存以应用更改
# （重启 IfAI 或下次提取时自动生效）
```

**提示词优先级**：
1. 外部文件：`~/.ifai/prompts/memory/extract.md`
2. 内置默认：编译时嵌入的 fallback

---

## 常见问题

### Q: 如何查看当前的记忆？

```bash
# 查看热记忆
cat ~/.ifai/memories.md

# 查看会话归档
ls -la ~/.ifai/sessions/
```

### Q: 如何删除某条记忆？

手动编辑 `~/.ifai/memories.md`，删除对应行即可。

### Q: 记忆是否会自动过期？

当前版本不会自动过期。未来版本可能支持基于元数据的自动清理（如：>30 天未使用的记忆）。

### Q: 记忆文件最大支持多大？

建议保持在 2000 tokens 以内（约 15000 字符），以确保注入性能。实测 20 KB 文件注入时间 < 1ms。

### Q: TUI 和 GUI 的记忆是否共享？

是的！TUI 和 GUI 共享同一个 `~/.ifai/memories.md` 文件。

### Q: 如何禁用记忆功能？

删除或重命名 `~/.ifai/memories.md` 即可。系统会正常启动，只是不注入记忆。

---

## 最佳实践

### ✅ 推荐做法

1. **明确表达偏好**：用"记住，我喜欢..."这样的表达
2. **使用具体描述**：不说"我喜欢好的代码"，而说"我喜欢遵循 SOLID 原则的代码"
3. **定期清理**：删除过时的记忆，保持文件整洁
4. **使用分类**：让 AI 保存到合适的分类（Preferences/Decisions/...）

### ❌ 避免做法

1. **不要过度依赖**：记忆是辅助工具，不是万能的
2. **不要保存临时信息**：如"今天天气不错"这种一次性的信息
3. **不要保存敏感信息**：记忆文件是明文存储的

---

## 技术细节

### 性能

- **注入延迟**：< 1ms（20 KB 文件）
- **文件大小限制**：建议 ≤ 2000 tokens
- **测试覆盖**：95% 单元测试覆盖率

### 安全性

- **存储位置**：`~/.ifai/`（本地文件系统）
- **文件格式**：明文 Markdown
- **权限**：遵循系统文件权限

### 兼容性

- **向后兼容**：旧版本的记忆文件仍然可用
- **跨平台**：macOS、Linux、Windows
- **跨界面**：TUI 和 GUI 共享记忆

---

## 反馈与贡献

如果你有建议或发现问题，请：

1. 查看 `openspec/changes/add-persistent-memory/` 了解设计文档
2. 运行测试验证功能：`cargo test --lib memory`
3. 提交 Issue 或 Pull Request

---

**最后更新**：2025-05-10
**版本**：v0.4.6
**状态**：Phase 0-4 已完成（85%）
