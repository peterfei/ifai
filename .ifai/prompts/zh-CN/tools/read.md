---
name: agent_read_file
description: 读取物理文件的内容。对于超过 10KB 的大型文件，请先使用 agent_probe_symbols。
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

## PIVO 3.0 准则
- **务必核实**：如果不确定路径，请先使用 `agent_list_dir`。
- **大文件处理**：不要立即读取全文。先通过 `agent_probe_symbols` 查看骨架，定位关键行号后再进行精准读取。
