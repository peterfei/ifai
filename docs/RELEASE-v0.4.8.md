# IfAI v0.4.8 发布说明

**发布日期**: 2025-05-14

**主题**: 自主会话能力质的飞跃 + WebSearch Agent + 元编程架构 + 6倍性能提升

---

## 📋 概述

v0.4.8 是一个**里程碑式版本**，实现了**自主会话能力的质的飞跃**。不仅引入了 **WebSearch Agent**，还实现了革命性的 **#[derive(Tool)] 元编程系统**、**Explore Agent 性能大幅优化**（79s→13s）、**TUI 首次运行向导**、**智能压缩系统**等重要改进。

### 关键数据
- **83 个提交** 自 v0.4.7 以来
- **自主会话**: 100% 信任模型 + 工具调用限制 10倍提升（100→1000）
- **性能提升**: Explore Agent 从 79s 优化至 13s（**6倍提速**）
- **测试覆盖**: 70/70 测试通过（100%）
- **代码质量**: 元编程架构零样板代码

---

## 🌟 主要特性

### 一、自主会话能力质的飞跃 （核心亮点）

**100% 信任模型 — 理念上的重大转变**
- **完全移除人为限制**：循环阻断机制、熔断机制、"AI 返回纯文本 = 停止信号"检查全部移除
- **充分信任 AI**：让 AI 能够根据任务需求自主决策，不再受人为约束
- **工具调用暴增**：限制从 100 提升到 1000（**10倍提升**），支持更复杂的多步骤任务

**断链问题根治 — 确保 AI 能够持续工作**
- **修复 Agentic Loop 断链**：解决工具循环中消息丢失的问题
- **修复无限 Continuing**：解决工具循环无限继续的问题
- **修复 HTTP 400 + 断链三重问题**：一次性解决三个相互关联的复杂问题

**智能压缩系统 — 让长对话更流畅**
- **集成到 AI 服务层**：防止上下文溢出，自动触发压缩
- **Mid-turn 压缩失效修复**：在对话过程中正确压缩
- **消息配对完整性保障**：确保压缩后消息配对不丢失
- **恢复工具参数携带**：压缩时保留工具调用的参数信息

**系统提示词增强 — 自主工具调用强化**
- **Phase 1 系统提示词优化**：强化自主工具调用的能力
- **工具调用进度优化**：添加目标信息（文件路径/搜索模式）
- **修复显示时机问题**：确保工具调用进度正确显示

### 二、WebSearch Agent 🌐

**集成博查 AI 搜索引擎**
- 实时网络搜索能力
- 最新技术文档检索
- 新闻和时事查询
- 智能结果分析和摘要

**三层防护机制**
- **第一层**: 系统提示词强制规则（TUI + GUI）
- **第二层**: LLM 工具列表过滤（完全隐藏底层 web_search）
- **第三层**: 自动审批白名单（category: safe）

**智能缓存系统**
- LRU 内存缓存 + JSON 持久化（~/.ifai/cache/search.json）
- TTL 1 小时过期，缓存命中率统计
- 重复查询 <10ms 响应

**零审批自动执行**
- 归类为 `safe` 工具，无需用户批准
- 透明操作，实时反馈

### 二、#[derive(Tool)] 元编程系统 🔧

**零样板代码工具系统**
- 使用 `#[derive(Tool)]` 宏自动生成工具实现
- 自动实现 `ToolLike` trait
- 完全替换旧的 FileToolsExecutor

**MacroToolAdapter 桥接**
- 与旧工具系统无缝集成
- 通用工具执行接口
- 类型安全的参数处理

**配置驱动设计**
- 基于 YAML 的工具定义
- 外部化提示词模板
- 运行时配置更新

### 三、Explore Agent 性能优化 🚀

**6倍性能提升**（GUI 模式）
- **优化前**: 79 秒
- **优化后**: 13 秒
- **提升**: **83.7%** ⚡

