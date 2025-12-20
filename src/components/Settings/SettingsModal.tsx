import React, { useState } from 'react';
import { X, Monitor, Type, Cpu, Settings, Keyboard } from 'lucide-react';
import { useSettingsStore } from '../../stores/settingsStore';
import { KeyboardShortcuts } from './KeyboardShortcuts';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { useLayoutStore } from '../../stores/layoutStore';

export const SettingsModal = () => {
  const { t } = useTranslation();
  const { isSettingsOpen, setSettingsOpen } = useLayoutStore();
  const settings = useSettingsStore();
  const [activeTab, setActiveTab] = useState<'general' | 'editor' | 'ai' | 'keybindings'>('general');

  if (!isSettingsOpen) return null;

  const tabs = [
    { id: 'general', label: t('settings.general'), icon: Monitor },
    { id: 'editor', label: t('settings.editor'), icon: Type },
    { id: 'ai', label: t('settings.ai'), icon: Cpu },
    { id: 'keybindings', label: t('shortcuts.keyboardShortcuts'), icon: Keyboard },
  ] as const;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black bg-opacity-50" onClick={() => setSettingsOpen(false)}>
      <div className="bg-[#252526] w-[700px] h-[500px] rounded-lg shadow-xl flex overflow-hidden border border-gray-700" onClick={e => e.stopPropagation()}>
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
               `${t(`settings.${activeTab}`)} ${t('chat.settings')}`}
            </h2>
            <button onClick={() => setSettingsOpen(false)} className="text-gray-400 hover:text-white">
              <X size={18} />
            </button>
          </div>
          
          <div className={clsx("flex-1 bg-[#252526]", activeTab !== 'keybindings' ? "overflow-y-auto p-6 space-y-6" : "overflow-hidden")}>
            {activeTab === 'general' && (
              <div className="space-y-4">
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
                <div className="flex items-center justify-between mb-2">
                    <h3 className="text-sm font-bold text-gray-300">{t('settings.aiProviders')}</h3>
                </div>
                
                {settings.providers.map(provider => (
                    <div key={provider.id} className="border border-gray-600 rounded p-3 bg-[#2d2d2d]">
                        <div className="flex items-center justify-between mb-2">
                            <span className="font-semibold text-gray-200">{provider.name}</span>
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
                                        className="w-full bg-[#3c3c3c] border border-gray-600 rounded px-2 py-1 text-white text-xs focus:outline-none focus:border-blue-500"
                                        placeholder={t('settings.apiKeyFor', { providerName: provider.name })}
                                    />
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
                            </div>
                        )}
                    </div>
                ))}

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

            {activeTab === 'keybindings' && <KeyboardShortcuts />}
          </div>
        </div>
      </div>
    </div>
  );
};
