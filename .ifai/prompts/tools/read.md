---
name: agent_read_file
description: Read content from a physical file. 
parameters:
  type: object
  properties:
    rel_path:
      type: string
      description: Relative path to the file
  required:
    - rel_path
---

# Agent Read File Tool

Use this tool to read the full content of a file.

## 🏆 PIVO 3.0 MANDATORY RULES
- **FORBIDDEN**: Never use this tool for files larger than 10KB (e.g. package-lock.json).
- **MANDATORY**: You MUST use \`agent_probe_symbols\` first to understand the structure of any file over 10KB.
- Fail to follow this will result in physical context truncation and analysis failure.
