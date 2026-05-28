/**
 * InteractionCard — 交互问答卡片（消息流内嵌式）
 *
 * 嵌入在 Chat 消息流中的交互问答卡片：
 * - 顶部标签："💬 LLM 提问"
 * - 标题 + 问题描述
 * - 单问题模式：Radio 圆圈 + 选项列表
 * - 多问题模式：每个问题独立选项组 + 统一确认按钮
 * - 标签颜色：brand/emerald/amber/red
 *
 * 数据格式：统一使用 `questions` 数组，单问题 = questions.length === 1。
 */

import React, { useState } from 'react';
import { Check, ChevronRight } from 'lucide-react';
import type { MessageCardProps } from '../MessageCardRegistry';
import { AGENT_DOT_CONFIG } from '../../../types/agent-collaboration';

import '../../../gui/conversation/styles/card-animations.css';

/* ===== 选项类型 ===== */

interface OptionItem {
  id: string;
  label: string;
  desc: string;
  tag?: string;
  tagColor?: string;
}

interface QuestionItem {
  id: string;
  type: 'single' | 'multiple';
  question: string;
  compactAsk?: string;
  options: OptionItem[];
}

interface InteractionCardData {
  type: 'single' | 'multiple';
  title: string;
  questions: QuestionItem[];
  onSelect?: string;
}

/* ===== 标签颜色配置 ===== */

const TAG_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  brand:   { bg: 'rgba(0, 122, 204, 0.15)', text: '#007acc', border: 'rgba(0, 122, 204, 0.25)' },
  emerald: { bg: 'rgba(16, 185, 129, 0.15)', text: '#10B981', border: 'rgba(16, 185, 129, 0.25)' },
  amber:   { bg: 'rgba(245, 158, 11, 0.15)', text: '#F59E0B', border: 'rgba(245, 158, 11, 0.25)' },
  red:     { bg: 'rgba(239, 68, 68, 0.15)', text: '#EF4444', border: 'rgba(239, 68, 68, 0.25)' },
  default: { bg: 'rgba(107, 114, 128, 0.15)', text: '#9CA3AF', border: 'rgba(107, 114, 128, 0.25)' },
};

/* ===== 子组件：选项组 ===== */

