/**
 * 分类结果徽章组件
 *
 * 显示工具分类结果的视觉徽章
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import type { ClassificationResult } from '@/types/toolClassification';
import {
  getToolCategoryDisplayInfo,
  getLayerDisplayInfo,
  getConfidenceLevel,
  CONFIDENCE_LEVEL_DISPLAY_INFO,
} from '@/types/toolClassification';
import { ToolCategoryIcon } from './ToolCategoryIcon';

interface ClassificationBadgeProps {
  /** 分类结果 */
  result: ClassificationResult;
  /** 是否紧凑模式 */
  compact?: boolean;
  /** 是否显示置信度 */
  showConfidence?: boolean;
  /** 是否显示层级 */
  showLayer?: boolean;
  /** 自定义类名 */
  className?: string;
}

export const ClassificationBadge: React.FC<ClassificationBadgeProps> = ({
  result,
  compact = false,
  showConfidence = true,
  showLayer = false,
  className = '',
}) => {
  const { t, i18n } = useTranslation();
  const categoryInfo = getToolCategoryDisplayInfo(result.category);
  const layerInfo = getLayerDisplayInfo(result.layer);
  const confidenceLevel = getConfidenceLevel(result.confidence);
  const confidenceInfo = CONFIDENCE_LEVEL_DISPLAY_INFO[confidenceLevel];
  const categoryLabel = i18n.language.startsWith('zh') ? categoryInfo.label : categoryInfo.labelEn;
  const layerLabel = t(`toolClassificationHistory.layers.${result.layer}` as any);

  if (compact) {
    return (
      <div
        className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-opacity-10 text-xs font-medium ${className}`}
        style={{
          backgroundColor: `${categoryInfo.color}20`,
          color: categoryInfo.color,
          border: `1px solid ${categoryInfo.color}40`,
        }}
        title={`${categoryLabel} · ${(result.confidence * 100).toFixed(0)}%`}
      >
        <ToolCategoryIcon icon={categoryInfo.icon} className="h-3.5 w-3.5" />
        <span>{categoryLabel}</span>
      </div>
    );
  }

  return (
    <div
      className={`flex items-center gap-2 px-3 py-2 rounded-lg ${className}`}
      style={{
        backgroundColor: `${categoryInfo.color}10`,
        border: `1px solid ${categoryInfo.color}30`,
      }}
    >
      {/* 类别图标和名称 */}
      <div className="flex items-center gap-2">
        <ToolCategoryIcon icon={categoryInfo.icon} className="h-[18px] w-[18px]" />
        <div className="flex flex-col">
          <span className="text-sm font-semibold" style={{ color: categoryInfo.color }}>
            {categoryLabel}
          </span>
        </div>
      </div>

      {/* 分隔线 */}
      <div className="theme-divider h-6 w-px" />

      {/* 层级信息 */}
      {showLayer && (
        <div className="flex items-center gap-1.5">
          <div
            className="w-2 h-2 rounded-full"
            style={{ backgroundColor: layerInfo.color }}
          />
          <span className="theme-text-muted text-xs">
            {layerLabel}
          </span>
        </div>
      )}

      {/* 置信度 */}
      {showConfidence && (
        <div className="flex items-center gap-1.5">
          <div
            className="w-2 h-2 rounded-full"
            style={{ backgroundColor: confidenceInfo.color }}
          />
          <span className="theme-text-subtle text-xs font-mono">
            ({(result.confidence * 100).toFixed(0)}%)
          </span>
        </div>
      )}

      {/* 匹配类型 */}
      {result.matchType && (
        <span className="theme-text-subtle text-xs italic">
          via {result.matchType}
        </span>
      )}
    </div>
  );
};

/**
 * 紧凑模式徽章
 */
export const CompactClassificationBadge: React.FC<
  Omit<ClassificationBadgeProps, 'compact'>
> = (props) => <ClassificationBadge {...props} compact />;

/**
 * 仅类别徽章（不显示置信度和层级）
 */
export const CategoryOnlyBadge: React.FC<
  Omit<ClassificationBadgeProps, 'showConfidence' | 'showLayer'>
> = (props) => (
  <ClassificationBadge {...props} compact showConfidence={false} showLayer={false} />
);

export default ClassificationBadge;
