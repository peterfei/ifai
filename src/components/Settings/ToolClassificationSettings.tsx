/**
 * 工具分类设置页面
 *
 * v0.3.3 新增：配置工具分类系统
 */

import React from 'react';
import { useSettingsStore } from '../../stores/settingsStore';
import { Zap, Target, AlertCircle, Eye } from 'lucide-react';
import { isDarkTheme } from '../../utils/theme';

export const ToolClassificationSettings: React.FC = () => {
  const settings = useSettingsStore();
  const dark = isDarkTheme(settings.theme);

  return (
    <div className="space-y-6">
      {/* 头部说明 */}
      <div className={dark ? 'rounded border border-blue-700/50 bg-blue-900/20 px-4 py-3' : 'rounded border border-blue-200 bg-blue-50 px-4 py-3'}>
        <div className="flex items-start gap-2">
          <Zap className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
          <div className={dark ? 'text-sm text-blue-200' : 'text-sm text-blue-800'}>
            <p className="font-medium mb-1">工具分类系统</p>
            <p className={dark ? 'text-xs text-blue-300/80' : 'text-xs text-blue-700/80'}>
              三层分类架构：精确匹配（Layer 1）→ 规则分类（Layer 2）→ LLM分类（Layer 3）。
              可根据需要调整分类行为和显示设置。
            </p>
          </div>
        </div>
      </div>

      {/* 基础设置 */}
      <div>
        <h3 className="theme-text-muted mb-4 text-sm font-bold">基础设置</h3>

        {/* 启用工具分类 */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex-1">
            <label className="theme-text-muted flex items-center gap-2 text-sm font-medium">
              <Zap className="w-4 h-4" />
              启用工具分类
            </label>
            <p className="theme-text-subtle ml-6 mt-1 text-xs">
              使用三层分类系统识别用户意图并选择合适的工具
            </p>
          </div>
          <input
            type="checkbox"
            checked={settings.toolClassificationEnabled}
            onChange={(e) => settings.updateSettings({
              toolClassificationEnabled: e.target.checked
            })}
            className="theme-checkbox-input h-4 w-4 rounded focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* 显示分类指示器 */}
        <div className="flex items-center justify-between">
          <div className="flex-1">
            <label className="theme-text-muted flex items-center gap-2 text-sm font-medium">
              <Eye className="w-4 h-4" />
              显示分类指示器
            </label>
            <p className="theme-text-subtle ml-6 mt-1 text-xs">
              在聊天输入框下方实时显示分类结果
            </p>
          </div>
          <input
            type="checkbox"
            checked={settings.showToolClassificationIndicator}
            onChange={(e) => settings.updateSettings({
              showToolClassificationIndicator: e.target.checked
            })}
            className="theme-checkbox-input h-4 w-4 rounded focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      {/* 分类行为设置 */}
      {settings.toolClassificationEnabled && (
        <div className="theme-border border-t pt-6">
          <h3 className="theme-text-muted mb-4 text-sm font-bold">分类行为</h3>

          {/* 置信度阈值 */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-2">
              <label className="theme-text-muted flex items-center gap-2 text-sm font-medium">
                <Target className="w-4 h-4" />
                置信度阈值
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
              className="theme-input-surface h-2 w-full cursor-pointer appearance-none rounded-lg accent-blue-500"
            />
            <div className="theme-text-subtle mt-1 flex justify-between text-xs">
              <span>50% (宽松)</span>
              <span>95% (严格)</span>
            </div>
            <p className="theme-text-subtle mt-2 text-xs">
              低于此阈值的分类结果将触发回退策略
            </p>
          </div>

          {/* 回退策略 */}
          <div>
            <label className="theme-text-muted mb-2 flex items-center gap-2 text-sm font-medium">
              <AlertCircle className="w-4 h-4" />
              回退策略
            </label>
            <select
              value={settings.toolClassificationFallbackStrategy}
              onChange={(e) => settings.updateSettings({
                toolClassificationFallbackStrategy: e.target.value as any
              })}
              className="theme-input-surface theme-border theme-text w-full rounded border px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            >
              <option value="always">始终使用回退（更保守）</option>
              <option value="on-low-confidence">低置信度时回退（推荐）</option>
              <option value="never">从不回退（最激进）</option>
            </select>
            <p className="theme-text-subtle mt-2 text-xs">
              {
                settings.toolClassificationFallbackStrategy === 'always'
                  ? '即使置信度很高，也会使用回退策略进行二次验证'
                  : settings.toolClassificationFallbackStrategy === 'on-low-confidence'
                  ? '仅在置信度低于阈值时使用回退策略'
                  : '完全信任分类结果，不使用回退策略'
              }
            </p>
          </div>
        </div>
      )}

      {/* 性能信息 */}
      <div className="theme-panel-muted theme-border rounded border px-4 py-3">
        <h4 className="theme-text-subtle mb-2 text-xs font-bold uppercase tracking-wider">性能参考</h4>
        <div className="grid grid-cols-3 gap-4 text-xs">
          <div>
            <div className="text-green-400 font-medium">Layer 1</div>
            <div className="theme-text-subtle">&lt;1ms</div>
          </div>
          <div>
            <div className="text-blue-400 font-medium">Layer 2</div>
            <div className="theme-text-subtle">~5ms</div>
          </div>
          <div>
            <div className="text-purple-400 font-medium">Layer 3</div>
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
          打开测试页面 (Cmd+Shift+D)
        </button>
      </div>
    </div>
  );
};

export default ToolClassificationSettings;
