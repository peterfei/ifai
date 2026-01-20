# IfAI Editor v0.2.4 发布说明

发布日期：2025-12-31

## 📋 版本概述

**v0.2.4** 是 IfAI Editor 迄今最重大的版本更新之一，包含 **28 个文件变更**，新增 **1455 行**代码，删除 **387 行**代码。

本次更新实现了两大核心目标：
1. **对话管理工业化** - 将会话管理提升至 VSCode、Cursor 等工业标准
2. **Windows 完美适配** - 彻底解决 Windows 平台的所有已知问题

---

## 🚀 核心功能：对话管理工业化

### 1. 双击重命名会话
- **双击会话标签**即可进入编辑模式
- 自动聚焦并全选文本，符合直觉
- Enter 保存 / Esc 取消 / 失焦自动保存
- 空标题验证，防止误操作

### 2. F2 快捷键重命名
- 按 **F2 键**快速重命名当前活动会话
- 符合工业标准快捷键习惯（VSCode、Cursor 同款）
- 与双击编辑共享同一套逻辑

### 3. Ctrl+P 统一快速搜索
- 同时支持**文件**和**会话**搜索
- 前缀过滤模式：
  - `@关键字` - 只搜索文件
  - `#关键字` - 只搜索会话
  - 无前缀 - 同时搜索两者
- 搜索结果显示：
  - 📄 文件图标 + 文件路径
  - 💬 会话图标 + 会话标题 + 消息数 + 时间戳
- 选择会话后自动切换，无缝衔接

### 4. 增强右键上下文菜单
右键点击会话标签显示完整操作菜单：

| 功能 | 说明 |
|------|------|
| ✏️ 重命名 (F2) | 触发编辑模式 |
| 📌 置顶/取消置顶 | 重要会话置顶显示 |
| 🏷️ 添加标签 | 打开完整 TagManager |
| 📋 复制标题 | 一键复制会话名称 |
| ℹ️ 会话详情 | 查看完整统计信息 |
| 🗑️ 删除 (Ctrl+W) | 删除会话（含确认） |

**会话详情对话框**展示：
- 会话 ID
- 消息数量
- 创建时间
- 最后活跃时间
- 关联标签
- 会话描述

### 5. 会话时间戳显示
- CommandPalette 中会话结果显示最后活跃时间
- 智能相对时间格式：
  - `刚刚` - 1分钟内
  - `X分钟前` - 1小时内
  - `X小时前` - 24小时内
  - `X天前` - 30天内
  - `月-日` - 超过30天

---

## 🛠 Windows 平台关键修复

### 修复 1: 历史对话无法显示 ⭐ 核心修复
**问题**：Windows 下重启应用后历史对话无法显示

**根本原因**：
- `threadPersistence.ts` 使用 `setActiveThread()` 只设置活动线程 ID
- `setActiveThread()` 不会将历史消息加载到 `useChatStore.messages` 数组
- `AIChat` 组件从 `useChatStore.messages` 读取消息显示
- 结果：历史对话存在但无法显示，只显示空白对话

**修复方案**：
- 使用 `switchThread()` 替代 `setActiveThread()`
- `switchThread()` 会正确地将目标线程消息加载到 messages 数组

**影响**：
- ✅ Windows/macOS/Linux 重启后历史对话正确显示
- ✅ 线程切换消息加载正常

### 修复 2: Windows 流式代码生成闪屏问题 ⭐ 核心修复
**问题**：Windows 下流式代码生成时屏幕闪烁、抖动、位置偏移

**修复方案**：
- 彻底移除有问题的节流机制
- 优化渲染顺序和状态更新逻辑
- 添加初始隐藏策略，避免启动闪屏

**影响**：
- ✅ 流式代码生成丝滑流畅
- ✅ 无屏幕闪烁和位置偏移
- ✅ 低端设备也能正常运行

### 修复 3: Agent 工具调用系统优化
**问题**：
- "unknown" 工具调用
- 工具调用参数命名不一致
- 工具 ID 不一致导致重复创建
- 工具自动批准死循环

**修复方案**：
- 前端过滤无效的 Agent 工具调用
- 统一工具调用参数命名规范
- 修复工具调用 ID 生成逻辑
- 优化自动批准机制

**影响**：
- ✅ Agent 工具调用更稳定
- ✅ 减少无效调用和重复创建
- ✅ 避免死循环和资源浪费

---

## 📊 变更统计

### 文件变更
```
src/components/AIChat/ThreadContextMenu.tsx | 357 +++++++++++++++++++++++ (新建)
src/hooks/useThrottle.ts                     |  71 ++++++ (新建)
src/components/AIChat/ThreadTabs.tsx         | 170 ++++++++++-
src/components/CommandPalette/CommandPalette.tsx | 206 ++++++++++---
src/components/AIChat/MessageItem.tsx        | 131 ++++-----
src/components/AIChat/ToolApproval.tsx        |  70 ++---
src/stores/agentStore.ts                     |  45 ++-
src/stores/settingsStore.ts                  |  77 ++++
src/stores/persistence/threadPersistence.ts   |  47 ++-
src-tauri/src/agent_system/runner.rs        |  10 +-
src-tauri/src/agent_system/tools.rs         |  88 ++++--
... (共 28 个文件变更)
```

### 代码统计
- **新增**: +1455 行
- **删除**: -387 行
- **净增**: +1068 行

---

## ⬆️ 升级指南

### Windows 用户（强烈推荐）
本次更新修复了多个 Windows 平台的关键问题：
- 历史对话无法显示
- 流式生成时的屏幕闪烁
- Agent 工具调用不稳定

**建议所有 Windows 用户立即升级！**

### 所有用户
升级后可体验全新的会话管理系统：
1. 双击会话标签快速重命名
2. 使用 F2 快捷键快速编辑
3. 使用 Ctrl+P 搜索历史会话（支持 `#` 前缀）
4. 右键访问完整会话操作菜单

---

## 🔗 相关链接

- [GitHub 项目主页](https://github.com/peterfei/ifai)
- [问题反馈](https://github.com/peterfei/ifai/issues)
- [下载地址](https://github.com/peterfei/ifai/releases/v0.2.4)

---

**若爱 (IfAI) - 不只是编辑器，更是你的 AI 编程伙伴**

*"用工业标准打磨每一个细节，让 AI 编程体验真正触手可及"*
