# GitHub Release 发布指南

## ✅ 已创建的发布说明

已为 v0.1.0 版本创建了完整的发布说明文档：

### 1. 中文版发布说明
- **文件**: `RELEASE_NOTES_v0.1.0.md`
- **用途**: GitHub Release 的中文描述
- **内容**:
  - 项目介绍和核心理念
  - v0.1.0 主要特性详解
  - 3张应用截图（使用 GitHub raw 链接）
  - 技术栈和性能指标
  - 安装说明（源码构建）
  - 快速开始指南
  - 已知问题列表
  - 未来计划路线图
  - 贡献指南
  - 开源协议说明
  - 致谢和社区链接
  - 版本信息和相关链接

### 2. 英文版发布说明
- **文件**: `RELEASE_NOTES_v0.1.0_EN.md`
- **用途**: GitHub Release 的英文描述（可选）
- **内容**: 与中文版完全对应

---

## 📝 如何在 GitHub 创建 Release

### 步骤 1: 提交所有更改

```bash
cd /Users/mac/project/aieditor/ifainew

# 查看更改
git status

# 添加所有文件
git add .

# 提交
git commit -m "docs: 准备 v0.1.0 首次发布

- 添加完整的中英文 README
- 添加 MIT LICENSE
- 添加 CHANGELOG 和 CONTRIBUTING 指南
- 配置 GitHub Issue/PR 模板
- 更新项目元信息
- 添加应用截图
- 创建发布说明
- 修复运行时错误

准备在 GitHub 上发布开源版本。
"
```

### 步骤 2: 推送到 GitHub

```bash
# 如果还没有设置远程仓库
git remote add origin https://github.com/peterfei/ifai.git

# 推送到 main 分支
git push -u origin main
```

### 步骤 3: 创建 GitHub Release

#### 方法 1: 通过 Web 界面

1. 访问: https://github.com/peterfei/ifai/releases/new

2. 填写 Release 信息:
   - **Tag version**: `v0.1.0`
   - **Release title**: `v0.1.0 - 若爱 (IfAI) 首次发布 🎉`
   - **Description**:
     - 打开 `RELEASE_NOTES_v0.1.0.md`
     - 复制完整内容
     - 粘贴到描述框

3. 选项设置:
   - ✅ 勾选 "Set as the latest release"
   - ⬜ 不勾选 "Set as a pre-release"（这是正式版本）

4. 上传构建产物（可选）:
   - 如果已构建了安装包，可以上传
   - 位置: `src-tauri/target/release/bundle/`
   - 格式: `.dmg` (macOS), `.exe` (Windows), `.AppImage` (Linux)

5. 点击 **"Publish release"**

#### 方法 2: 通过 GitHub CLI

```bash
# 安装 GitHub CLI (如果未安装)
# macOS: brew install gh
# Windows: winget install GitHub.cli
# Linux: https://github.com/cli/cli#installation

# 登录
gh auth login

# 创建 Release
gh release create v0.1.0 \
  --title "v0.1.0 - 若爱 (IfAI) 首次发布 🎉" \
  --notes-file RELEASE_NOTES_v0.1.0.md \
  --latest

# 如果有构建产物，添加文件
# gh release upload v0.1.0 path/to/installer.dmg
```

---

## 🖼 截图链接说明

发布说明中的截图使用了 GitHub raw 链接:

```markdown
![主界面](https://raw.githubusercontent.com/peterfei/ifai/main/imgs/ifai2025001.png)
```

### 注意事项

1. **推送前确认**: 确保 `imgs/` 目录已推送到 GitHub
2. **分支名称**: 确认主分支是 `main` 而不是 `master`
3. **仓库路径**: `peterfei/ifai` 应该与实际仓库匹配

### 截图显示验证

Release 发布后，可以访问以下链接验证截图:
- https://raw.githubusercontent.com/peterfei/ifai/main/imgs/ifai2025001.png
- https://raw.githubusercontent.com/peterfei/ifai/main/imgs/ifai2025002.png
- https://raw.githubusercontent.com/peterfei/ifai/main/imgs/ifai2025003.png

---

## 📋 发布前检查清单

### 代码准备

- [x] ✅ 所有代码已提交
- [x] ✅ 无编译错误
- [x] ✅ 所有测试通过
- [x] ✅ Bug 已修复

### 文档准备

- [x] ✅ README.md (中文，含截图)
- [x] ✅ README_EN.md (英文，含截图)
- [x] ✅ CHANGELOG.md
- [x] ✅ CONTRIBUTING.md
- [x] ✅ LICENSE
- [x] ✅ 发布说明 (中英文)

