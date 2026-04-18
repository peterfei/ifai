import React, { useState } from 'react';
import { Sliders, Zap, Target, Layers } from 'lucide-react';
import { ModelParamsConfig, MODEL_PARAM_PRESETS } from '../../stores/settingsStore';
import clsx from 'clsx';
import { useTranslation } from 'react-i18next';

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
  const { t } = useTranslation();
  const [advancedMode, setAdvancedMode] = useState(false);
  const sliderStyle = { accentColor: 'var(--accent-color)' };

  const handlePresetSelect = (presetName: keyof typeof MODEL_PARAM_PRESETS) => {
    onChange(MODEL_PARAM_PRESETS[presetName]);
  };

  const handleSliderChange = (key: keyof ModelParamsConfig, value: number) => {
    onChange({ ...config, [key]: value });
  };

  const presets = ['fast', 'balanced', 'precise'] as const;
  const presetCopy = {
    fast: {
      label: t('modelParamsConfig.presets.fast.label'),
      description: t('modelParamsConfig.presets.fast.description'),
    },
    balanced: {
      label: t('modelParamsConfig.presets.balanced.label'),
      description: t('modelParamsConfig.presets.balanced.description'),
    },
    precise: {
      label: t('modelParamsConfig.presets.precise.label'),
      description: t('modelParamsConfig.presets.precise.description'),
    },
  } as const;

  return (
    <div className={clsx("space-y-4", compact ? "text-xs" : "")}>
      {/* 标题 */}
      {!compact && (
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <Sliders size={16} className="theme-text-subtle mr-2" />
            <h4 className="theme-text-muted text-sm font-medium">{t('settings.modelParams')}</h4>
          </div>
          <button
            onClick={() => setAdvancedMode(!advancedMode)}
            className="theme-button-ghost theme-text-accent rounded px-2 py-1 text-xs"
          >
            {advancedMode ? t('modelParamsConfig.simpleMode') : t('modelParamsConfig.advancedMode')}
          </button>
        </div>
      )}

      {/* 预设选择器 */}
      {showPresets && !advancedMode && (
        <div>
          <label className="theme-text-subtle mb-2 block text-xs">{t('modelParamsConfig.quickPresets')}</label>
          <div className="grid grid-cols-3 gap-2">
            {presets.map((preset) => (
              <button
                key={preset}
                onClick={() => handlePresetSelect(preset)}
                className={clsx(
                  'rounded border px-3 py-2 text-xs transition-colors',
                  config === MODEL_PARAM_PRESETS[preset]
                    ? 'theme-selection-accent'
                    : 'theme-input-surface theme-border theme-soft-hover-accent theme-text-subtle'
                )}
                title={presetCopy[preset].description}
              >
                {presetCopy[preset].label}
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
            {t('settings.temperature')}
          </label>
          <span className="theme-text-accent text-xs font-mono">{config.temperature}</span>
        </div>
        <input
          type="range"
          min="0"
          max="2"
          step="0.1"
          value={config.temperature}
          onChange={(e) => handleSliderChange('temperature', parseFloat(e.target.value))}
          className="theme-input-surface h-2 w-full cursor-pointer appearance-none rounded-lg"
          style={sliderStyle}
        />
        <div className="theme-text-subtle mt-1 flex justify-between text-xs">
          <span>{t('modelParamsConfig.temperatureRange.low')}</span>
          <span>{t('modelParamsConfig.temperatureRange.high')}</span>
        </div>
      </div>

      {/* Top-P */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="theme-text-subtle flex items-center text-xs">
            <Target size={12} className="mr-1" />
            {t('settings.topP')}
          </label>
          <span className="theme-text-accent text-xs font-mono">{config.top_p}</span>
        </div>
        <input
          type="range"
          min="0"
          max="1"
          step="0.05"
          value={config.top_p}
          onChange={(e) => handleSliderChange('top_p', parseFloat(e.target.value))}
          className="theme-input-surface h-2 w-full cursor-pointer appearance-none rounded-lg"
          style={sliderStyle}
        />
        <div className="theme-text-subtle mt-1 flex justify-between text-xs">
          <span>{t('modelParamsConfig.topPRange.low')}</span>
          <span>{t('modelParamsConfig.topPRange.high')}</span>
        </div>
      </div>

      {/* Max Tokens */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="theme-text-subtle flex items-center text-xs">
            <Layers size={12} className="mr-1" />
            {t('settings.maxTokens')}
          </label>
          <span className="theme-text-accent text-xs font-mono">{config.max_tokens}</span>
        </div>
        <input
          type="range"
          min="256"
          max="32768"
          step="256"
          value={config.max_tokens}
          onChange={(e) => handleSliderChange('max_tokens', parseInt(e.target.value))}
          className="theme-input-surface h-2 w-full cursor-pointer appearance-none rounded-lg"
          style={sliderStyle}
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
            <label className="theme-text-subtle mb-1 block text-xs">{t('settings.temperature')}</label>
            <input
              type="number"
              min="0"
              max="2"
              step="0.1"
              value={config.temperature}
              onChange={(e) => handleSliderChange('temperature', parseFloat(e.target.value))}
              className="theme-input-surface theme-border theme-focus-accent theme-text w-full rounded border px-2 py-1 text-xs"
            />
          </div>
          <div>
            <label className="theme-text-subtle mb-1 block text-xs">{t('settings.topP')}</label>
            <input
              type="number"
              min="0"
              max="1"
              step="0.05"
              value={config.top_p}
              onChange={(e) => handleSliderChange('top_p', parseFloat(e.target.value))}
              className="theme-input-surface theme-border theme-focus-accent theme-text w-full rounded border px-2 py-1 text-xs"
            />
          </div>
          <div>
            <label className="theme-text-subtle mb-1 block text-xs">{t('settings.maxTokens')}</label>
            <input
              type="number"
              min="256"
              max="32768"
              step="256"
              value={config.max_tokens}
              onChange={(e) => handleSliderChange('max_tokens', parseInt(e.target.value))}
              className="theme-input-surface theme-border theme-focus-accent theme-text w-full rounded border px-2 py-1 text-xs"
            />
          </div>
        </div>
      )}
    </div>
  );
};

// 紧凑版本（用于卡片内显示）
export const ModelParamsBadge: React.FC<{ config: ModelParamsConfig }> = ({ config }) => {
  const { t } = useTranslation();

  return (
    <div className="theme-text-subtle flex items-center space-x-2 text-xs">
      <span className="theme-input-surface rounded px-2 py-0.5">
        {t('modelParamsConfig.badge.temperature')}: {config.temperature}
      </span>
      <span className="theme-input-surface rounded px-2 py-0.5">
        {t('modelParamsConfig.badge.topP')}: {config.top_p}
      </span>
      <span className="theme-input-surface rounded px-2 py-0.5">
        {t('modelParamsConfig.badge.maxTokens')}: {config.max_tokens >= 1024 ? `${config.max_tokens / 1024}K` : config.max_tokens}
      </span>
    </div>
  );
};
