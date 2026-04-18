import React, { useState } from 'react';
import { X, Monitor, Type, Cpu, Keyboard, Zap, Database, Cpu as LocalLLM, Globe, Target } from 'lucide-react';
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
import { formatKeybinding } from '../../utils/keyboard';

export const SettingsModal = () => {
  const { t, i18n } = useTranslation();
  const { isSettingsOpen, setSettingsOpen, sidebarPosition, setSidebarPosition } = useLayoutStore();
  const settings = useSettingsStore();
  const [activeTab, setActiveTab] = useState<'general' | 'editor' | 'ai' | 'performance' | 'keybindings' | 'data' | 'localModel' | 'customProvider' | 'toolClassification' | 'skills'>('general');
  const fieldLabelClass = 'settings-modal-label theme-text-muted mb-1 block text-sm font-medium';
  const fieldHintClass = 'settings-modal-value theme-text-subtle mt-1 text-xs';
  const fieldInputClass = 'settings-modal-input theme-input-surface theme-border theme-text theme-focus-accent w-full rounded border px-3 py-2 text-sm';
  const compactInputClass = 'theme-input-surface theme-border theme-text theme-focus-accent w-full rounded border px-2 py-1 text-xs';
  const toggleTextClass = 'theme-text-muted text-sm font-medium';
  const smallMutedClass = 'theme-text-subtle text-xs';
  const checkboxClass = 'theme-checkbox-input theme-focus-ring-accent h-4 w-4 rounded';
  const providerCardClass = 'theme-panel-muted theme-border overflow-hidden rounded-lg border p-3 transition-all';
  const providerHeaderClass = 'flex flex-col gap-3 md:flex-row md:items-start md:justify-between';
  const providerMetaClass = 'min-w-0 flex-1';
  const providerBadgeRowClass = 'mt-2 flex flex-wrap items-center gap-2';
  const providerToggleShellClass = 'theme-panel theme-border flex items-center gap-3 rounded-full border px-2.5 py-1';
  const providerToggleTrackClass = 'theme-toggle-track theme-focus-ring-accent relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors';
  const providerToggleThumbClass = 'theme-toggle-thumb inline-block h-4 w-4 rounded-full';
  const providerSummaryClass = 'theme-text-subtle text-xs leading-5';
  const toggleSidebarShortcut = formatKeybinding('Mod+b');

  // 获取本地化的提供商名称
  const getProviderName = (providerId: string, fallbackName: string): string => {
    const translated = t(`settings.providerNames.${providerId}` as any);
    // 如果翻译键不存在或返回的是键本身，则使用 fallbackName
    if (translated && !translated.startsWith('settings.')) {
      return translated;
    }
    return fallbackName;
  };

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
    { id: 'toolClassification', label: t('settings.toolClassification'), icon: Target },
    { id: 'skills', label: t('settings.skills'), icon: Zap },
  ] as const;

  const renderProviderToggle = (providerName: string, enabled: boolean, onToggle: () => void) => (
    <div className={providerToggleShellClass}>
      <span className="theme-text-subtle text-xs font-medium">{enabled ? t('common.on') : t('common.off')}</span>
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        aria-label={`${providerName}: ${enabled ? t('common.on') : t('common.off')}`}
        data-active={enabled}
        onClick={onToggle}
        className={providerToggleTrackClass}
      >
        <span
          className={clsx(
            providerToggleThumbClass,
            enabled ? 'translate-x-6' : 'translate-x-1'
          )}
        />
      </button>
    </div>
  );

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
               activeTab === 'toolClassification' ? t('settings.toolClassificationSettings') :
               activeTab === 'skills' ? t('settings.skills') :
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
                    <option value="zh-CN">{t('settings.languageZhCn')}</option>
                    <option value="en-US">{t('settings.languageEnUs')}</option>
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
                  <p className={fieldHintClass}>{t('settings.sidebarPositionHint', { shortcut: toggleSidebarShortcut })}</p>
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
                      <h3 className="theme-text-muted text-sm font-bold">{t('settings.builtInProviders')}</h3>
                  </div>

                  {settings.providers.filter(p => !p.isCustom).map(provider => {
                      const isCurrent = provider.id === settings.currentProviderId;
                      const hasApiKey = provider.apiKey && provider.apiKey.trim() !== '';
                      const providerName = getProviderName(provider.id, provider.name);

                      return (
                          <div key={provider.id} className={clsx(
                              providerCardClass,
                              isCurrent && 'border-[var(--accent-soft-border)] bg-[var(--selected-bg)]'
                          )}>
                              <div className={providerHeaderClass}>
                                  <div className={providerMetaClass}>
                                      <div className="min-w-0">
                                        <span className="theme-text font-semibold">{providerName}</span>
                                      </div>
                                      <div className={providerBadgeRowClass}>
                                        {isCurrent && (
                                            <span className="theme-badge-accent rounded px-2 py-0.5 text-xs">{t('settings.current')}</span>
                                        )}
                                        {hasApiKey && !isCurrent && (
                                            <span className="theme-badge-success rounded px-2 py-0.5 text-xs">{t('settings.configured')}</span>
                                        )}
                                      </div>
                                  </div>
                                  {renderProviderToggle(
                                    providerName,
                                    provider.enabled,
                                    () => settings.updateProviderConfig(provider.id, { enabled: !provider.enabled })
                                  )}
                              </div>

                              {provider.enabled && (
                                  <div className="mt-3 space-y-3">
                                      <div>
                                          <label className={clsx(smallMutedClass, 'mb-1 block')}>{t('settings.apiKey')}</label>
                                          <input
                                              type="password"
                                              value={provider.apiKey}
                                              onChange={(e) => settings.updateProviderConfig(provider.id, { apiKey: e.target.value })}
                                              className={clsx(
                                                  compactInputClass,
                                                  isCurrent && 'border-[var(--accent-soft-border)] bg-[var(--selected-bg)] focus:border-[var(--accent-color)]'
                                              )}
                                              placeholder={t('settings.apiKeyFor', { providerName })}
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
                          className="theme-button-ghost theme-text-accent rounded px-2 py-1 text-xs"
                        >
                          {t('settings.manageCustomProvider')} →
                        </button>
                    </div>

                    {settings.providers.filter(p => p.isCustom).map(provider => {
                        const isCurrent = provider.id === settings.currentProviderId;
                        const hasApiKey = provider.apiKey && provider.apiKey.trim() !== '';
                        const providerName = provider.displayName || provider.name;

                        return (
                            <div key={provider.id} className={clsx(
                                providerCardClass,
                                isCurrent && 'border-[var(--accent-soft-border)] bg-[var(--selected-bg)]'
                            )}>
                                <div className={providerHeaderClass}>
                                    <div className={providerMetaClass}>
                                        <div className="flex min-w-0 items-center gap-2">
                                          <Globe size={14} className="theme-text-accent flex-shrink-0" />
                                          <span className="theme-text truncate font-semibold">
                                            {providerName}
                                          </span>
                                        </div>
                                        <div className={providerBadgeRowClass}>
                                          {isCurrent && (
                                              <span className="theme-badge-accent rounded px-2 py-0.5 text-xs">{t('settings.current')}</span>
                                          )}
                                          <span className="theme-badge-info rounded px-2 py-0.5 text-xs">{t('settings.custom')}</span>
                                          {hasApiKey && !isCurrent && (
                                              <span className="theme-badge-success rounded px-2 py-0.5 text-xs">{t('settings.configured')}</span>
                                          )}
                                        </div>
                                    </div>
                                    {renderProviderToggle(
                                      providerName,
                                      provider.enabled,
                                      () => settings.updateProviderConfig(provider.id, { enabled: !provider.enabled })
                                    )}
                                </div>

                                {provider.enabled && (
                                    <div className="mt-3 space-y-2">
                                        <div className={providerSummaryClass}>
                                            {t('settings.endpoint')}: <span className="theme-text break-all font-mono">{provider.baseUrl}</span>
                                        </div>
                                        <div className={providerSummaryClass}>
                                            {t('settings.modelLabel')}: <span className="theme-text break-words">{provider.models.length > 0 ? provider.models.join(', ') : t('settings.notConfigured')}</span>
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
                      {t('settings.typewriterEffect')}
                    </label>
                    <p className={fieldHintClass}>
                      {t('settings.typewriterEffectDesc')}
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
                        {t('settings.sandboxMode')}
                      </label>
                      <p className={fieldHintClass}>
                        {t('settings.sandboxModeDesc')}
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
                      <option value="auto">{t('settings.sandboxModeAuto')}</option>
                      <option value="tauri-only">{t('settings.sandboxModeTauriOnly')}</option>
                      <option value="always-on">{t('settings.sandboxModeAlwaysOn')}</option>
                      <option value="always-off">{t('settings.sandboxModeAlwaysOff')}</option>
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
