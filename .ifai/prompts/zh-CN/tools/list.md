---
name: agent_list_dir
description: 列出目录中的文件和子目录。在读取或写入文件前，强烈建议先核实路径。
parameters:
  type: object
  properties:
    rel_path:
      type: string
      description: 目录的相对路径（默认为当前目录）
---

# 目录列表工具

列出指定目录下的所有内容。使用此工具可以帮助你更好地理解项目结构。