function OptionGroup({
  question,
  selectedIds,
  resolved,
  onSelect,
}: {
  question: QuestionItem;
  selectedIds: Set<string>;
  resolved: boolean;
  onSelect: (optionId: string) => void;
}) {
  const isSingle = question.type === 'single';

  return (
    <div className="space-y-2">
      {question.options.map((option) => {
        const isSelected = selectedIds.has(option.id);
        const tagColorConfig = TAG_COLORS[option.tagColor || 'default'] || TAG_COLORS.default;

        return (
          <div
            key={option.id}
            onClick={() => !resolved && onSelect(option.id)}
            className={`px-3 py-2.5 rounded-lg border transition-all duration-200 cursor-pointer ${
              isSelected
                ? 'border-blue-500/50 bg-blue-500/10 animate-option-highlight'
                : 'border-white/5 bg-white/[0.02] hover:border-white/10 hover:bg-white/[0.04]'
            } ${resolved ? 'cursor-not-allowed opacity-50' : ''}`}
            style={{
              transform: isSelected && !resolved ? 'scale(1.01)' : 'scale(1)',
            }}
          >
            <div className="flex items-start gap-3">
              {/* 单选/多选图标 */}
              {isSingle ? (
                <div
                  className={`w-4 h-4 rounded-full border-2 flex-shrink-0 mt-0.5 flex items-center justify-center transition-all duration-200 ${
                    isSelected ? 'border-blue-500 bg-blue-500' : 'border-gray-500'
                  }`}
                >
                  {isSelected && <div className="w-2 h-2 rounded-full bg-white" />}
                </div>
              ) : (
                <div
                  className={`w-4 h-4 rounded border-2 flex-shrink-0 mt-0.5 flex items-center justify-center transition-all duration-200 ${
                    isSelected ? 'border-blue-500 bg-blue-500' : 'border-gray-500'
                  }`}
                >
                  {isSelected && <Check className="w-3 h-3 text-white" />}
                </div>
              )}

              {/* 选项内容 */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm font-medium text-gray-200">{option.label}</span>
                  {option.tag && (
                    <span
                      className="px-1.5 py-0.5 rounded text-[9px] font-medium"
                      style={{
                        backgroundColor: tagColorConfig.bg,
                        color: tagColorConfig.text,
                        border: '1px solid ' + tagColorConfig.border,
                      }}
                    >
                      {option.tag}
                    </span>
                  )}
                </div>
                {option.desc && (
                  <p className="text-[11px] text-gray-500 leading-relaxed">{option.desc}</p>
                )}
              </div>

              {/* 已选标记 */}
              {resolved && isSelected && (
                <Check className="w-4 h-4 text-green-500 flex-shrink-0" />
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ===== 主组件 ===== */

export function InteractionCard({ message, compact, onAction }: MessageCardProps) {
  const data = message.data as InteractionCardData;
  const [selectedMap, setSelectedMap] = useState<Map<string, Set<string>>>(new Map());
  const [resolved, setResolved] = useState(false);

  const isSingleQuestion = data.questions.length === 1;
  const primaryQuestion = data.questions[0];
  const allSelected = Array.from(selectedMap.values()).some(s => s.size > 0);

  const handleOptionClick = (questionId: string, optionId: string) => {
    if (resolved) return;

    const prev = selectedMap.get(questionId) || new Set<string>();
    const question = data.questions.find(q => q.id === questionId);
    if (!question) return;

    const next = new Map(selectedMap);
    if (question.type === 'single') {
      // 单选：替换选中
      next.set(questionId, new Set([optionId]));
      setSelectedMap(next);

      // 单问题+单选模式：800ms 自动确认
      if (isSingleQuestion && question.type === 'single') {
        setTimeout(() => {
          setResolved(true);
          const questionAnswers = [{ questionId, selectedIds: [optionId] }];
          onAction?.('confirm', { questionAnswers, action: data.onSelect });
        }, 800);
      }
    } else {
      // 多选：切换
      const updated = new Set(prev);
      if (updated.has(optionId)) updated.delete(optionId);
      else updated.add(optionId);
      next.set(questionId, updated);
      setSelectedMap(next);
    }
  };

  const handleConfirm = () => {
    if (resolved) return;
    setResolved(true);

    const questionAnswers = data.questions.map(q => ({
      questionId: q.id,
      selectedIds: Array.from(selectedMap.get(q.id) || []),
    }));

    onAction?.('confirm', { questionAnswers, action: data.onSelect });
  };

  const hasMultipleType = data.questions.some(q => q.type === 'multiple');
  const pmConfig = AGENT_DOT_CONFIG.PM;

  return (
    <div
      className="rounded-lg border overflow-hidden transition-all duration-300 animate-interaction-slide"
      style={{
        backgroundColor: 'rgba(30, 30, 40, 0.9)',
        borderColor: 'rgba(0, 122, 204, 0.15)',
        borderLeftWidth: '3px',
        borderLeftColor: '#007acc',
        fontSize: compact ? '12px' : '14px',
      }}
    >
      {/* 顶部标签 */}
      <div className="px-3 py-2 border-b border-white/5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          {/* PM 头像 */}
          <div
            className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold flex-shrink-0"
            style={{
              background: `linear-gradient(135deg, #007acc, #005999)`,
              color: '#fff',
            }}
          >
            {pmConfig.label}
          </div>
          <div
            className="px-2 py-0.5 rounded-full text-[10px] font-medium flex items-center gap-1"
            style={{
              backgroundColor: 'rgba(0, 122, 204, 0.15)',
              color: '#007acc',
              border: '1px solid rgba(0, 122, 204, 0.25)',
            }}
          >
            <span>💬</span>
            <span>LLM 提问</span>
          </div>
        </div>
      </div>

      {/* 标题行 */}
      <div className="px-3 py-2 flex items-start gap-2">
        <ChevronRight className="w-4 h-4 mt-0.5 text-gray-400 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <h4 className="text-white font-semibold text-sm">{data.title}</h4>
        </div>
      </div>

      {/* 问题列表 */}
      <div className="px-3 pb-3 space-y-4">
        {data.questions.map((question) => (
          <div key={question.id}>
            {/* 问题描述 */}
            {question.question && (
              <p className="text-gray-400 text-xs leading-relaxed mb-2">{question.question}</p>
            )}
            {/* 选项组 */}
            <div className="space-y-2">
              {question.options.map((option) => {
                const selectedIds = selectedMap.get(question.id) || new Set<string>();
                const isSelected = selectedIds.has(option.id);
                const tagColorConfig = TAG_COLORS[option.tagColor || 'default'] || TAG_COLORS.default;

                return (
                  <div
                    key={option.id}
                    onClick={() => handleOptionClick(question.id, option.id)}
                    className={`px-3 py-2.5 rounded-lg border transition-all duration-200 cursor-pointer ${
                      isSelected
                        ? 'border-blue-500/50 bg-blue-500/10 animate-option-highlight'
                        : 'border-white/5 bg-white/[0.02] hover:border-white/10 hover:bg-white/[0.04]'
                    } ${resolved ? 'cursor-not-allowed opacity-50' : ''}`}
                    style={{
                      transform: isSelected && !resolved ? 'scale(1.01)' : 'scale(1)',
                    }}
                  >
                    <div className="flex items-start gap-3">
                      {/* 单选/多选图标 */}
                      {question.type === 'single' ? (
                        <div
                          className={`w-4 h-4 rounded-full border-2 flex-shrink-0 mt-0.5 flex items-center justify-center transition-all duration-200 ${
                            isSelected ? 'border-blue-500 bg-blue-500' : 'border-gray-500'
                          }`}
                        >
                          {isSelected && <div className="w-2 h-2 rounded-full bg-white" />}
                        </div>
                      ) : (
                        <div
                          className={`w-4 h-4 rounded border-2 flex-shrink-0 mt-0.5 flex items-center justify-center transition-all duration-200 ${
                            isSelected ? 'border-blue-500 bg-blue-500' : 'border-gray-500'
                          }`}
                        >
                          {isSelected && <Check className="w-3 h-3 text-white" />}
                        </div>
                      )}

                      {/* 选项内容 */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-sm font-medium text-gray-200">{option.label}</span>
                          {option.tag && (
                            <span
                              className="px-1.5 py-0.5 rounded text-[9px] font-medium"
                              style={{
                                backgroundColor: tagColorConfig.bg,
                                color: tagColorConfig.text,
                                border: '1px solid ' + tagColorConfig.border,
                              }}
                            >
                              {option.tag}
                            </span>
                          )}
                        </div>
                        {option.desc && (
                          <p className="text-[11px] text-gray-500 leading-relaxed">{option.desc}</p>
                        )}
                      </div>

                      {/* 已选标记 */}
                      {resolved && isSelected && (
                        <Check className="w-4 h-4 text-green-500 flex-shrink-0" />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* 确认按钮：多选模式或多问题时显示 */}
      {(hasMultipleType || data.questions.length > 1) && (
        <div className="px-3 pb-3">
          <button
            onClick={handleConfirm}
            disabled={!allSelected || resolved}
            className="w-full px-4 py-2.5 rounded-lg text-[11px] font-semibold text-white transition-all duration-200 flex items-center justify-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
            style={{
              background: resolved
                ? '#10B981'
                : 'linear-gradient(135deg, #007acc, #0088ff)',
              boxShadow: '0 2px 8px rgba(0, 122, 204, 0.25), 0 0 16px rgba(0, 122, 204, 0.1)',
            }}
          >
            {resolved ? (
              <>
                <Check className="w-3.5 h-3.5" />
                <span>已确认</span>
              </>
            ) : (
              <>
                <Check className="w-3.5 h-3.5" />
                <span>确认选择 ({Array.from(selectedMap.values()).reduce((sum, s) => sum + s.size, 0)})</span>
              </>
            )}
          </button>
        </div>
      )}

      {/* 底部等待提示 */}
      {!resolved && (
        <div className="px-3 pb-2 flex items-center gap-2">
          <div className="w-1 h-1 rounded-full bg-blue-400/80 animate-progress-pulse"></div>
          <span className="text-[10px] text-blue-400/60">
            {isSingleQuestion && primaryQuestion.type === 'single'
              ? '请选择一个选项...'
              : '请勾选选项后确认...'}
          </span>
        </div>
      )}
    </div>
  );
}
