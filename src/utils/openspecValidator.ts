/**
 * OpenSpec 提案验证器
 * v0.2.6 新增
 *
 * 提供提案验证功能，不依赖外部 OpenSpec CLI
 */

import { invoke } from '@tauri-apps/api/core';
import { OpenSpecProposal } from '../types/proposal';

/**
 * 验证结果
 */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * 验证提案结构
 */
export async function validateProposalStructure(proposal: OpenSpecProposal): Promise<ValidationResult> {
  const errors: string[] = [];
  const warnings: string[] = [];

  // 验证基本字段
  if (!proposal.id || proposal.id.trim() === '') {
    errors.push('提案 ID 不能为空');
  }

  if (!proposal.why || proposal.why.trim() === '') {
    errors.push('Why 字段不能为空');
  }

  if (!proposal.whatChanges || proposal.whatChanges.length === 0) {
    errors.push('What Changes 不能为空');
  }

  // 验证影响范围
  if (!proposal.impact) {
    errors.push('Impact 字段不能为空');
  } else {
    if (!proposal.impact.specs || proposal.impact.specs.length === 0) {
      warnings.push('未指定受影响的 specs');
    }
    if (!proposal.impact.files || proposal.impact.files.length === 0) {
      warnings.push('未估计受影响的文件');
    }
  }

  // 验证任务
  if (!proposal.tasks || proposal.tasks.length === 0) {
    warnings.push('提案没有定义任务');
  } else {
    proposal.tasks.forEach((task, index) => {
      if (!task.id) {
        errors.push(`任务 ${index + 1} 缺少 ID`);
      }
      if (!task.title) {
        errors.push(`任务 ${index + 1} 缺少标题`);
      }
      if (!task.description) {
        warnings.push(`任务 ${index + 1} 缺少描述`);
      }
      if (!task.category || !['development', 'testing', 'documentation'].includes(task.category)) {
        errors.push(`任务 ${index + 1} 的类别无效`);
      }
      if (task.estimatedHours <= 0) {
        errors.push(`任务 ${index + 1} 的预估时间必须大于 0`);
      }
    });
  }

  // 验证 spec deltas
  if (!proposal.specDeltas || proposal.specDeltas.length === 0) {
    warnings.push('提案没有定义 spec deltas');
  } else {
    proposal.specDeltas.forEach((delta, index) => {
      if (!delta.capability) {
        errors.push(`Spec Delta ${index + 1} 缺少 capability 名称`);
      }
      if (!delta.type || !['ADDED', 'MODIFIED', 'REMOVED'].includes(delta.type)) {
        errors.push(`Spec Delta ${index + 1} 的类型无效`);
      }
      if (!delta.content) {
        errors.push(`Spec Delta ${index + 1} 缺少内容`);
      }
      if (delta.type === 'ADDED' || delta.type === 'MODIFIED') {
        if (!delta.scenarios || delta.scenarios.length === 0) {
          warnings.push(`Spec Delta ${index + 1} 缺少场景定义`);
        }
      }
    });
  }

  // 验证状态和位置的一致性
  if (proposal.status === 'draft' && proposal.location !== 'proposals') {
    warnings.push('草稿状态的提案应该在 proposals 目录中');
  }
  if (proposal.status === 'approved' && proposal.location !== 'changes') {
    warnings.push('已批准的提案应该在 changes 目录中');
  }
  if (proposal.status === 'archived' && proposal.location !== 'archive') {
    warnings.push('已归档的提案应该在 archive 目录中');
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * 验证提案文件（使用 OpenSpec CLI 或内置验证器）
 */
export async function validateProposal(proposalPath: string): Promise<ValidationResult> {
  // 首先检测 OpenSpec CLI 是否安装
  const openspecStatus = await invoke('detect_openspec_cli') as {
    installed: boolean;
    version?: string;
  };

  if (openspecStatus.installed) {
    // 使用外部 OpenSpec CLI 验证
    return await validateWithCLI(proposalPath);
  } else {
    // 使用内置验证器
    return await validateInternal(proposalPath);
  }
}

/**
 * 使用 OpenSpec CLI 验证提案
 */
async function validateWithCLI(proposalPath: string): Promise<ValidationResult> {
  try {
    // 注意：这里需要调用后端的 OpenSpec CLI 包装器
    // 目前先使用内置验证器作为降级方案
    console.log('[OpenSpec Validator] CLI detected, but using built-in validator for now');
    return await validateInternal(proposalPath);
  } catch (e) {
    return {
      valid: false,
      errors: [`OpenSpec CLI 验证失败: ${e}`],
      warnings: [],
    };
  }
}

/**
 * 内置验证器（不依赖外部 CLI）
 */
async function validateInternal(proposalPath: string): Promise<ValidationResult> {
  // 这里实现基本的文件结构验证
  const errors: string[] = [];
  const warnings: string[] = [];

  // TODO: 实现文件结构验证
  // 1. 检查必需文件是否存在（proposal.md, tasks.md, metadata.json）
  // 2. 检查文件格式是否正确
  // 3. 检查 Markdown 格式

  warnings.push('使用内置验证器，建议安装 OpenSpec CLI 以获得更严格的验证');

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * 生成唯一提案 ID
 */
export function generateProposalId(description: string): string {
  // 提取关键词
  const keywords = description
    .toLowerCase()
    .replace(/[^\u4e00-\u9fa5a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter((w) => w.length > 1)
    .slice(0, 3);

  const slug = keywords.join('-') || 'proposal';
  const timestamp = Date.now().toString(36);

  return `${slug}-${timestamp}`;
}

/**
 * 验证 Markdown 格式（基础）
 */
export function validateMarkdownFormat(content: string): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // 检查是否为空
  if (!content || content.trim() === '') {
    errors.push('Markdown 内容不能为空');
  }

  // 检查标题格式
  const lines = content.split('\n');
  let hasTitle = false;

  for (const line of lines) {
    if (line.startsWith('# ')) {
      hasTitle = true;
      break;
    }
  }

  if (!hasTitle) {
    warnings.push('Markdown 文件缺少一级标题');
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}
