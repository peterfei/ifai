import React, { useState } from 'react';
import { X, Monitor, Type, Cpu, Settings, Keyboard, Zap, Database, Cpu as LocalLLM, Globe, Target } from 'lucide-react';
import { useSettingsStore } from '../../stores/settingsStore';
import { KeyboardShortcuts } from './KeyboardShortcuts';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { useLayoutStore } from '../../stores/layoutStore';
import { DataManagementPanel } from './DataManagementPanel';
import { LocalModelSettings } from './LocalModelSettings';
import { CustomProviderSettings } from './CustomProviderSettings';
import { ToolClassificationSettings } from './ToolClassificationSettings';
import { SkillsSettings } from './SkillsSettings';
import { isDarkTheme } from '../../utils/theme';

export const SettingsModal = () => {
  const { t, i18n } = useTranslation();
  const { isSettingsOpen, setSettingsOpen, sidebarPosition, setSidebarPosition } = useLayoutStore();
  const settings = useSettingsStore();
  const [activeTab, setActiveTab] = useState<'general' | 'editor' | 'ai' | 'performance' | 'keybindings' | 'data' | 'localModel' | 'customProvider' | 'toolClassification' | 'skills'>('general');
  const dark = isDarkTheme(settings.theme);
  const fieldLabelClass = 'settings-modal-label theme-text-muted mb-1 block text-sm font-medium';
  const fieldHintClass = 'settings-modal-value theme-text-subtle mt-1 text-xs';
  const fieldInputClass = 'settings-modal-input theme-input-surface theme-border theme-text w-full rounded border px-3 py-2 text-sm focus:border-blue-500 focus:outline-none';
  const compactInputClass = 'theme-input-surface theme-border theme-text w-full rounded border px-2 py-1 text-xs focus:border-blue-500 focus:outline-none';
  const toggleTextClass = 'theme-text-muted text-sm font-medium';
  const smallMutedClass = 'theme-text-subtle text-xs';
  const settingsCardClass = 'theme-panel-muted theme-border rounded-lg border p-3 transition-all';
  const checkboxClass = 'theme-checkbox-input h-4 w-4 rounded focus:ring-2 focus:ring-blue-500';

  // 获取本地化的提供商名称
  const getProviderName = (providerId: string, fallbackName: string): string => {
    const translated = t(`settings.providerNames.${providerId}` as any);
    // 如果翻译键不存在或返回的是键本身，则使用 fallbackName
    if (translated && !translated.startsWith('settings.')) {
      return translated;
    }
    return fallbackName;
  };

  // 🔍 调试：打印翻译值
  React.useEffect(() => {
    if (isSettingsOpen) {
      console.log('=== SettingsModal 调试信息 ===');
      console.log('1. 当前语言 (i18n.language):', i18n.language);
      console.log('2. localStorage i18nextLng:', localStorage.getItem('i18nextLng'));

      // 检查 shortcuts.keyboardShortcuts 翻译
      const shortcutsKeyboardShortcuts = t('shortcuts.keyboardShortcuts');
      console.log('3. t("shortcuts.keyboardShortcuts") 返回值:', shortcutsKeyboardShortcuts);

      // 检查 i18n store 中的实际值
      const storeData = i18n.store.data;
      const zhCNData = (storeData as any)?.['zh-CN']?.translation?.shortcuts;
      const enUSData = (storeData as any)?.['en-US']?.translation?.shortcuts;
      console.log('4. zh-CN translation.shortcuts.keyboardShortcuts:', zhCNData?.keyboardShortcuts);
      console.log('5. en-US translation.shortcuts.keyboardShortcuts:', enUSData?.keyboardShortcuts);

      // 检查 tabs 数组中的 label 值
      console.log('6. 活动的 tab:', activeTab);
      console.log('7. 当前渲染的 keybindings 标签文本:', shortcutsKeyboardShortcuts);
    }
  }, [isSettingsOpen, activeTab, i18n, t]);

  if (!isSettingsOpen) return null;

  const tabs = [
    { id: 'general', label: t('settings.general'), icon: Monitor },
    { id: 'editor', label: t('settings.editor'), icon: Type },
    { id: 'ai', label: t('settings.ai'), icon: Cpu },
    { id: 'customProvider', label: t('settings.customProvider'), icon: Globe },
    { id: 'performance', label: t('settings.performance'), icon: Zap },
    { id: 'keybindings', label: t('shortcuts.keyboardShortcuts'), icon: Keyboard },
    { id: 'data', label: t('settings.dataManagement'), icon: Database },
    { id: 'localModel', label: t('settings.localModelSettings'), icon: LocalLLM },
    { id: 'toolClassification', label: '工具分类', icon: Target },
    { id: 'skills', label: '技能中心', icon: Zap },
  ] as const;

  return (
    <div className="theme-backdrop fixed inset-0 z-[200] flex items-center justify-center backdrop-blur-sm" onClick={() => setSettingsOpen(false)}>
      <div
        className="settings-modal theme-panel-elevated theme-border theme-shadow flex h-[500px] w-[700px] overflow-hidden rounded-lg border"
        onClick={e => e.stopPropagation()}
        data-testid="settings-modal"
        data-theme={settings.theme}
      >
        {/* Sidebar */}
        <div className="settings-modal-sidebar theme-panel-muted theme-border flex w-48 flex-shrink-0 flex-col border-r p-2">
          <div className="settings-modal-label theme-text-subtle mb-4 mt-2 px-2 text-xs font-bold uppercase tracking-wider">{t('chat.settings')}</div>
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              data-testid={`settings-tab-${tab.id}`}
              data-active={activeTab === tab.id}
              className={clsx(
                'settings-modal-tab mb-1 flex w-full items-center rounded px-3 py-2 text-left text-sm transition-colors',
                activeTab === tab.id
                  ? 'bg-[var(--selected-bg)] text-[var(--accent-color)]'
                  : 'theme-text-subtle theme-hoverable'
              )}
            >
              <tab.icon size={16} className="mr-2" />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 flex flex-col min-w-0">
          <div className="settings-modal-header theme-panel-elevated theme-border flex items-center justify-between border-b p-4">
            <h2 className="settings-modal-title theme-text text-lg font-medium">
              {activeTab === 'keybindings' ? t('shortcuts.keyboardShortcuts') :
               activeTab === 'ai' ? t('settings.ai') :
               activeTab === 'data' ? t('settings.dataManagement') :
               activeTab === 'localModel' ? t('settings.localModelSettings') :
               activeTab === 'customProvider' ? t('settings.customProvider') :
               activeTab === 'toolClassification' ? '工具分类设置' :
               activeTab === 'skills' ? '技能中心 (Skills Center)' :
               `${t(`settings.${activeTab}`)} ${t('chat.settings')}`}
            </h2>
            <button onClick={() => setSettingsOpen(false)} className="theme-button-ghost rounded p-1" data-testid="close-settings">
              <X size={18} />
            </button>
          </div>
          
          <div className={clsx('settings-modal-content theme-panel flex-1', activeTab !== 'keybindings' ? 'overflow-y-auto p-6 space-y-6' : 'overflow-hidden')}>
            {activeTab === 'general' && (
              <div className="space-y-4">
                {/* v0.3.0: 语言切换 - 无感知刷新 */}
                <div>
                  <label className={fieldLabelClass}>{t('settings.language')}</label>
                  <select
                    value={i18n.language}
                    onChange={(e) => {
                      const newLang = e.target.value;
                      // 直接切换语言，无需刷新页面
                      // React 组件会自动响应语言变化
                      i18n.changeLanguage(newLang);
                    }}
                    className={fieldInputClass}
                  >
                    <option value="zh-CN">简体中文</option>
                    <option value="en-US">English</option>
                  </select>
                  <p className={fieldHintClass}>{t('settings.languageHint')}</p>
                </div>
                <div>
                  <label className={fieldLabelClass}>{t('settings.theme')}</label>
                  <select
                    value={settings.theme}
                    onChange={(e) => settings.updateSettings({ theme: e.target.value as 'vs-dark' | 'light' })}
                    className={fieldInputClass}
                  >
                    <option value="vs-dark">{t('settings.dark')}</option>
                    <option value="light">{t('settings.light')}</option>
                  </select>
                </div>
                {/* v0.2.6 新增：侧边栏位置设置 */}
                <div>
                  <label className={fieldLabelClass}>{t('settings.sidebarPosition')}</label>
                  <select
                    value={sidebarPosition}
                    onChange={(e) => setSidebarPosition(e.target.value as 'left' | 'right')}
                    className={fieldInputClass}
                  >
                    <option value="left">{t('settings.sidebarLeft')}</option>
                    <option value="right">{t('settings.sidebarRight')}</option>
                  </select>
                  <p className={fieldHintClass}>{t('settings.sidebarPositionHint')}</p>
                </div>
              </div>
            )}

            {activeTab === 'editor' && (
              <div className="space-y-4">
                <div>
                  <label className={fieldLabelClass}>{t('settings.fontSize')}</label>
                  <input 
                    type="number"
                    value={settings.fontSize}
                    onChange={(e) => settings.updateSettings({ fontSize: parseInt(e.target.value) })}
                    className={fieldInputClass}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <span className={toggleTextClass}>{t('settings.showMinimap')}</span>
                  <input 
                    type="checkbox"
                    checked={settings.showMinimap}
                    onChange={(e) => settings.updateSettings({ showMinimap: e.target.checked })}
                    className={checkboxClass}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <span className={toggleTextClass}>{t('settings.showLineNumbers')}</span>
                  <input 
                    type="checkbox"
                    checked={settings.showLineNumbers}
                    onChange={(e) => settings.updateSettings({ showLineNumbers: e.target.checked })}
                    className={checkboxClass}
                  />
                </div>
                <div>
                  <label className={fieldLabelClass}>{t('settings.wordWrap')}</label>
                  <select 
                    value={settings.wordWrap}
                    onChange={(e) => settings.updateSettings({ wordWrap: e.target.value as 'on' | 'off' })}
                    className={fieldInputClass}
                  >
                    <option value="on">{t('common.on')}</option>
                    <option value="off">{t('common.off')}</option>
                  </select>
                </div>
              </div>
            )}

            {activeTab === 'ai' && (
              <div className="space-y-6">
                {/* 当前激活的供应商提示 */}
                <div className="theme-surface-info flex items-center rounded px-3 py-2">
                    <span className="theme-text-info text-xs">
                        {t('settings.currentActive')}：<strong>{getProviderName(settings.currentProviderId, settings.providers.find(p => p.id === settings.currentProviderId)?.name || t('settings.notSelected'))}</strong>
                        ({t('settings.modelLabel')}：{settings.currentModel})
                    </span>
                </div>

                {/* 内置提供商 */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                      <h3 className="theme-text-muted text-sm font-bold">内置提供商</h3>
                  </div>

                  {settings.providers.filter(p => !p.isCustom).map(provider => {
                      const isCurrent = provider.id === settings.currentProviderId;
                      const hasApiKey = provider.apiKey && provider.apiKey.trim() !== '';

                      return (
                          <div key={provider.id} className={clsx(
                              settingsCardClass,
                              isCurrent && 'border-blue-500 bg-blue-500/10'
                          )}>
                              <div className="flex items-center justify-between mb-2">
                                  <div className="flex items-center">
                                      <span className="theme-text font-semibold">{getProviderName(provider.id, provider.name)}</span>
                                      {isCurrent && (
                                          <span className="theme-badge-accent ml-2 rounded px-2 py-0.5 text-xs">{t('settings.current')}</span>
                                      )}
                                      {hasApiKey && !isCurrent && (
                                          <span className="theme-badge-success ml-2 rounded px-2 py-0.5 text-xs">已配置</span>
                                      )}
                                  </div>
                                  <div className="flex items-center">
                                      <span className="theme-text-subtle mr-2 text-xs">{provider.enabled ? t('common.on') : t('common.off')}</span>
                                      <input
                                          type="checkbox"
                                          checked={provider.enabled}
                                          onChange={(e) => settings.updateProviderConfig(provider.id, { enabled: e.target.checked })}
                                          className="cursor-pointer"
                                      />
                                  </div>
                              </div>

                              {provider.enabled && (
                                  <div className="space-y-3 mt-2">
                                      <div>
                                          <label className={clsx(smallMutedClass, 'mb-1 block')}>{t('settings.apiKey')}</label>
                                          <input
                                              type="password"
                                              value={provider.apiKey}
                                              onChange={(e) => settings.updateProviderConfig(provider.id, { apiKey: e.target.value })}
                                              className={clsx(
                                                  compactInputClass,
                                                  isCurrent && 'border-blue-500 bg-blue-500/10 focus:border-blue-400'
                                              )}
                                              placeholder={t('settings.apiKeyFor', { providerName: getProviderName(provider.id, provider.name) })}
                                          />
                                          {hasApiKey && (
                                              <div className="theme-text-success mt-1 text-xs">
                                                  ✓ {t('settings.apiKeyConfigured')} - {isCurrent ? t('settings.currentlyActiveLabel') : t('settings.clickToSetDefault')}
                                              </div>
                                          )}
                                      </div>
                                      <div>
                                          <label className={clsx(smallMutedClass, 'mb-1 block')}>{t('settings.baseUrl')}</label>
                                          <input
                                              type="text"
                                              value={provider.baseUrl}
                                              onChange={(e) => settings.updateProviderConfig(provider.id, { baseUrl: e.target.value })}
                                              className={compactInputClass}
                                              placeholder="https://..."
                                          />
                                      </div>
                                      {!isCurrent && hasApiKey && (
                                          <button
                                              onClick={() => settings.setCurrentProviderAndModel(provider.id, provider.models[0])}
                                              className="theme-button-primary w-full rounded px-3 py-1.5 text-xs"
                                          >
                                              {t('settings.setAsDefault')}
                                          </button>
                                      )}
                                  </div>
                              )}
                          </div>
                      );
                  })}
                </div>

                {/* 自定义提供商 */}
                {settings.providers.filter(p => p.isCustom).length > 0 && (
                  <div className="theme-border border-t pt-4">
                    <div className="flex items-center justify-between mb-2">
                        <h3 className="theme-text-muted flex items-center text-sm font-bold">
                          <Globe size={14} className="mr-1" />
                          {t('settings.customProvider')}
                        </h3>
                        <button
                          onClick={() => setActiveTab('customProvider')}
                          className="theme-button-ghost rounded px-2 py-1 text-xs text-blue-400"
                        >
                          {t('settings.manageCustomProvider')} →
                        </button>
                    </div>

                    {settings.providers.filter(p => p.isCustom).map(provider => {
                        const isCurrent = provider.id === settings.currentProviderId;
                        const hasApiKey = provider.apiKey && provider.apiKey.trim() !== '';

                        return (
                            <div key={provider.id} className={clsx(
                                settingsCardClass,
                                isCurrent && 'border-blue-500 bg-blue-500/10',
                                provider.isCustom && "border-purple-500/30"
                            )}>
                                <div className="flex items-center justify-between mb-2">
                                    <div className="flex items-center">
                                        <Globe size={14} className="mr-1 text-purple-400" />
                                        <span className="theme-text font-semibold">
                                          {provider.displayName || provider.name}
                                        </span>
                                        {isCurrent && (
                                            <span className="theme-badge-accent ml-2 rounded px-2 py-0.5 text-xs">当前</span>
                                        )}
                                        <span className="ml-2 px-2 py-0.5 text-xs bg-purple-600/50 text-purple-300 rounded">{t('settings.custom')}</span>
                                        {hasApiKey && !isCurrent && (
                                            <span className="theme-badge-success ml-2 rounded px-2 py-0.5 text-xs">已配置</span>
                                        )}
                                    </div>
                                    <div className="flex items-center">
                                        <span className="theme-text-subtle mr-2 text-xs">{provider.enabled ? t('common.on') : t('common.off')}</span>
                                        <input
                                            type="checkbox"
                                            checked={provider.enabled}
                                            onChange={(e) => settings.updateProviderConfig(provider.id, { enabled: e.target.checked })}
                                            className="cursor-pointer"
                                        />
                                    </div>
                                </div>

                                {provider.enabled && (
                                    <div className="space-y-2 mt-2">
                                        <div className="theme-text-subtle text-xs">
                                            {t('settings.endpoint')}: <span className="font-mono">{provider.baseUrl}</span>
                                        </div>
                                        <div className="theme-text-subtle text-xs">
                                            {t('settings.modelLabel')}: {provider.models.length > 0 ? provider.models.join(', ') : t('settings.notConfigured')}
                                        </div>
                                        {!isCurrent && hasApiKey && (
                                            <button
                                                onClick={() => settings.setCurrentProviderAndModel(provider.id, provider.models[0])}
                                                className="theme-button-primary w-full rounded px-3 py-1.5 text-xs"
                                            >
                                                {t('settings.setAsDefault')}
                                            </button>
                                        )}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                  </div>
                )}

                <div className="theme-border flex items-center justify-between border-t pt-4">
                  <span className={toggleTextClass}>{t('settings.enableAutocomplete')}</span>
                  <input
                    type="checkbox"
                    checked={settings.enableAutocomplete}
                    onChange={(e) => settings.updateSettings({ enableAutocomplete: e.target.checked })}
                    className={checkboxClass}
                  />
                </div>

                {/* 🔥 v0.5.0: 打字机效果设置 */}
                <div className="flex items-center justify-between pt-4">
                  <div className="flex-1">
                    <label className={fieldLabelClass}>
                      启用打字机效果
                    </label>
                    <p className={fieldHintClass}>
                      逐字显示 AI 响应，关闭后将直接显示完整内容
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={settings.enableTypewriterEffect}
                    onChange={(e) => settings.updateSettings({ enableTypewriterEffect: e.target.checked })}
                    data-testid="typewriter-effect-checkbox"
                    className={clsx(checkboxClass, 'ml-4')}
                  />
                </div>

                {/* Agent Settings */}
                <div className="theme-border mt-6 border-t pt-6">
                  <h3 className="theme-text-muted mb-4 text-sm font-bold">
                    {t('settings.agentSettings')}
                  </h3>

                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <label className={fieldLabelClass}>
                        {t('settings.agentAutoApprove')}
                      </label>
                      <p className={fieldHintClass}>
                        {t('settings.agentAutoApproveDesc')}
                      </p>
                    </div>
                    <input
                      type="checkbox"
                      checked={settings.agentAutoApprove || false}
                      onChange={(e) => settings.updateSettings({
                        agentAutoApprove: e.target.checked
                      })}
                      data-testid="auto-approve-checkbox"
                      className={clsx(checkboxClass, 'ml-4')}
                    />
                  </div>

                  {/* Sandbox Mode */}
                  <div className="flex items-center justify-between mt-4">
                    <div className="flex-1">
                      <label className={fieldLabelClass}>
                        沙箱模式
                      </label>
                      <p className={fieldHintClass}>
                        控制破坏性操作（如 bash、删除文件）的自动审批策略
                      </p>
                    </div>
                    <select
                      value={(settings as any).sandboxMode || 'auto'}
                      onChange={(e) => settings.updateSettings({
                        sandboxMode: e.target.value as any
                      })}
                      data-testid="sandbox-mode-select"
                      className={clsx(compactInputClass, 'ml-4 px-3 py-1.5 text-sm')}
                    >
                      <option value="auto">自动检测</option>
                      <option value="tauri-only">仅桌面应用</option>
                      <option value="always-on">始终启用</option>
                      <option value="always-off">始终禁用</option>
                    </select>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'performance' && (
              <div className="space-y-6">
                <div>
                  <label className={fieldLabelClass}>{t('settings.performanceMode')}</label>
                  <select 
                    value={settings.performanceMode}
                    onChange={(e) => settings.updateSettings({ performanceMode: e.target.value as any })}
                    className={fieldInputClass}
                  >
                    <option value="auto">{t('settings.performanceModeAuto')}</option>
                    <option value="high">{t('settings.performanceModeHigh')}</option>
                    <option value="medium">{t('settings.performanceModeMedium')}</option>
                    <option value="low">{t('settings.performanceModeLow')}</option>
                  </select>
                </div>

                <div>
                  <label className={fieldLabelClass}>{t('settings.targetFPS')}</label>
                  <select 
                    value={settings.targetFPS}
                    onChange={(e) => settings.updateSettings({ targetFPS: parseInt(e.target.value) })}
                    className={fieldInputClass}
                  >
                    <option value="60">60 FPS</option>
                    <option value="120">120 FPS</option>
                    <option value="144">144 FPS</option>
                  </select>
                </div>

                <div className="flex items-center justify-between">
                  <span className={toggleTextClass}>{t('settings.enableGPUAcceleration')}</span>
                  <input 
                    type="checkbox"
                    checked={settings.enableGPUAcceleration}
                    onChange={(e) => settings.updateSettings({ enableGPUAcceleration: e.target.checked })}
                    className={checkboxClass}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <span className={toggleTextClass}>{t('settings.showPerformanceMonitor')}</span>
                  <input 
                    type="checkbox"
                    checked={settings.showPerformanceMonitor}
                    onChange={(e) => settings.updateSettings({ showPerformanceMonitor: e.target.checked })}
                    className={checkboxClass}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <span className={toggleTextClass}>{t('settings.enableAutoDowngrade')}</span>
                  <input 
                    type="checkbox"
                    checked={settings.enableAutoDowngrade}
                    onChange={(e) => settings.updateSettings({ enableAutoDowngrade: e.target.checked })}
                    className={checkboxClass}
                  />
                </div>
              </div>
            )}

            {activeTab === 'keybindings' && <KeyboardShortcuts />}
            {activeTab === 'data' && <DataManagementPanel />}
            {activeTab === 'localModel' && <LocalModelSettings />}
            {activeTab === 'customProvider' && <CustomProviderSettings />}
            {activeTab === 'toolClassification' && <ToolClassificationSettings />}
            {activeTab === 'skills' && <SkillsSettings />}
          </div>
        </div>
      </div>
    </div>
  );
};
