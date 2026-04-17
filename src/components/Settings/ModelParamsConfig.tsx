import React, { useState } from 'react';
import { Sliders, Zap, Target, Layers } from 'lucide-react';
import { ModelParamsConfig, MODEL_PARAM_PRESETS } from '../../stores/settingsStore';
import clsx from 'clsx';

interface ModelParamsConfigProps {
  config: ModelParamsConfig;
  onChange: (config: ModelParamsConfig) => void;
  showPresets?: boolean;
  compact?: boolean;
}

export const ModelParamsConfigComponent: React.FC<ModelParamsConfigProps> = ({
  config,
  onChange,
  showPresets = true,
  compact = false,
}) => {
  const [advancedMode, setAdvancedMode] = useState(false);

  const handlePresetSelect = (presetName: string) => {
    onChange(MODEL_PARAM_PRESETS[presetName]);
  };

  const handleSliderChange = (key: keyof ModelParamsConfig, value: number) => {
    onChange({ ...config, [key]: value });
  };

  const presets = [
    { name: 'fast', label: '快速', desc: '低温度，适合简单任务' },
    { name: 'balanced', label: '平衡', desc: '平衡速度和质量' },
    { name: 'precise', label: '精确', desc: '高精度，适合复杂任务' },
  ];

  return (
    <div className={clsx("space-y-4", compact ? "text-xs" : "")}>
      {/* 标题 */}
      {!compact && (
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <Sliders size={16} className="theme-text-subtle mr-2" />
            <h4 className="theme-text-muted text-sm font-medium">模型参数配置</h4>
          </div>
          <button
            onClick={() => setAdvancedMode(!advancedMode)}
            className="text-xs text-blue-400 hover:text-blue-300"
          >
            {advancedMode ? '简单模式' : '高级模式'}
          </button>
        </div>
      )}

      {/* 预设选择器 */}
      {showPresets && !advancedMode && (
        <div>
          <label className="theme-text-subtle mb-2 block text-xs">快速预设</label>
          <div className="grid grid-cols-3 gap-2">
            {presets.map((preset) => (
              <button
                key={preset.name}
                onClick={() => handlePresetSelect(preset.name)}
                className={clsx(
                  "px-3 py-2 rounded text-xs transition-colors border",
                  "hover:border-blue-500 hover:bg-blue-900/20",
                  config === MODEL_PARAM_PRESETS[preset.name]
                    ? "border-blue-500 bg-blue-900/30 text-blue-300"
                    : "theme-border theme-text-subtle"
                )}
                title={preset.desc}
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Temperature */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="theme-text-subtle flex items-center text-xs">
            <Zap size={12} className="mr-1" />
            Temperature (温度)
          </label>
          <span className="text-xs font-mono text-blue-400">{config.temperature}</span>
        </div>
        <input
          type="range"
          min="0"
          max="2"
          step="0.1"
          value={config.temperature}
          onChange={(e) => handleSliderChange('temperature', parseFloat(e.target.value))}
          className="theme-input-surface h-2 w-full cursor-pointer appearance-none rounded-lg accent-blue-500"
        />
        <div className="theme-text-subtle mt-1 flex justify-between text-xs">
          <span>精确 (0)</span>
          <span>创造 (2)</span>
        </div>
      </div>

      {/* Top-P */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="theme-text-subtle flex items-center text-xs">
            <Target size={12} className="mr-1" />
            Top-P (核采样)
          </label>
          <span className="text-xs font-mono text-blue-400">{config.top_p}</span>
        </div>
        <input
          type="range"
          min="0"
          max="1"
          step="0.05"
          value={config.top_p}
          onChange={(e) => handleSliderChange('top_p', parseFloat(e.target.value))}
          className="theme-input-surface h-2 w-full cursor-pointer appearance-none rounded-lg accent-blue-500"
        />
        <div className="theme-text-subtle mt-1 flex justify-between text-xs">
          <span>专注 (0)</span>
          <span>多样 (1)</span>
        </div>
      </div>

      {/* Max Tokens */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="theme-text-subtle flex items-center text-xs">
            <Layers size={12} className="mr-1" />
            Max Tokens (最大生成长度)
          </label>
          <span className="text-xs font-mono text-blue-400">{config.max_tokens}</span>
        </div>
        <input
          type="range"
          min="256"
          max="32768"
          step="256"
          value={config.max_tokens}
          onChange={(e) => handleSliderChange('max_tokens', parseInt(e.target.value))}
          className="theme-input-surface h-2 w-full cursor-pointer appearance-none rounded-lg accent-blue-500"
        />
        <div className="theme-text-subtle mt-1 flex justify-between text-xs">
          <span>256</span>
          <span>32K</span>
        </div>
      </div>

      {/* 高级模式：手动输入 */}
      {advancedMode && (
        <div className="theme-panel theme-border grid grid-cols-3 gap-2 rounded border p-3">
          <div>
            <label className="theme-text-subtle mb-1 block text-xs">Temperature</label>
            <input
              type="number"
              min="0"
              max="2"
              step="0.1"
              value={config.temperature}
              onChange={(e) => handleSliderChange('temperature', parseFloat(e.target.value))}
              className="theme-input-surface theme-border theme-text w-full rounded border px-2 py-1 text-xs"
            />
          </div>
          <div>
            <label className="theme-text-subtle mb-1 block text-xs">Top-P</label>
            <input
              type="number"
              min="0"
              max="1"
              step="0.05"
              value={config.top_p}
              onChange={(e) => handleSliderChange('top_p', parseFloat(e.target.value))}
              className="theme-input-surface theme-border theme-text w-full rounded border px-2 py-1 text-xs"
            />
          </div>
          <div>
            <label className="theme-text-subtle mb-1 block text-xs">Max Tokens</label>
            <input
              type="number"
              min="256"
              max="32768"
              step="256"
              value={config.max_tokens}
              onChange={(e) => handleSliderChange('max_tokens', parseInt(e.target.value))}
              className="theme-input-surface theme-border theme-text w-full rounded border px-2 py-1 text-xs"
            />
          </div>
        </div>
      )}
    </div>
  );
};

// 紧凑版本（用于卡片内显示）
export const ModelParamsBadge: React.FC<{ config: ModelParamsConfig }> = ({ config }) => {
  return (
    <div className="theme-text-subtle flex items-center space-x-2 text-xs">
      <span className="theme-input-surface rounded px-2 py-0.5">
        T: {config.temperature}
      </span>
      <span className="theme-input-surface rounded px-2 py-0.5">
        P: {config.top_p}
      </span>
      <span className="theme-input-surface rounded px-2 py-0.5">
        Max: {config.max_tokens >= 1024 ? `${config.max_tokens / 1024}K` : config.max_tokens}
      </span>
    </div>
  );
};
