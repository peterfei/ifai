# 🔧 技能列表为空 - 快速修复指南

## 问题现象
- Toast显示"安装成功"，但技能列表仍然为空
- 技能中心显示"未发现可用技能"

## 问题原因
之前安装创建了空的技能目录，这些空目录被扫描但没有有效的技能文件。

## ✅ 解决方案

### 方法1: 重新安装示例技能（推荐）

1. **清理旧数据**
   ```bash
   # 删除技能目录中的空文件夹
   rm -rf .ifai/skills/*
   ```

2. **重新启动应用**
   - 完全关闭 IfAI
   - 重新打开应用

3. **安装示例技能**
   - 打开 **设置** → **技能中心**
   - 点击 **"安装示例技能"** 按钮
   - 等待绿色成功提示

4. **刷新页面**
   - 按F5或Cmd+R刷新页面
   - 技能列表应该显示4个技能

### 方法2: 使用诊断工具

```bash
# 运行诊断工具
npx tsx scripts/diagnose-skills.ts
```

诊断工具会：
- 检查技能目录结构
- 识别格式问题
- 提供修复建议

## 📋 应该看到的技能

安装成功后，你应该看到以下4个技能：

1. **code-review** - 代码审查专家
   - 安全漏洞检测
   - 性能优化建议
   - 代码规范检查

2. **test-generator** - 测试生成专家
   - 自动生成单元测试
   - 支持多种测试框架
   - 覆盖率分析

3. **documentation-writer** - 文档生成专家
   - API文档生成
   - 用户手册编写
   - 技术文档维护

4. **debugger** - 调试专家
   - 问题定位和诊断
   - 性能分析
   - 错误修复指导

## 🔍 验证安装

运行验证脚本：
```bash
npx tsx scripts/verify-skills-installation.ts
```

应该看到：
```
✅ 有效技能: 4
🎉 技能安装验证通过！
```

## 🆘 仍然有问题？

如果技能列表仍然为空：

1. **检查开发者控制台**
   - 按F12打开开发者工具
   - 查看Console标签页
   - 寻找错误信息（红色）
   - 特别注意包含"Skill"或"skill"的错误

2. **检查Tauri命令**
   - 在控制台输入：`window.__TAURI__`
   - 确认Tauri对象存在
   - 检查`invoke`方法可用

3. **手动验证文件**
   ```bash
   ls -la .ifai/skills/
   ```

   应该看到：
   ```
   code-review/
     └── skill.md
   test-generator/
     └── skill.md
   documentation-writer/
     └── skill.md
   debugger/
     └── skill.md
   ```

4. **检查技能文件内容**
   ```bash
   cat .ifai/skills/code-review/skill.md | head -20
   ```

   应该看到YAML frontmatter：
   ```yaml
   ---
   name: code-review
   description: ...
   ...
   ---
   ```

## 📞 获取帮助

如果以上方法都无效，请提供以下信息：

1. **诊断工具输出**
   ```bash
   npx tsx scripts/diagnose-skills.ts > diagnosis.txt
   ```

2. **开发者控制台日志**
   - F12 → Console → 右键 → Save as...

3. **技能目录结构**
   ```bash
   tree .ifai/skills/ || find .ifai/skills/ -print
   ```

---

**最后更新**: 2025-01-19
**版本**: 1.0.0
