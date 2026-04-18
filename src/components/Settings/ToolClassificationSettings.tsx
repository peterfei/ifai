/**
 * 工具分类设置页面
 *
 * v0.3.3 新增：配置工具分类系统
 */

import React from 'react';
import { useSettingsStore } from '../../stores/settingsStore';
import { Zap, Target, AlertCircle, Eye } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { formatKeybinding } from '../../utils/keyboard';

export const ToolClassificationSettings: React.FC = () => {
  const { t } = useTranslation();
  const settings = useSettingsStore();
  const debugShortcut = formatKeybinding('Mod+Shift+d');

  return (
    <div className="space-y-6">
      {/* 头部说明 */}
      <div className="theme-surface-info theme-border rounded border px-4 py-3">
        <div className="flex items-start gap-2">
          <Zap className="theme-text-info mt-0.5 h-5 w-5 flex-shrink-0" />
          <div className="text-sm">
            <p className="theme-text-info mb-1 font-medium">{t('toolClassificationSettings.summaryTitle')}</p>
            <p className="theme-text-subtle text-xs">
              {t('toolClassificationSettings.summaryDescription')}
            </p>
          </div>
        </div>
      </div>

      {/* 基础设置 */}
      <div>
        <h3 className="theme-text-muted mb-4 text-sm font-bold">{t('toolClassificationSettings.basic')}</h3>

        {/* 启用工具分类 */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex-1">
            <label className="theme-text-muted flex items-center gap-2 text-sm font-medium">
              <Zap className="w-4 h-4" />
              {t('toolClassificationSettings.enable')}
            </label>
            <p className="theme-text-subtle ml-6 mt-1 text-xs">
              {t('toolClassificationSettings.enableDescription')}
            </p>
          </div>
          <input
            type="checkbox"
            checked={settings.toolClassificationEnabled}
            onChange={(e) => settings.updateSettings({
              toolClassificationEnabled: e.target.checked
            })}
            className="theme-checkbox-input theme-focus-ring-accent h-4 w-4 rounded"
          />
        </div>

        {/* 显示分类指示器 */}
        <div className="flex items-center justify-between">
          <div className="flex-1">
            <label className="theme-text-muted flex items-center gap-2 text-sm font-medium">
              <Eye className="w-4 h-4" />
              {t('toolClassificationSettings.showIndicator')}
            </label>
            <p className="theme-text-subtle ml-6 mt-1 text-xs">
              {t('toolClassificationSettings.showIndicatorDescription')}
            </p>
          </div>
          <input
            type="checkbox"
            checked={settings.showToolClassificationIndicator}
            onChange={(e) => settings.updateSettings({
              showToolClassificationIndicator: e.target.checked
            })}
            className="theme-checkbox-input theme-focus-ring-accent h-4 w-4 rounded"
          />
        </div>
      </div>

      {/* 分类行为设置 */}
      {settings.toolClassificationEnabled && (
        <div className="theme-border border-t pt-6">
          <h3 className="theme-text-muted mb-4 text-sm font-bold">{t('toolClassificationSettings.behavior')}</h3>

          {/* 置信度阈值 */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-2">
              <label className="theme-text-muted flex items-center gap-2 text-sm font-medium">
                <Target className="w-4 h-4" />
                {t('toolClassificationSettings.confidenceThreshold')}
              </label>
              <span className="theme-text-subtle font-mono text-sm">
                {(settings.toolClassificationConfidenceThreshold * 100).toFixed(0)}%
              </span>
            </div>
            <input
              type="range"
              min="0.5"
              max="0.95"
              step="0.05"
              value={settings.toolClassificationConfidenceThreshold}
              onChange={(e) => settings.updateSettings({
                toolClassificationConfidenceThreshold: parseFloat(e.target.value)
              })}
              className="theme-input-surface h-2 w-full cursor-pointer appearance-none rounded-lg"
              style={{ accentColor: 'var(--accent-color)' }}
            />
            <div className="theme-text-subtle mt-1 flex justify-between text-xs">
              <span>{t('toolClassificationSettings.confidenceLoose')}</span>
              <span>{t('toolClassificationSettings.confidenceStrict')}</span>
            </div>
            <p className="theme-text-subtle mt-2 text-xs">
              {t('toolClassificationSettings.confidenceDescription')}
            </p>
          </div>

          {/* 回退策略 */}
          <div>
            <label className="theme-text-muted mb-2 flex items-center gap-2 text-sm font-medium">
              <AlertCircle className="w-4 h-4" />
              {t('toolClassificationSettings.fallbackStrategy')}
            </label>
            <select
              value={settings.toolClassificationFallbackStrategy}
              onChange={(e) => settings.updateSettings({
                toolClassificationFallbackStrategy: e.target.value as any
              })}
              className="theme-input-surface theme-border theme-text theme-focus-accent w-full rounded border px-3 py-2 text-sm"
            >
              <option value="always">{t('toolClassificationSettings.fallbackAlways')}</option>
              <option value="on-low-confidence">{t('toolClassificationSettings.fallbackOnLowConfidence')}</option>
              <option value="never">{t('toolClassificationSettings.fallbackNever')}</option>
            </select>
            <p className="theme-text-subtle mt-2 text-xs">
              {
                settings.toolClassificationFallbackStrategy === 'always'
                  ? t('toolClassificationSettings.fallbackAlwaysDescription')
                  : settings.toolClassificationFallbackStrategy === 'on-low-confidence'
                  ? t('toolClassificationSettings.fallbackOnLowConfidenceDescription')
                  : t('toolClassificationSettings.fallbackNeverDescription')
              }
            </p>
          </div>
        </div>
      )}

      {/* 性能信息 */}
      <div className="theme-panel-muted theme-border rounded border px-4 py-3">
        <h4 className="theme-text-subtle mb-2 text-xs font-bold uppercase tracking-wider">{t('toolClassificationSettings.performanceReference')}</h4>
        <div className="grid grid-cols-1 gap-3 text-xs sm:grid-cols-3">
          <div className="theme-surface-success rounded-lg p-3">
            <div className="theme-text-success font-medium">{t('toolClassificationSettings.layer1')}</div>
            <div className="theme-text-subtle">&lt;1ms</div>
          </div>
          <div className="theme-surface-info rounded-lg p-3">
            <div className="theme-text-info font-medium">{t('toolClassificationSettings.layer2')}</div>
            <div className="theme-text-subtle">~5ms</div>
          </div>
          <div className="theme-surface-warning rounded-lg p-3">
            <div className="theme-text-warning font-medium">{t('toolClassificationSettings.layer3')}</div>
            <div className="theme-text-subtle">~200ms</div>
          </div>
        </div>
      </div>

      {/* 测试按钮 */}
      <div className="theme-border border-t pt-4">
        <button
          onClick={() => {
            // 触发快捷键打开测试页面
            window.dispatchEvent(new KeyboardEvent('keydown', {
              key: 'd',
              metaKey: true,
              shiftKey: true,
              ctrlKey: true,
            }));
          }}
          className="theme-button-secondary flex w-full items-center justify-center gap-2 rounded px-4 py-2 text-sm"
        >
          <Zap className="w-4 h-4" />
          {t('toolClassificationSettings.openTestPage', { shortcut: debugShortcut })}
        </button>
      </div>
    </div>
  );
};

export default ToolClassificationSettings;