**并行读取优化**
- 移除 agent_batch_read
- 改用并行 agent_read_file + 预扫描目录树
- 充分利用多核 CPU 性能

**智能截断**
- 大文件自动截断（防止 Token 浪费）
- 限制工具调用次数
- 实时状态栏反馈

**多轮探索强化**
- 移除文件数量限制
- 强化多轮探索指示
- Prompt 多语言回退

### 四、TUI 首次运行向导 🎯

**智能设置向导**
- 自动检测首次运行
- 引导用户配置 Provider
- 选择 Model 和 Base URL
- 保存配置到 `~/.ifai/config.toml`

**Provider 元数据驱动**
- 移除所有硬编码
- YAML 配置驱动
- 自动加载 Provider 列表
- 支持自定义 Provider

### 五、声明式状态栏动画系统 ✨

**元编程架构**
- 声明式动画定义
- 自动生成渲染逻辑
- 零手写动画代码

**简洁设计**
- 移除 emoji，保持专业
- 流畅的动画过渡
- 实时状态反馈

### 六、智能压缩系统 🗜️

**防止上下文溢出**
- 工具输出智能截断
- 模型感知阈值
- AI 驱动摘要生成

**解决 HTTP 400 错误**
- 消息压缩逻辑
- 防止 Token 爆炸
- 保持对话连贯性

### 七、100% 信任模型 🤝

**移除所有限制**
- 取消工具调用硬性限制（100 → 1000）
- 完全移除循环阻断机制
- 移除熔断机制
- 移除"AI 返回纯文本 = 停止信号"检查

**修复断链问题**
- 修复 Agentic Loop 断链
- 修复工具循环无限 Continuing
- 修复 HTTP 400 + 断链三重问题

### 八、专用 Agent 工具 🛠️

**explore_agent & review_agent**
- 注册为低风险工具（无需审批）
- Agent 工具进度显示优化
- 匹配 /agent explore 格式

**glob_search 工具**
- 支持模糊搜索文件
- 智能文件过滤
- 高性能搜索

### 九、提示词引用解析 📝

**支持自定义提示词**
- 提示词引用解析功能
- 用户自定义提示词优先级加载
- 最小化部署支持

**外部化模板**
- 提示词模板外部化
- 支持热更新
- 无需重新编译

---

## 📦 详细变更

### 新增文件

**WebSearch 相关**
- `src-tauri/src/harness/tool/new_tools/cache.rs` - LRU 缓存实现
- `src-tauri/src/harness/tool/new_tools/cached_adapter.rs` - 缓存适配器
- `src-tauri/src/harness/tool/new_tools/web_search.rs` - WebSearch 核心工具
- `src-tauri/src/bin/ifai/workflows/websearch.yaml` - 工作流定义
- `.ifai/prompts/agents/websearch.md` - Agent 提示词

**元编程系统**
- `src-tauri/src/tool_macro/` - 宏实现目录
- `src-tauri/src/harness/tool/new_tools/mod.rs` - 新工具系统

**首次运行向导**
- `src-tauri/src/bin/ifai/first_run.rs` - 首次运行检测器
- `src-tauri/src/bin/ifai/wizard.rs` - 设置向导

**状态栏动画**
- `src-tauri/src/bin/ifai/status_bar.rs` - 声明式状态栏

**文档**
- `docs/websearch-guide.md` - 用户指南
- `docs/websearch-architecture.md` - 架构文档

### 修改文件

**核心系统**
- `src-tauri/src/harness/tool/registry.rs` - 工具注册更新
- `src-tauri/src/harness/tool/executor/agentexecutors.rs` - Agent 执行器
- `src-tauri/src/agent_system/workflow/types.rs` - AgentType 枚举
- `src-tauri/src/harness_ai_service.rs` - 工具列表过滤 + 压缩集成
- `src-tauri/src/agent_system/workflow/runner.rs` - 并行读取优化

