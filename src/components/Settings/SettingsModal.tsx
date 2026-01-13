import React, { useState } from 'react';
import { X, Monitor, Type, Cpu, Settings, Keyboard, Zap, Database, Cpu as LocalLLM, Globe } from 'lucide-react';
import { useSettingsStore } from '../../stores/settingsStore';
import { KeyboardShortcuts } from './KeyboardShortcuts';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { useLayoutStore } from '../../stores/layoutStore';
import { DataManagementPanel } from './DataManagementPanel';
import { LocalModelSettings } from './LocalModelSettings';
import { CustomProviderSettings } from './CustomProviderSettings';

export const SettingsModal = () => {
  const { t, i18n } = useTranslation();
  const { isSettingsOpen, setSettingsOpen, sidebarPosition, setSidebarPosition } = useLayoutStore();
  const settings = useSettingsStore();
  const [activeTab, setActiveTab] = useState<'general' | 'editor' | 'ai' | 'performance' | 'keybindings' | 'data' | 'localModel' | 'customProvider'>('general');

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
      const zhCNData = storeData?.['zh-CN']?.translation?.shortcuts;
      const enUSData = storeData?.['en-US']?.translation?.shortcuts;
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
  ] as const;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black bg-opacity-50" onClick={() => setSettingsOpen(false)}>
      <div className="bg-[#252526] w-[700px] h-[500px] rounded-lg shadow-xl flex overflow-hidden border border-gray-700" onClick={e => e.stopPropagation()} data-testid="settings-modal">
        {/* Sidebar */}
        <div className="w-48 bg-[#1e1e1e] border-r border-gray-700 p-2 flex flex-col flex-shrink-0">
          <div className="text-gray-400 text-xs font-bold uppercase tracking-wider mb-4 px-2 mt-2">{t('chat.settings')}</div>
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={clsx(
                "flex items-center px-3 py-2 text-sm rounded mb-1 w-full text-left",
                activeTab === tab.id ? "bg-[#37373d] text-white" : "text-gray-400 hover:text-white hover:bg-[#2a2d2e]"
              )}
            >
              <tab.icon size={16} className="mr-2" />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 flex flex-col min-w-0">
          <div className="flex justify-between items-center p-4 border-b border-gray-700 bg-[#252526]">
            <h2 className="text-lg font-medium text-white">
              {activeTab === 'keybindings' ? t('shortcuts.keyboardShortcuts') :
               activeTab === 'ai' ? t('settings.ai') :
               activeTab === 'data' ? t('settings.dataManagement') :
               activeTab === 'localModel' ? t('settings.localModelSettings') :
               activeTab === 'customProvider' ? t('settings.customProvider') :
               `${t(`settings.${activeTab}`)} ${t('chat.settings')}`}
            </h2>
            <button onClick={() => setSettingsOpen(false)} className="text-gray-400 hover:text-white">
              <X size={18} />
            </button>
          </div>
          
          <div className={clsx("flex-1 bg-[#252526]", activeTab !== 'keybindings' ? "overflow-y-auto p-6 space-y-6" : "overflow-hidden")}>
            {activeTab === 'general' && (
              <div className="space-y-4">
                {/* v0.3.0: 语言切换 - 无感知刷新 */}
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">{t('settings.language')}</label>
                  <select
                    value={i18n.language}
                    onChange={(e) => {
                      const newLang = e.target.value;
                      // 直接切换语言，无需刷新页面
                      // React 组件会自动响应语言变化
                      i18n.changeLanguage(newLang);
                    }}
                    className="w-full bg-[#3c3c3c] border border-gray-600 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
                  >
                    <option value="zh-CN">简体中文</option>
                    <option value="en-US">English</option>
                  </select>
                  <p className="text-xs text-gray-500 mt-1">{t('settings.languageHint')}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">{t('settings.theme')}</label>
                  <select
                    value={settings.theme}
                    onChange={(e) => settings.updateSettings({ theme: e.target.value as 'vs-dark' | 'light' })}
                    className="w-full bg-[#3c3c3c] border border-gray-600 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
                  >
                    <option value="vs-dark">{t('settings.dark')}</option>
                    <option value="light">{t('settings.light')}</option>
                  </select>
                </div>
                {/* v0.2.6 新增：侧边栏位置设置 */}
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">{t('settings.sidebarPosition')}</label>
                  <select
                    value={sidebarPosition}
                    onChange={(e) => setSidebarPosition(e.target.value as 'left' | 'right')}
                    className="w-full bg-[#3c3c3c] border border-gray-600 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
                  >
                    <option value="left">{t('settings.sidebarLeft')}</option>
                    <option value="right">{t('settings.sidebarRight')}</option>
                  </select>
                  <p className="text-xs text-gray-500 mt-1">{t('settings.sidebarPositionHint')}</p>
                </div>
              </div>
            )}

            {activeTab === 'editor' && (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">{t('settings.fontSize')}</label>
                  <input 
                    type="number"
                    value={settings.fontSize}
                    onChange={(e) => settings.updateSettings({ fontSize: parseInt(e.target.value) })}
                    className="w-full bg-[#3c3c3c] border border-gray-600 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-300">{t('settings.showMinimap')}</span>
                  <input 
                    type="checkbox"
                    checked={settings.showMinimap}
                    onChange={(e) => settings.updateSettings({ showMinimap: e.target.checked })}
                    className="toggle"
                  />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-300">{t('settings.showLineNumbers')}</span>
                  <input 
                    type="checkbox"
                    checked={settings.showLineNumbers}
                    onChange={(e) => settings.updateSettings({ showLineNumbers: e.target.checked })}
                    className="toggle"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">{t('settings.wordWrap')}</label>
                  <select 
                    value={settings.wordWrap}
                    onChange={(e) => settings.updateSettings({ wordWrap: e.target.value as 'on' | 'off' })}
                    className="w-full bg-[#3c3c3c] border border-gray-600 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
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
                <div className="bg-blue-900/20 border border-blue-700/50 rounded px-3 py-2 flex items-center">
                    <span className="text-xs text-blue-300">
                        {t('settings.currentActive')}：<strong>{settings.providers.find(p => p.id === settings.currentProviderId)?.name || t('settings.notSelected')}</strong>
                        ({t('settings.modelLabel')}：{settings.currentModel})
                    </span>
                </div>

                {/* 内置提供商 */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                      <h3 className="text-sm font-bold text-gray-300">内置提供商</h3>
                  </div>

                  {settings.providers.filter(p => !p.isCustom).map(provider => {
                      const isCurrent = provider.id === settings.currentProviderId;
                      const hasApiKey = provider.apiKey && provider.apiKey.trim() !== '';

                      return (
                          <div key={provider.id} className={clsx(
                              "border rounded p-3 bg-[#2d2d2d] transition-all mb-3",
                              isCurrent ? "border-blue-500 bg-blue-900/10" : "border-gray-600"
                          )}>
                              <div className="flex items-center justify-between mb-2">
                                  <div className="flex items-center">
                                      <span className="font-semibold text-gray-200">{provider.name}</span>
                                      {isCurrent && (
                                          <span className="ml-2 px-2 py-0.5 text-xs bg-blue-600 text-white rounded">{t('settings.current')}</span>
                                      )}
                                      {hasApiKey && !isCurrent && (
                                          <span className="ml-2 px-2 py-0.5 text-xs bg-green-600/50 text-green-300 rounded">已配置</span>
                                      )}
                                  </div>
                                  <div className="flex items-center">
                                      <span className="text-xs text-gray-400 mr-2">{provider.enabled ? t('common.on') : t('common.off')}</span>
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
                                          <label className="block text-xs text-gray-400 mb-1">{t('settings.apiKey')}</label>
                                          <input
                                              type="password"
                                              value={provider.apiKey}
                                              onChange={(e) => settings.updateProviderConfig(provider.id, { apiKey: e.target.value })}
                                              className={clsx(
                                                  "w-full border rounded px-2 py-1 text-white text-xs focus:outline-none",
                                                  isCurrent ? "bg-blue-900/20 border-blue-500 focus:border-blue-400" : "bg-[#3c3c3c] border-gray-600 focus:border-blue-500"
                                              )}
                                              placeholder={t('settings.apiKeyFor', { providerName: provider.name })}
                                          />
                                          {hasApiKey && (
                                              <div className="mt-1 text-xs text-green-400">
                                                  ✓ {t('settings.apiKeyConfigured')} - {isCurrent ? t('settings.currentlyActiveLabel') : t('settings.clickToSetDefault')}
                                              </div>
                                          )}
                                      </div>
                                      <div>
                                          <label className="block text-xs text-gray-400 mb-1">{t('settings.baseUrl')}</label>
                                          <input
                                              type="text"
                                              value={provider.baseUrl}
                                              onChange={(e) => settings.updateProviderConfig(provider.id, { baseUrl: e.target.value })}
                                              className="w-full bg-[#3c3c3c] border border-gray-600 rounded px-2 py-1 text-white text-xs focus:outline-none focus:border-blue-500"
                                              placeholder="https://..."
                                          />
                                      </div>
                                      {!isCurrent && hasApiKey && (
                                          <button
                                              onClick={() => settings.setCurrentProviderAndModel(provider.id, provider.models[0])}
                                              className="w-full px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs rounded transition-colors"
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
                  <div className="border-t border-gray-600 pt-4">
                    <div className="flex items-center justify-between mb-2">
                        <h3 className="text-sm font-bold text-gray-300 flex items-center">
                          <Globe size={14} className="mr-1" />
                          {t('settings.customProvider')}
                        </h3>
                        <button
                          onClick={() => setActiveTab('customProvider')}
                          className="text-xs text-blue-400 hover:text-blue-300"
                        >
                          {t('settings.manageCustomProvider')} →
                        </button>
                    </div>

                    {settings.providers.filter(p => p.isCustom).map(provider => {
                        const isCurrent = provider.id === settings.currentProviderId;
                        const hasApiKey = provider.apiKey && provider.apiKey.trim() !== '';

                        return (
                            <div key={provider.id} className={clsx(
                                "border rounded p-3 bg-[#2d2d2d] transition-all mb-3",
                                isCurrent ? "border-blue-500 bg-blue-900/10" : "border-gray-600",
                                provider.isCustom && "border-purple-500/30"
                            )}>
                                <div className="flex items-center justify-between mb-2">
                                    <div className="flex items-center">
                                        <Globe size={14} className="mr-1 text-purple-400" />
                                        <span className="font-semibold text-gray-200">
                                          {provider.displayName || provider.name}
                                        </span>
                                        {isCurrent && (
                                            <span className="ml-2 px-2 py-0.5 text-xs bg-blue-600 text-white rounded">当前</span>
                                        )}
                                        <span className="ml-2 px-2 py-0.5 text-xs bg-purple-600/50 text-purple-300 rounded">{t('settings.custom')}</span>
                                        {hasApiKey && !isCurrent && (
                                            <span className="ml-2 px-2 py-0.5 text-xs bg-green-600/50 text-green-300 rounded">已配置</span>
                                        )}
                                    </div>
                                    <div className="flex items-center">
                                        <span className="text-xs text-gray-400 mr-2">{provider.enabled ? t('common.on') : t('common.off')}</span>
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
                                        <div className="text-xs text-gray-500">
                                            {t('settings.endpoint')}: <span className="font-mono">{provider.baseUrl}</span>
                                        </div>
                                        <div className="text-xs text-gray-500">
                                            {t('settings.modelLabel')}: {provider.models.length > 0 ? provider.models.join(', ') : t('settings.notConfigured')}
                                        </div>
                                        {!isCurrent && hasApiKey && (
                                            <button
                                                onClick={() => settings.setCurrentProviderAndModel(provider.id, provider.models[0])}
                                                className="w-full px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs rounded transition-colors"
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

                <div className="flex items-center justify-between pt-4 border-t border-gray-600">
                  <span className="text-sm font-medium text-gray-300">{t('settings.enableAutocomplete')}</span>
                  <input
                    type="checkbox"
                    checked={settings.enableAutocomplete}
                    onChange={(e) => settings.updateSettings({ enableAutocomplete: e.target.checked })}
                    className="toggle"
                  />
                </div>

                {/* Agent Settings */}
                <div className="border-t border-gray-600 pt-6 mt-6">
                  <h3 className="text-sm font-bold text-gray-300 mb-4">
                    {t('settings.agentSettings')}
                  </h3>

                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <label className="block text-sm font-medium text-gray-300">
                        {t('settings.agentAutoApprove')}
                      </label>
                      <p className="text-xs text-gray-400 mt-1">
                        {t('settings.agentAutoApproveDesc')}
                      </p>
                    </div>
                    <input
                      type="checkbox"
                      checked={settings.agentAutoApprove || false}
                      onChange={(e) => settings.updateSettings({
                        agentAutoApprove: e.target.checked
                      })}
                      className="ml-4 h-4 w-4 rounded border-gray-600 bg-gray-700 text-blue-500 focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'performance' && (
              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">{t('settings.performanceMode')}</label>
                  <select 
                    value={settings.performanceMode}
                    onChange={(e) => settings.updateSettings({ performanceMode: e.target.value as any })}
                    className="w-full bg-[#3c3c3c] border border-gray-600 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
                  >
                    <option value="auto">{t('settings.performanceModeAuto')}</option>
                    <option value="high">{t('settings.performanceModeHigh')}</option>
                    <option value="medium">{t('settings.performanceModeMedium')}</option>
                    <option value="low">{t('settings.performanceModeLow')}</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">{t('settings.targetFPS')}</label>
                  <select 
                    value={settings.targetFPS}
                    onChange={(e) => settings.updateSettings({ targetFPS: parseInt(e.target.value) })}
                    className="w-full bg-[#3c3c3c] border border-gray-600 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
                  >
                    <option value="60">60 FPS</option>
                    <option value="120">120 FPS</option>
                    <option value="144">144 FPS</option>
                  </select>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-300">{t('settings.enableGPUAcceleration')}</span>
                  <input 
                    type="checkbox"
                    checked={settings.enableGPUAcceleration}
                    onChange={(e) => settings.updateSettings({ enableGPUAcceleration: e.target.checked })}
                    className="toggle"
                  />
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-300">{t('settings.showPerformanceMonitor')}</span>
                  <input 
                    type="checkbox"
                    checked={settings.showPerformanceMonitor}
                    onChange={(e) => settings.updateSettings({ showPerformanceMonitor: e.target.checked })}
                    className="toggle"
                  />
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-300">{t('settings.enableAutoDowngrade')}</span>
                  <input 
                    type="checkbox"
                    checked={settings.enableAutoDowngrade}
                    onChange={(e) => settings.updateSettings({ enableAutoDowngrade: e.target.checked })}
                    className="toggle"
                  />
                </div>
              </div>
            )}

            {activeTab === 'keybindings' && <KeyboardShortcuts />}
            {activeTab === 'data' && <DataManagementPanel />}
            {activeTab === 'localModel' && <LocalModelSettings />}
            {activeTab === 'customProvider' && <CustomProviderSettings />}
          </div>
        </div>
      </div>
    </div>
  );
};
