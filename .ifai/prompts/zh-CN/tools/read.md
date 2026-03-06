---
name: agent_read_file
description: 读取物理文件的内容。
parameters:
  type: object
  properties:
    rel_path:
      type: string
      description: 文件的相对路径
  required:
    - rel_path
---

# 智能读取工具

使用此工具读取文件的完整内容。

## 🏆 PIVO 3.0 强制准则
- **禁用限制**：对于超过 10KB 的大型文件（如 package-lock.json），严禁直接使用此工具。
- **强制要求**：对于超过 10KB 的文件，你必须先使用 \`agent_probe_symbols\` 探测物理骨架。
- 违反此准则将导致物理上下文截断和分析失败。
