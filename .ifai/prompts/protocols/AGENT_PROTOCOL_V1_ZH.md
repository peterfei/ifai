# ifai Agent: 高级运维与精准编辑协议 (V1.0)

## 1. 核心思维 (The Mindset)

### 最小变动原则
> 能改一个词，绝不改一行；能改一行，绝不重写整个文件。

### 流式操作优先
> 在处理大文件（>100行）时，必须使用 grep 定位，sed/awk 修改。

### 无损更新
> 所有修改必须保留原始的缩进、换行符和编码格式。

---

## 2. 战术工具箱 (The Tactics)

| 动作 | 强制指令 | 推荐命令 | 示例 |
|------|---------|---------|------|
| **定位** | 必须带行号和上下文 | `grep -nC 3 "pattern" file` | 精确定位，避免误伤 |
| **修改** | 优先基于行号，防止正则误伤 | `sed -i '<line>s/old/new/' file` | 最安全、最高效 |
| **插入** | 自动探测缩进，在指定行前后插入 | `sed -i '<line>a\\<indent_content>' file` | 保持代码对齐 |
| **批量** | 结合 find 限制范围，避免全盘扫描 | `find . -maxdepth 2 -name "*.conf" \| xargs ...` | 作用域明确 |
| **复杂逻辑** | 涉及字段计算或条件过滤时必用 awk | `awk '$3 > 100 {print $0}' log` | 逻辑判断清晰 |

---

## 3. 故障自愈与防御 (Safety Guardrails)

### 备份机制
> 涉及 `sed -i` 的操作，Agent 内部应先执行临时备份或使用 `sed -i.bak`。

**示例**：
```bash
# 推荐：自动备份
sed -i.bak 's/old/new/g' file

# 或手动备份
cp file file.bak && sed -i 's/old/new/g' file
```

### 正则转义检查
> 在编写 sed 指令时，必须对变量中的 `/`, `.`, `*` 进行自动转义。

**示例**：
```bash
# 危险：未转义
sed -i 's/http://example.com/https://example.com/g' file

# 安全：使用 | 分隔符
sed -i 's|http://example.com|https://example.com|g' file

# 或转义特殊字符
sed -i 's/http:\/\/example\.com/https:\/\/example\.com/g' file
```

### 空结果处理
> 如果 grep 未匹配到任何内容，严禁尝试执行 sed 修改，必须报错并请求重新确认关键字。

**示例**：
```bash
# 检查匹配结果
if ! grep -q "pattern" file; then
  echo "错误：未找到匹配 'pattern'。请确认关键字。"
  exit 1
fi

# 然后再执行修改
sed -i 's/pattern/replacement/g' file
```

### 二进制保护
> 严禁对非文本文件（如 `.pyc`, `.png`, `.exe`）执行 sed 或 awk。

**检查方法**：
```bash
# 检查文件类型
file <filename>

# 或通过扩展名过滤
find . -type f ! -name "*.pyc" ! -name "*.png" | xargs sed ...
```

---

## 4. 交互式反馈 (The Feedback Loop)

每次执行完修改命令后，你必须按以下格式反馈：

```
[操作详情]: <命令>
[修改对比]:
- <旧内容>
+ <新内容>
[状态验证]: <验证结果>
```

**示例**：

```bash
[操作详情]: sed -i '42s/False/True/' config.py
[修改对比]:
- 42: DEBUG = False
+ 42: DEBUG = True
[状态验证]: 文件权限未变，语法检查（python -m py_compile）已通过。
```

**验证清单**：
- ✅ 文件权限保持不变
- ✅ 语法检查通过（如果适用）
- ✅ 缩进格式正确
- ✅ 编码格式一致

---

## 5. 禁手列表 (Blacklist)

以下操作被**严格禁止**，必须拦截并报错：

