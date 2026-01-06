/**
 * Proposal Markdown 解析器单元测试（简化版）
 */

import { describe, test, expect } from 'vitest';
import { parseProposalFromMarkdown } from '../../src/utils/proposalMarkdownParser';

describe('Proposal Markdown Parser - Basic', () => {
  test('should parse changeId', () => {
    const markdown = `# 📋 OpenSpec 提案

## 变更ID
\`test-proposal\`

## 提案概述

### 为什么需要这个变更？
测试变更

### 具体变更
- [ ] 变更1

### 影响范围
- **破坏性变更**: 否

## 任务清单

### [task-1] 任务1
**分类**: development
**预估**: 2 小时
**依赖**: 无

测试任务
`;

    const result = parseProposalFromMarkdown(markdown);

    expect(result).not.toBeNull();
    expect(result?.changeId).toBe('test-proposal');
  });

  test('should parse breakingChanges: true', () => {
    const markdown = `# 📋 OpenSpec 提案

## 变更ID
\`test\`

## 提案概述

### 为什么需要这个变更？
测试

### 具体变更
- [ ] 变更1

### 影响范围
- **破坏性变更**: 是

## 任务清单

### [task-1] 任务1
**分类**: development
**预估**: 2 小时
**依赖**: 无

测试
`;

    const result = parseProposalFromMarkdown(markdown);
    console.log('[TEST] Result:', result);

    expect(result).not.toBeNull();
    expect(result?.impact.breakingChanges).toBe(true);
  });

  test('should parse breakingChanges: false', () => {
    const markdown = `# 📋 OpenSpec 提案

## 变更ID
\`test\`

## 提案概述

### 为什么需要这个变更？
测试

### 具体变更
- [ ] 变更1

### 影响范围
- **破坏性变更**: 否

## 任务清单

### [task-1] 任务1
**分类**: development
**预估**: 2 小时
**依赖**: 无

测试
`;

    const result = parseProposalFromMarkdown(markdown);
    console.log('[TEST] Result:', result);

    expect(result).not.toBeNull();
    expect(result?.impact.breakingChanges).toBe(false);
  });

  test('should return null for invalid Markdown', () => {
    const invalidMarkdown = 'This is not a valid proposal';

    const result = parseProposalFromMarkdown(invalidMarkdown);

    expect(result).toBeNull();
  });

  test('should parse tasks', () => {
    const markdown = `# 📋 OpenSpec 提案

## 变更ID
\`test\`

## 提案概述

### 为什么需要这个变更？
测试任务解析

### 具体变更
- [ ] 变更1

### 影响范围
- **破坏性变更**: 否

## 任务清单

### [task-1] 第一个任务
**分类**: development
**预估**: 2 小时
**依赖**: 无

这是第一个任务

### [task-2] 第二个任务
**分类**: development
**预估**: 4 小时
**依赖**: task-1

这是第二个任务
`;

    const result = parseProposalFromMarkdown(markdown);
    console.log('[TEST] Tasks:', result?.tasks);

    expect(result).not.toBeNull();
    expect(result?.tasks).toHaveLength(2);
    expect(result?.tasks[0].id).toBe('task-1');
    expect(result?.tasks[1].dependencies).toEqual(['task-1']);
  });
});
