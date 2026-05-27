/**
 * CardPreviewPanel — 高保真卡片预览面板
 *
 * 将所有 7 种 MessageCard 注入 chatStore，在真实消息流中渲染验证。
 * 仅用于开发阶段的 E2E 视觉验证。
 *
 * 使用方式：
 * 1. 在标题栏切换到 conversation 模式
 * 2. 点击底部的 "卡片预览" 按钮
 * 3. 所有卡片类型会注入消息流中展示
 */

import React, { useCallback } from 'react';
import { useChatStore } from '../../stores/chat/CoreStoreProxy';
import {
  MOCK_APPROVAL_DATA,
  MOCK_APPROVAL_DATA_HIGH_RISK,
  MOCK_INTERACTION_DATA_SINGLE,
  MOCK_INTERACTION_DATA_MULTIPLE,
  MOCK_FILE_CHANGE_DATA,
  MOCK_FILE_CHANGE_MODIFY,
  MOCK_TOOL_CALL_DATA,
  MOCK_TOOL_CALL_RUNNING,
  MOCK_ERROR_FIX_DATA,
  MOCK_ERROR_FIX_WARNING,
  MOCK_COMPOSER_DATA,
  MOCK_COMPOSER_DONE,
  MOCK_TASK_DATA,
} from './WORKFLOW_DSL';

/* ===== 消息工厂 ===== */

let mockIdCounter = 0;
function nextId() {
  return `mock-card-${++mockIdCounter}`;
}

function makeMessage(cardType: string, data: any, extra?: Record<string, any>) {
  return {
    id: nextId(),
    role: 'assistant' as const,
    content: '',
    timestamp: Date.now(),
    cardType,
    data,
    ...extra,
  };
}

/* ===== 全套 Mock 消息 ===== */

