# IfAI v0.3.3 发布说明

<div align="center">
  <h2>🤖 工具分类系统 + Agent 系统重构</h2>
  <p>智能路由 AI 请求，模块化服务架构</p>
  <p>2026-01-27</p>
</div>

---

## 📦 安装

### macOS
```bash
brew install --cask ifai
```

### Windows
下载 `.exe` 或 `.msix` 安装包

### Linux
下载 `.AppImage` 或 `.deb` 安装包

[📥 下载页面](https://github.com/peterfei/ifai/releases/tag/v0.3.3)

---

## 🚀 核心特性

### 1. 工具分类系统 (Tool Classification System)

**智能三层分类机制，自动路由 AI 请求到最合适的工具**

```
用户输入 → Layer 1 精确匹配 → Layer 2 规则引擎 → Layer 3 LLM 智能判断
            ↓                    ↓                   ↓
        直接执行            关键词匹配          语义理解
```

#### 支持的工具类型
- **文件操作** - `/git status`、`/npm install`、文件读写
- **代码生成** - "创建一个 React 组件"、"生成 TypeScript 类型"
- **代码分析** - "分析这段代码"、"解释这个函数"
- **终端命令** - `ls -la`、`cargo build`、`python test.py`
- **搜索操作** - "查找所有 TODO"、"搜索特定函数"
- **AI 对话** - "什么是闭包？"、"如何优化性能？"

#### 技术亮点
- ✅ **零配置** - 自动识别，无需手动选择工具
- ✅ **高性能** - 三层过滤，减少 LLM 调用
- ✅ **可扩展** - 工具注册表设计，轻松添加新工具
- ✅ **完整测试** - 70+ 单元测试，确保稳定性

---

### 2. Agent 服务模块化

**重构 Agent 系统架构，提取核心服务模块**

#### 核心模块
- **ToolRegistry** - 统一工具管理
- **AgentListeners** - 标准化事件处理
- **ToolCallDeduplicator** - 防止重复执行
- **Formatters** - 多种输出格式（Task Tree、Markdown、增量解析）

#### 优势
- 🔧 **可维护性** - 模块化设计，职责清晰
- 🧪 **可测试性** - 独立模块，便于单元测试
- 📈 **可扩展性** - 新增工具/功能更简单

---

### 3. 自定义提供商增强

**修复 NVIDIA 等自定义提供商 404 错误**

#### 修复内容
- ✅ **字段映射修复** - 解决前端 camelCase 与后端 snake_case 不匹配
- ✅ **默认模型列表** - 自定义预设添加示例模型
- ✅ **模型验证** - "设为默认"按钮在模型为空时禁用并提示

#### 支持的提供商
- NVIDIA (`z-ai/glm4.7`)
- OpenAI (`gpt-4o-mini`)
- Anthropic (`claude-3-5-sonnet-20241022`)
- 其他 OpenAI 兼容 API

---

### 4. 目录列表优化

**过滤系统目录，添加文件统计**

#### 改进
- 🔍 **智能过滤** - 自动隐藏 `.git`、`node_modules` 等系统目录
- 📊 **统计信息** - 显示文件和目录数量
- 📁 **更清晰的视图** - 专注于项目代码

---

## 🐞 Bug 修复

- [x] 修复自定义提供商 404 错误（字段映射问题）
- [x] 修复商业版 ifainew-core 字段映射问题
- [x] 修复 agent_list_dir 显示问题
- [x] 修复 agent_read_file 内容截断问题
- [x] 修复 E2E 测试在非 Tauri 环境的执行问题

---

## 🧪 测试

- **70+ 工具分类单元测试** - 确保分类规则准确
- **E2E 测试优化** - Tauri 模式检测，避免误执行
- **回归测试标记** - 标识需要验证的关键测试

---

## 📊 性能

- **工具分类缓存** - 减少重复 LLM 调用
- **事件监听器优化** - 减少 Agent 系统开销
- **模块化架构** - 更好的代码分割和懒加载

---

## 🔄 升级指南

### 从 v0.3.2 升级

1. **下载新版本** - [发布页](https://github.com/peterfei/ifai/releases/tag/v0.3.3)
2. **直接安装** - 覆盖安装即可，配置自动迁移
3. **验证功能** - 尝试使用工具分类系统（输入 `/git status` 或 "分析代码"）

### 配置变更

- **自定义提供商** - 如有 NVIDIA 等自定义提供商，重新添加即可（已修复 404 问题）
- **无需其他配置** - 工具分类系统自动生效

---

## 📝 已知问题

- 无重大已知问题

---

## 🙏 致谢

感谢所有参与测试和反馈的用户！

特别感谢：
- @all-contributors - 工具分类系统测试
- @beta-testers - NVIDIA 提供商问题反馈

---

## 📅 下个版本预告 (v0.3.4)

- 更多工具分类规则优化
- Agent 任务拆解增强
- 性能监控和统计面板

---

## 🔗 相关链接

- [完整文档](https://docs.ifai.today/)
- [GitHub Issues](https://github.com/peterfei/ifai/issues)
- [更新日志](CHANGELOG.md)
- [贡献指南](CONTRIBUTING.md)

---

<div align="center">
  <p>⭐ 如果这个项目对你有帮助，请给个 Star！</p>
  <p>🐛 发现问题？请提交 Issue</p>
  <p>💬 有建议？欢迎讨论</p>
</div>