**TUI 增强**
- `src-tauri/src/bin/ifai/main.rs` - 版本更新 + 首次运行检测
- `src-tauri/src/bin/ifai/session.rs` - TUI 输出处理
- `src-tauri/src/bin/ifai/config.rs` - 配置加载优化
- `src-tauri/src/bin/ifai/permission_store.rs` - 权限存储

**提示词系统**
- `.ifai/prompts/zh-CN/system/cli.md` - WebSearch 规则
- `.ifai/prompts/system/cli.md` - WebSearch 规则
- `.ifai/prompts/system/main.md` - WebSearch 规则

**配置**
- `src-tauri/Cargo.toml` - 版本 0.4.8 + 作者更新
- `package.json` - 版本 0.4.8
- `src-tauri/src/bin/ifai/tool_approval_config.json` - 安全类别

---

## 🐛 Bug 修复

1. **工具名称不匹配** - 统一为 "web_search"
2. **TUI 输出缺失** - 添加 output_tx.send
3. **嵌套运行时 Panic** - 运行时检测和策略选择
4. **Explore 断链** - 修复工具循环无限 Continuing
5. **HTTP 400 错误** - 智能压缩系统
6. **压缩失效** - 修复 Mid-turn 压缩失效
7. **消息配对不完整** - 修复压缩后消息配对
8. **LLM 连接超时** - 优化超时处理

---

## 🧪 测试

### 测试覆盖
- **缓存系统**: 9 个测试（全部通过）
- **Agent 系统**: 3 个测试（全部通过）
- **总计**: 70/70 测试通过（100%）

### 性能测试
- **Explore Agent**: 79s → 13s（**6倍提升**）
- **缓存命中**: <10ms 响应
- **并行读取**: 充分利用多核 CPU

---

## 📊 性能对比

| 场景 | v0.4.7 | v0.4.8 | 提升 |
|-----|--------|--------|------|
| GUI Explore | 79s | 13s | **83.7%** ⚡ |
| 缓存查询 | N/A | <10ms | 新功能 |
| 工具调用限制 | 100 | 1000 | **10倍** |
| 熔断机制 | 启用 | 移除 | **100% 信任** |

---

## 📚 文档

### 新增文档
1. **用户指南**（350 行）- WebSearch 使用说明
2. **架构文档**（500 行）- WebSearch 架构设计
3. **README 更新** - 中/英/俄三语版本

---

## 🔄 升级说明

### 从 v0.4.7 升级
1. 拉取最新代码: `git pull`
2. 安装依赖: `npm install`
3. 构建 Tauri 应用: `npm run tauri:community`
4. 首次运行会自动启动设置向导

### 配置
- **自动**: 首次运行启动向导
- **可选**: 配置博查 API Key 以启用 WebSearch
- **可选**: 自定义提示词模板

---

## ⚠️ 破坏性变更

**无** — 这是一个完全向后兼容的版本。

---

## 🙏 致谢

特别感谢：
- **博查 AI** 提供搜索 API
- **Tauri 团队** 优秀框架
- **Rust 社区** 出色 crate（lru, tokio, serde）
- **OpenAI** API 兼容性标准

---

## 📅 下一步计划

**v0.4.9 规划**
- 增强的搜索结果分析
- 多源搜索聚合
- 搜索历史管理
- 高级过滤选项
- 国际化搜索支持

---

## 📞 支持

- **文档**: [docs/](docs/)
- **问题反馈**: [GitHub Issues](https://github.com/peterfei/ifai/issues)
- **讨论交流**: [GitHub Discussions](https://github.com/peterfei/ifai/discussions)

---

**下载 v0.4.8**: [GitHub Releases](https://github.com/peterfei/ifai/releases/tag/v0.4.8)

---

<div align="center">
  <p><strong>Made with ❤️ by peterfei</strong></p>
  <p>体验 AI 原生编程的未来 | 6倍性能提升 + 零样板代码 | IfAI v0.4.8</p>
</div>