function createAllMockMessages() {
  return [
    // 分隔文本消息
    {
      id: nextId(),
      role: 'user' as const,
      content: '开始卡片预览 — 以下展示所有 7 种卡片类型',
      timestamp: Date.now(),
    },

    // 1. ProgressCard
    makeMessage('progress', {
      title: MOCK_TASK_DATA.title,
      agentId: MOCK_TASK_DATA.activeAgent,
      progress: MOCK_TASK_DATA.progress,
    }),

    // 2. ApprovalCard（中风险）
    makeMessage('approval', {
      title: MOCK_APPROVAL_DATA.title,
      description: MOCK_APPROVAL_DATA.description,
      overallRisk: MOCK_APPROVAL_DATA.overallRisk,
      files: MOCK_APPROVAL_DATA.files,
      onApprove: MOCK_APPROVAL_DATA.onApprove,
      onReject: MOCK_APPROVAL_DATA.onReject,
    }),

    // 3. ApprovalCard（高风险）
    makeMessage('approval', {
      title: MOCK_APPROVAL_DATA_HIGH_RISK.title,
      description: MOCK_APPROVAL_DATA_HIGH_RISK.description,
      overallRisk: MOCK_APPROVAL_DATA_HIGH_RISK.overallRisk,
      files: MOCK_APPROVAL_DATA_HIGH_RISK.files,
      onApprove: MOCK_APPROVAL_DATA_HIGH_RISK.onApprove,
      onReject: MOCK_APPROVAL_DATA_HIGH_RISK.onReject,
    }),

    // 4. InteractionCard（单选）
    makeMessage('interaction', {
      type: MOCK_INTERACTION_DATA_SINGLE.type,
      title: MOCK_INTERACTION_DATA_SINGLE.title,
      questions: MOCK_INTERACTION_DATA_SINGLE.questions,
      onSelect: MOCK_INTERACTION_DATA_SINGLE.onSelect,
    }),

    // 5. InteractionCard（多选）
    makeMessage('interaction', {
      type: MOCK_INTERACTION_DATA_MULTIPLE.type,
      title: MOCK_INTERACTION_DATA_MULTIPLE.title,
      questions: MOCK_INTERACTION_DATA_MULTIPLE.questions,
      onSelect: MOCK_INTERACTION_DATA_MULTIPLE.onSelect,
    }),

    // 6. FileChangeCard（新建）
    makeMessage('file-change', {
      path: MOCK_FILE_CHANGE_DATA.path,
      change: MOCK_FILE_CHANGE_DATA.change,
      language: MOCK_FILE_CHANGE_DATA.language,
    }),

    // 7. FileChangeCard（修改）
    makeMessage('file-change', {
      path: MOCK_FILE_CHANGE_MODIFY.path,
      change: MOCK_FILE_CHANGE_MODIFY.change,
      language: MOCK_FILE_CHANGE_MODIFY.language,
    }),

    // 8. ToolCallCard（成功）
    makeMessage('tool-call', {
      name: MOCK_TOOL_CALL_DATA.name,
      description: MOCK_TOOL_CALL_DATA.description,
      status: MOCK_TOOL_CALL_DATA.status,
      args: MOCK_TOOL_CALL_DATA.args,
      result: MOCK_TOOL_CALL_DATA.result,
      duration: MOCK_TOOL_CALL_DATA.duration,
    }),

    // 9. ToolCallCard（运行中）
    makeMessage('tool-call', {
      name: MOCK_TOOL_CALL_RUNNING.name,
      description: MOCK_TOOL_CALL_RUNNING.description,
      status: MOCK_TOOL_CALL_RUNNING.status,
      args: MOCK_TOOL_CALL_RUNNING.args,
    }),

    // 10. ErrorFixCard（错误）
    makeMessage('error-fix', {
      message: MOCK_ERROR_FIX_DATA.message,
      severity: MOCK_ERROR_FIX_DATA.severity,
      location: MOCK_ERROR_FIX_DATA.location,
      suggestions: MOCK_ERROR_FIX_DATA.suggestions,
    }),

    // 11. ErrorFixCard（警告，已自动修复）
    makeMessage('error-fix', {
      message: MOCK_ERROR_FIX_WARNING.message,
      severity: MOCK_ERROR_FIX_WARNING.severity,
      location: MOCK_ERROR_FIX_WARNING.location,
      suggestions: MOCK_ERROR_FIX_WARNING.suggestions,
      autoFixed: MOCK_ERROR_FIX_WARNING.autoFixed,
    }),

    // 12. ComposerCard（审查中）
    makeMessage('composer', {
      title: MOCK_COMPOSER_DATA.title,
      status: MOCK_COMPOSER_DATA.status,
      files: MOCK_COMPOSER_DATA.files,
      stats: MOCK_COMPOSER_DATA.stats,
      actions: MOCK_COMPOSER_DATA.actions,
    }),

    // 13. ComposerCard（已完成）
    makeMessage('composer', {
      title: MOCK_COMPOSER_DONE.title,
      status: MOCK_COMPOSER_DONE.status,
      files: MOCK_COMPOSER_DONE.files,
      stats: MOCK_COMPOSER_DONE.stats,
    }),

    // 结束文本消息
    {
      id: nextId(),
      role: 'assistant' as const,
      content: '以上展示了所有 7 种卡片类型的渲染效果。每种卡片包含不同状态变体。',
      timestamp: Date.now(),
    },
  ];
}

/* ===== 主组件 ===== */

export function CardPreviewPanel() {
  const addMessage = useChatStore((state) => state?.addMessage);
  const clearMessages = useChatStore((state) => state?.clearMessages);

  const handleInject = useCallback(() => {
    if (!addMessage) return;

    // 清空现有消息后注入所有 mock 消息
    if (clearMessages) {
      clearMessages();
    }

    const messages = createAllMockMessages();
    for (const msg of messages) {
      addMessage(msg);
    }
  }, [addMessage, clearMessages]);

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 80,
        right: 20,
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      <button
        onClick={handleInject}
        style={{
          padding: '8px 16px',
          borderRadius: 8,
          border: '1px solid rgba(0, 122, 204, 0.3)',
          background: 'linear-gradient(135deg, #007acc, #0088ff)',
          color: 'white',
          fontSize: 12,
          fontWeight: 600,
          cursor: 'pointer',
          boxShadow: '0 2px 12px rgba(0, 122, 204, 0.3)',
          transition: 'all 0.2s ease',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = 'scale(1.05)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = 'scale(1)';
        }}
        data-testid="card-preview-inject"
      >
        注入全部卡片预览
      </button>
    </div>
  );
}