### 配置准备

- [x] ✅ package.json 元信息
- [x] ✅ tauri.conf.json 产品信息
- [x] ✅ GitHub Issue/PR 模板
- [x] ✅ 截图文件

### 发布准备

- [ ] ⏳ 代码已推送到 GitHub
- [ ] ⏳ 截图已推送到 GitHub
- [ ] ⏳ 创建 Git tag `v0.1.0`
- [ ] ⏳ 创建 GitHub Release
- [ ] ⏳ 发布说明已添加
- [ ] ⏳ 截图正常显示

### 构建产物（可选）

- [ ] ⏳ macOS 安装包 (.dmg)
- [ ] ⏳ Windows 安装包 (.exe, .msi)
- [ ] ⏳ Linux 安装包 (.AppImage, .deb)

---

## 🎯 发布后操作

### 1. 配置 GitHub 仓库

访问 **Settings** → **General**:

- **Description**:
  ```
  若爱 (IfAI) - 基于 Tauri 2.0 构建的跨平台 AI 代码编辑器 | A cross-platform AI code editor built with Tauri 2.0
  ```

- **Website**:
  ```
  https://github.com/peterfei/ifai
  ```

- **Topics**:
  ```
  ai, editor, code-editor, tauri, rust, react, typescript,
  monaco-editor, ai-assistant, cross-platform,
  开发工具, 代码编辑器, 人工智能
  ```

### 2. 启用功能

访问 **Settings** → **Features**:

- ✅ Issues
- ✅ Discussions
- ⬜ Wiki (可选)
- ⬜ Projects (可选)

### 3. 设置默认分支

访问 **Settings** → **Branches**:

- 确认默认分支为 `main`
- 可选：添加分支保护规则

### 4. 社交分享

- 在 Twitter/X 上分享
- 在技术社区（掘金、CSDN、V2EX 等）分享
- 在相关 Discord/Slack 频道分享

### 5. 监控反馈

- 关注 GitHub Issues
- 回复 Discussions
- 查看 Star/Fork/Watch 数量

---

## 📊 发布说明对比

### 中文版 vs 英文版

| 项目 | 中文版 | 英文版 |
|------|--------|--------|
| 文件名 | RELEASE_NOTES_v0.1.0.md | RELEASE_NOTES_v0.1.0_EN.md |
| 语言 | 简体中文 | English |
| 字数 | ~3500 字 | ~3500 words |
| 截图 | 3张（GitHub raw 链接） | 3张（GitHub raw 链接） |
| 内容结构 | 完全一致 | 完全一致 |

### 推荐使用

- **GitHub Release**: 使用中文版（主要受众）
- **国际用户**: 可以创建第二个 Release 使用英文版
- **README 链接**: 两个版本都可以在 README 中引用

---

## 💡 发布说明亮点

### 1. 完整性
- ✅ 涵盖所有重要信息
- ✅ 详细的功能列表
- ✅ 清晰的安装指南
- ✅ 实用的快速开始

### 2. 可读性
- ✅ 清晰的章节结构
- ✅ 丰富的 emoji 标记
- ✅ 详细的代码示例
- ✅ 美观的截图展示

### 3. 专业性
- ✅ 技术栈完整说明
- ✅ 性能指标量化
- ✅ 已知问题透明
- ✅ 未来规划清晰

### 4. 友好性
- ✅ 面向开发者
- ✅ 鼓励参与贡献
- ✅ 提供支持渠道
- ✅ 感谢开源社区

---

## 🚀 快速发布命令

如果一切准备就绪，可以使用以下命令快速发布:

```bash
# 1. 提交代码
git add .
git commit -m "release: v0.1.0 首次发布"
git push origin main

# 2. 创建并推送 tag
git tag -a v0.1.0 -m "v0.1.0 - 若爱 (IfAI) 首次发布"
git push origin v0.1.0

# 3. 使用 GitHub CLI 创建 Release
gh release create v0.1.0 \
  --title "v0.1.0 - 若爱 (IfAI) 首次发布 🎉" \
  --notes-file RELEASE_NOTES_v0.1.0.md \
  --latest
```

---

## 📞 需要帮助?

如果在发布过程中遇到问题:

1. 查看 [GitHub 官方文档](https://docs.github.com/en/repositories/releasing-projects-on-github)
2. 检查 [GitHub CLI 文档](https://cli.github.com/manual/gh_release_create)
3. 参考本项目的 [CONTRIBUTING.md](./CONTRIBUTING.md)

---

**祝发布顺利！** 🎉🚀

---

**文档生成时间**: 2025-12-17
**作者**: peterfei
