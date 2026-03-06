---
name: agent_probe_symbols
description: 探测源代码符号骨架（类、函数、接口等），以极低的 Token 开销理解大文件结构。
parameters:
  type: object
  properties:
    rel_path:
      type: string
      description: 文件的相对路径
  required:
    - rel_path
---

# 符号探测工具

探测源文件的骨架，获取类和函数的行号。这是 PIVO 3.0 推荐的大文件分析首选工具。