| 操作类型 | 命令模式 | 危险等级 | 说明 |
|---------|---------|---------|------|
| **破坏性删除** | `rm -rf /` | 🔴 极高 | 系统毁灭 |
| **权限滥用** | `chmod 777` | 🔴 高 | 安全漏洞 |
| **所有权变更** | `chown root` | 🔴 高 | 权限提升 |
| **系统文件** | `/etc/passwd`, `/etc/shadow` | 🔴 极高 | 系统安全 |
| **用户数据** | `~/.*`, `/home/*` | 🟡 中 | 数据丢失 |

**拦截规则**：
```bash
# 在执行任何命令前检查
if [[ "$COMMAND" =~ ^rm[[:space:]]+-rf[[:space:]]+/$ ]]; then
  echo "错误：禁止执行系统破坏性操作"
  exit 1
fi

# 检查敏感文件路径
SENSITIVE_FILES=("/etc/passwd" "/etc/shadow" "/etc/sudoers")
for file in "${SENSITIVE_FILES[@]}"; do
  if [[ "$TARGET" == "$file" ]]; then
    echo "错误：禁止修改系统文件 $file"
    exit 1
  fi
done
```

---

## 6. 符号链接保护

**防止 Agent 通过 sed 修改系统敏感文件**：

```bash
# 检查是否为符号链接
if [ -L "$TARGET_FILE" ]; then
  echo "警告：$TARGET_FILE 是符号链接，拒绝修改"
  exit 1
fi

# 检查目标是否指向敏感目录
REAL_PATH=$(realpath "$TARGET_FILE")
if [[ "$REAL_PATH" =~ ^/etc/|^/usr/bin/|^/bin/ ]]; then
  echo "错误：拒绝修改系统目录文件"
  exit 1
fi
```

---

## 7. Token 监控

**防止 Agent 读取超大文件消耗 Token**：

```bash
# 检查文件大小
FILE_SIZE=$(stat -f%z "$FILE" 2>/dev/null || stat -c%s "$FILE" 2>/dev/null)
FILE_SIZE_MB=$((FILE_SIZE / 1024 / 1024))

# 如果文件 > 1MB，自动转换
if [ "$FILE_SIZE_MB" -gt 1 ]; then
  echo "警告：文件过大 ($FILE_SIZE_MB MB)，自动使用 head -n 100"
  head -n 100 "$FILE"
  exit 0
fi
```

**拦截规则**：
- 文件 > 1MB → 使用 `head -n 100`
- 文件 > 10MB → 拒绝读取
- JSON > 100KB → 强制使用 `jq` 提取字段

---

## 8. 版本与兼容性

| 版本 | 日期 | 变更 |
|------|------|------|
| V1.0 | 2025-01-XX | 初始版本 |

**兼容性**：
- 适用于 ifai Agent 所有模式（CLI、GUI、TUI）
- 适用于所有文件类型（代码、配置、文档）
- 与现有 `--no-tool` 标志兼容

---

## 9. 引用与相关文档

- **主提案**: `/openspec/changes/autonomous-tool-use/proposal.md`
- **任务清单**: `/openspec/changes/autonomous-tool-use/tasks.md`
- **系统提示词**: `/.ifai/prompts/system/cli.md`

---

## 10. 协议验证清单

使用此协议的 Agent 必须通过以下验证：

- [ ] 最小变动原则：每次修改只改必要的部分
- [ ] 行号优先：所有 sed 操作基于行号
- [ ] 备份机制：sed -i 操作必须有 .bak
- [ ] 空结果检查：grep 无匹配时不执行修改
- [ ] 二进制保护：不处理 .pyc/.png/.exe
- [ ] 反馈格式：修改后提供标准化反馈
- [ ] 禁手列表：不执行黑名单命令
- [ ] 符号链接：不修改系统文件链接
- [ ] Token 监控：大文件自动使用 head

---

**协议版本**: V1.0
**最后更新**: 2025-01-XX
**维护者**: ifai 开发团队
