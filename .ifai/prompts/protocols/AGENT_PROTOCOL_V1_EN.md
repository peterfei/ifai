# ifai Agent Protocol: Advanced Operations & Precision Editing (V1.0)

## 1. Core Mindset

### Minimal Change Principle
> Change one word, not one line; change one line, not rewrite entire file.

### Streaming Operations First
> For large files (>100 lines), must use grep to locate, sed/awk to modify.

### Lossless Updates
> All modifications must preserve original indentation, line breaks, and encoding.

---

## 2. Tactical Toolkit

| Action | Mandatory Instruction | Recommended Command | Purpose |
|--------|---------------------|---------------------|---------|
| **Locate** | Must include line numbers and context | `grep -nC 3 "pattern" file` | Precise targeting |
| **Modify** | Line-based priority, avoid regex errors | `sed -i '<line>s/old/new/' file` | Safest, most efficient |
| **Insert** | Auto-detect indentation, insert before/after line | `sed -i '<line>a\\<indent_content>' file` | Maintain alignment |
| **Batch** | Use find to limit scope, avoid full scan | `find . -maxdepth 2 -name "*.conf" \| xargs ...` | Clear scope |
| **Complex** | Use awk for field calculation or conditional filtering | `awk '$3 > 100 {print $0}' log` | Clear logic |

---

## 3. Self-Healing & Defense

### Backup Mechanism
> For `sed -i` operations, Agent must execute temporary backup or use `sed -i.bak`.

**Example**:
```bash
# Recommended: auto backup
sed -i.bak 's/old/new/g' file

# Or manual backup
cp file file.bak && sed -i 's/old/new/g' file
```

### Regex Escaping
> Must escape `/`, `.`, `*` in sed instructions.

**Example**:
```bash
# Dangerous: unescaped
sed -i 's/http://example.com/https://example.com/g' file

# Safe: use | separator
sed -i 's|http://example.com|https://example.com|g' file

# Or escape special characters
sed -i 's/http:\/\/example\.com/https:\/\/example\.com/g' file
```

### Empty Result Handling
> If grep matches nothing, must NOT execute sed, must error and reconfirm keyword.

**Example**:
```bash
# Check match result
if ! grep -q "pattern" file; then
  echo "Error: No match for 'pattern'. Please confirm keyword."
  exit 1
fi

# Then execute modification
sed -i 's/pattern/replacement/g' file
```

### Binary Protection
> Strictly prohibit sed/awk on non-text files (`.pyc`, `.png`, `.exe`).

**Check method**:
```bash
# Check file type
file <filename>

# Or filter by extension
find . -type f ! -name "*.pyc" ! -name "*.png" | xargs sed ...
```

---

## 4. Interactive Feedback

After each modification, provide feedback in this format:

```
[Operation]: <command>
[Diff]:
- <old content>
+ <new content>
[Verification]: <result>
```

**Example**:
```bash
[Operation]: sed -i '42s/False/True/' config.py
[Diff]:
- 42: DEBUG = False
+ 42: DEBUG = True
[Verification]: File permissions unchanged, syntax check (python -m py_compile) passed.
```

**Verification checklist**:
- ✅ File permissions unchanged
- ✅ Syntax check passed (if applicable)
- ✅ Indentation correct
- ✅ Encoding consistent

---

## 5. Blacklist

Following operations are **strictly prohibited**:

| Type | Command Pattern | Risk Level | Description |
|------|---------------|-----------|-------------|
| **Destructive deletion** | `rm -rf /` | 🔴 Critical | System destruction |
| **Permission abuse** | `chmod 777` | 🔴 High | Security vulnerability |
| **Ownership change** | `chown root` | 🔴 High | Privilege escalation |
| **System files** | `/etc/passwd`, `/etc/shadow` | 🔴 Critical | System security |
| **User data** | `~/.*`, `/home/*` | 🟡 Medium | Data loss |

**Intercept rules**:
```bash
# Check before execution
if [[ "$COMMAND" =~ ^rm[[:space:]]+-rf[[:space:]]+/$ ]]; then
  echo "Error: Prohibited destructive operation"
  exit 1
fi

# Check sensitive file paths
SENSITIVE_FILES=("/etc/passwd" "/etc/shadow" "/etc/sudoers")
for file in "${SENSITIVE_FILES[@]}"; do
  if [[ "$TARGET" == "$file" ]]; then
    echo "Error: Prohibited system file modification"
    exit 1
  fi
done
```

---

## 6. Symlink Protection

**Prevent Agent from modifying system sensitive files**:

```bash
# Check if symlink
if [ -L "$TARGET_FILE" ]; then
  echo "Warning: $TARGET_FILE is symlink, modification rejected"
  exit 1
fi

# Check if target points to sensitive directory
REAL_PATH=$(realpath "$TARGET_FILE")
if [[ "$REAL_PATH" =~ ^/etc/|^/usr/bin/|^/bin/ ]]; then
  echo "Error: System directory file modification rejected"
  exit 1
fi
```

---

## 7. Token Monitoring

**Prevent Agent from consuming tokens on large files**:

```bash
# Check file size
FILE_SIZE=$(stat -f%z "$FILE" 2>/dev/null || stat -c%s "$FILE" 2>/dev/null)
FILE_SIZE_MB=$((FILE_SIZE / 1024 / 1024))

# Auto-convert if file > 1MB
if [ "$FILE_SIZE_MB" -gt 1 ]; then
  echo "Warning: File too large ($FILE_SIZE_MB MB), using head -n 100"
  head -n 100 "$FILE"
  exit 0
fi
```

**Intercept rules**:
- File > 1MB → Use `head -n 100`
- File > 10MB → Reject read
- JSON > 100KB → Force use `jq` field extraction

---

## 8. Version & Compatibility

| Version | Date | Changes |
|---------|------|---------|
| V1.0 | 2025-01-XX | Initial version |

**Compatibility**:
- Works with all ifai Agent modes (CLI, GUI, TUI)
- Works with all file types (code, config, docs)
- Compatible with existing `--no-tool` flag

---

## 9. References & Related Docs

- **Main proposal**: `/openspec/changes/autonomous-tool-use/proposal.md`
- **Task list**: `/openspec/changes/autonomous-tool-use/tasks.md`
- **System prompt**: `/.ifai/prompts/system/cli.md`

---

## 10. Protocol Validation Checklist

Agents using this protocol must pass:

- [ ] Minimal change: Modify only necessary parts
- [ ] Line-first: All sed based on line numbers
- [ ] Backup: sed -i must have .bak
- [ ] Empty check: No sed if grep has no match
- [ ] Binary protection: No .pyc/.png/.exe processing
- [ ] Feedback format: Standardized feedback after modification
- [ ] Blacklist: No prohibited commands
- [ ] Symlink: No system file symlink modification
- [ ] Token monitoring: Large files auto-use head

---

**Protocol Version**: V1.0
**Last Updated**: 2025-01-XX
**Maintainer**: ifai Development Team
