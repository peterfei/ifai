import React, { useState } from 'react';
import { X, Monitor, Type, Cpu, Settings } from 'lucide-react';
import { useSettingsStore } from '../../stores/settingsStore';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { useLayoutStore } from '../../stores/layoutStore';

export const SettingsModal = () => {
  const { t } = useTranslation();
  const { isSettingsOpen, setSettingsOpen } = useLayoutStore();
  const settings = useSettingsStore();
  const [activeTab, setActiveTab] = useState<'general' | 'editor' | 'ai'>('general');

  if (!isSettingsOpen) return null;

  const tabs = [
    { id: 'general', label: 'General', icon: Monitor },
    { id: 'editor', label: 'Editor', icon: Type },
    { id: 'ai', label: 'AI', icon: Cpu },
  ] as const;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black bg-opacity-50" onClick={() => setSettingsOpen(false)}>
      <div className="bg-[#252526] w-[600px] h-[500px] rounded-lg shadow-xl flex overflow-hidden border border-gray-700" onClick={e => e.stopPropagation()}>
        {/* Sidebar */}
        <div className="w-48 bg-[#1e1e1e] border-r border-gray-700 p-2 flex flex-col">
          <div className="text-gray-400 text-xs font-bold uppercase tracking-wider mb-4 px-2 mt-2">{t('chat.settings')}</div>
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={clsx(
                "flex items-center px-3 py-2 text-sm rounded mb-1",
                activeTab === tab.id ? "bg-[#37373d] text-white" : "text-gray-400 hover:text-white hover:bg-[#2a2d2e]"
              )}
            >
              <tab.icon size={16} className="mr-2" />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 flex flex-col">
          <div className="flex justify-between items-center p-4 border-b border-gray-700">
            <h2 className="text-lg font-medium text-white capitalize">{activeTab} Settings</h2>
            <button onClick={() => setSettingsOpen(false)} className="text-gray-400 hover:text-white">
              <X size={18} />
            </button>
          </div>
          
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {activeTab === 'general' && (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">Theme</label>
                  <select 
                    value={settings.theme}
                    onChange={(e) => settings.updateSettings({ theme: e.target.value as 'vs-dark' | 'light' })}
                    className="w-full bg-[#3c3c3c] border border-gray-600 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
                  >
                    <option value="vs-dark">Dark</option>
                    <option value="light">Light</option>
                  </select>
                </div>
              </div>
            )}

            {activeTab === 'editor' && (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">Font Size</label>
                  <input 
                    type="number"
                    value={settings.fontSize}
                    onChange={(e) => settings.updateSettings({ fontSize: parseInt(e.target.value) })}
                    className="w-full bg-[#3c3c3c] border border-gray-600 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-300">Show Minimap</span>
                  <input 
                    type="checkbox"
                    checked={settings.showMinimap}
                    onChange={(e) => settings.updateSettings({ showMinimap: e.target.checked })}
                    className="toggle"
                  />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-300">Show Line Numbers</span>
                  <input 
                    type="checkbox"
                    checked={settings.showLineNumbers}
                    onChange={(e) => settings.updateSettings({ showLineNumbers: e.target.checked })}
                    className="toggle"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">Word Wrap</label>
                  <select 
                    value={settings.wordWrap}
                    onChange={(e) => settings.updateSettings({ wordWrap: e.target.value as 'on' | 'off' })}
                    className="w-full bg-[#3c3c3c] border border-gray-600 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
                  >
                    <option value="on">On</option>
                    <option value="off">Off</option>
                  </select>
                </div>
              </div>
            )}

            {activeTab === 'ai' && (
              <div className="space-y-6">
                <div className="flex items-center justify-between mb-2">
                    <h3 className="text-sm font-bold text-gray-300">AI Providers</h3>
                </div>
                
                {settings.providers.map(provider => (
                    <div key={provider.id} className="border border-gray-600 rounded p-3 bg-[#2d2d2d]">
                        <div className="flex items-center justify-between mb-2">
                            <span className="font-semibold text-gray-200">{provider.name}</span>
                            <div className="flex items-center">
                                <span className="text-xs text-gray-400 mr-2">{provider.enabled ? 'On' : 'Off'}</span>
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
                                    <label className="block text-xs text-gray-400 mb-1">API Key</label>
                                    <input 
                                        type="password"
                                        value={provider.apiKey}
                                        onChange={(e) => settings.updateProviderConfig(provider.id, { apiKey: e.target.value })}
                                        className="w-full bg-[#3c3c3c] border border-gray-600 rounded px-2 py-1 text-white text-xs focus:outline-none focus:border-blue-500"
                                        placeholder={`API Key for ${provider.name}`}
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs text-gray-400 mb-1">Base URL</label>
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
                  <span className="text-sm font-medium text-gray-300">Enable Autocomplete</span>
                  <input 
                    type="checkbox"
                    checked={settings.enableAutocomplete}
                    onChange={(e) => settings.updateSettings({ enableAutocomplete: e.target.checked })}
                    className="toggle"
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
