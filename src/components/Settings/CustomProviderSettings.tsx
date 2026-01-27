import React, { useState } from 'react';
import { Plus, Trash2, Edit2, Check, X, Globe, Sliders, RefreshCw } from 'lucide-react';
import { useSettingsStore, PresetTemplate, MODEL_PARAM_PRESETS, PRESET_ENDPOINTS } from '../../stores/settingsStore';
import { AIProviderConfig } from '../../stores/settingsStore';
import { ModelParamsConfigComponent } from './ModelParamsConfig';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';

export const CustomProviderSettings = () => {
  const { t } = useTranslation();
  const settings = useSettingsStore();
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showParamsEditor, setShowParamsEditor] = useState<string | null>(null);
  const [refreshingProvider, setRefreshingProvider] = useState<string | null>(null);

  // 新建提供商表单状态
  const [newProvider, setNewProvider] = useState({
    name: '',
    presetTemplate: 'ollama' as PresetTemplate,
    customEndpoint: '',
    apiKey: '',
  });

  // 获取自定义提供商
  const customProviders = settings.providers.filter(p => p.isCustom);

  // 预设模板选项
  const presetOptions: { value: PresetTemplate; label: string; description: string }[] = [
    { value: 'ollama', label: 'Ollama', description: 'http://localhost:11434' },
    { value: 'vllm', label: 'vLLM', description: 'http://localhost:8000' },
    { value: 'localai', label: 'LocalAI', description: 'http://localhost:8080' },
    { value: 'lmstudio', label: 'LM Studio', description: 'http://localhost:1234' },
    { value: 'custom', label: t('customProviderSettings.custom'), description: t('customProviderSettings.customEndpointDesc') },
  ];

  // 添加自定义提供商
  const handleAddProvider = () => {
    if (!newProvider.name.trim()) {
      alert(t('customProviderSettings.pleaseEnterName'));
      return;
    }

    const id = settings.addCustomProvider({
      name: newProvider.name,
      presetTemplate: newProvider.presetTemplate,
      customEndpoint: newProvider.customEndpoint || undefined,
      apiKey: newProvider.apiKey,
      modelParams: MODEL_PARAM_PRESETS.balanced,
    });

    // 重置表单
    setNewProvider({
      name: '',
      presetTemplate: 'ollama',
      customEndpoint: '',
      apiKey: '',
    });
    setShowAddForm(false);
  };

  // 删除提供商
  const handleDeleteProvider = (providerId: string) => {
    if (confirm(t('customProviderSettings.confirmDelete'))) {
      settings.removeProvider(providerId);
    }
  };

  // 切换编辑状态
  const handleToggleEdit = (providerId: string) => {
    if (editingId === providerId) {
      setEditingId(null);
    } else {
      setEditingId(providerId);
    }
  };

  // 从 Ollama 刷新模型列表
  const handleRefreshModels = async (provider: AIProviderConfig) => {
    setRefreshingProvider(provider.id);

    try {
      // Ollama API 端点
      const baseUrl = provider.baseUrl.replace('/v1/chat/completions', '').replace('/chat/completions', '');
      const response = await fetch(`${baseUrl}/api/tags`);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      const models = data.models?.map((m: any) => m.name) || [];

      if (models.length === 0) {
        alert(t('customProviderSettings.noModelsFound'));
        return;
      }

      // 更新提供商的模型列表
      settings.updateProviderConfig(provider.id, { models });

      alert(t('customProviderSettings.refreshSuccess', { count: models.length, models: models.slice(0, 5).join(', ') }));
    } catch (error) {
      console.error('刷新模型列表失败:', error);
      alert(t('customProviderSettings.refreshFailed', { error, baseUrl: provider.baseUrl }));
    } finally {
      setRefreshingProvider(null);
    }
  };

  // 渲染提供商卡片
  const renderProviderCard = (provider: AIProviderConfig) => {
    const isEditing = editingId === provider.id;
    const isCurrent = provider.id === settings.currentProviderId;

    return (
      <div
        key={provider.id}
        className={clsx(
          "border rounded p-4 bg-[#2d2d2d] transition-all",
          isCurrent ? "border-blue-500 bg-blue-900/10" : "border-gray-600"
        )}
      >
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center">
            <Globe size={16} className="mr-2 text-gray-400" />
            <span className="font-semibold text-gray-200">
              {provider.displayName || provider.name}
            </span>
            {isCurrent && (
              <span className="ml-2 px-2 py-0.5 text-xs bg-blue-600 text-white rounded">当前</span>
            )}
            {provider.presetTemplate && (
              <span className="ml-2 px-2 py-0.5 text-xs bg-gray-600 text-gray-300 rounded">
                {presetOptions.find(o => o.value === provider.presetTemplate)?.label}
              </span>
            )}
          </div>
          <div className="flex items-center space-x-2">
            {!isCurrent && (
              <button
                onClick={() => {
                  // 🔥 修复：如果模型列表为空，提示用户先添加模型
                  if (provider.models.length === 0) {
                    alert('请先编辑提供商并添加模型名称');
                    setEditingId(provider.id);
                    return;
                  }
                  settings.setCurrentProviderAndModel(provider.id, provider.models[0]);
                }}
                className="px-2 py-1 bg-blue-600 hover:bg-blue-700 text-white text-xs rounded transition-colors"
                disabled={provider.models.length === 0}
              >
                {t('settings.setAsDefault')}
              </button>
            )}
            <button
              onClick={() => handleToggleEdit(provider.id)}
              className="p-1 hover:bg-gray-700 rounded transition-colors"
              title={isEditing ? t('customProviderSettings.cancelEdit') : t('customProviderSettings.edit')}
            >
              {isEditing ? <X size={14} /> : <Edit2 size={14} />}
            </button>
            <button
              onClick={() => setShowParamsEditor(showParamsEditor === provider.id ? null : provider.id)}
              className={clsx(
                "p-1 hover:bg-gray-700 rounded transition-colors",
                showParamsEditor === provider.id ? "text-blue-400" : "text-gray-400"
              )}
              title={t('customProviderSettings.modelParams')}
            >
              <Sliders size={14} />
            </button>
            {/* Ollama 刷新模型按钮 */}
            {provider.presetTemplate === 'ollama' && (
              <button
                onClick={() => handleRefreshModels(provider)}
                className={clsx(
                  "p-1 hover:bg-gray-700 rounded transition-colors",
                  refreshingProvider === provider.id ? "text-yellow-400 animate-spin" : "text-green-400"
                )}
                title={t('customProviderSettings.refreshFromOllama')}
                disabled={refreshingProvider === provider.id}
              >
                <RefreshCw size={14} />
              </button>
            )}
            <button
              onClick={() => handleDeleteProvider(provider.id)}
              className="p-1 hover:bg-red-900/50 rounded transition-colors text-red-400"
              title={t('customProviderSettings.delete')}
            >
              <Trash2 size={14} />
            </button>
          </div>
        </div>

        {isEditing ? (
          // 编辑模式
          <div className="space-y-3">
            <div>
              <label className="block text-xs text-gray-400 mb-1">{t('customProviderSettings.providerName')}</label>
              <input
                type="text"
                value={provider.displayName || provider.name}
                onChange={(e) => settings.updateProviderConfig(provider.id, { displayName: e.target.value })}
                className="w-full bg-[#3c3c3c] border border-gray-600 rounded px-2 py-1 text-white text-xs"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">{t('customProviderSettings.apiUrl')}</label>
              <input
                type="text"
                value={provider.baseUrl}
                onChange={(e) => settings.updateProviderConfig(provider.id, { baseUrl: e.target.value })}
                className="w-full bg-[#3c3c3c] border border-gray-600 rounded px-2 py-1 text-white text-xs"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">API Key</label>
              <input
                type="password"
                value={provider.apiKey}
                onChange={(e) => settings.updateProviderConfig(provider.id, { apiKey: e.target.value })}
                className="w-full bg-[#3c3c3c] border border-gray-600 rounded px-2 py-1 text-white text-xs"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">{t('customProviderSettings.availableModels')}</label>
              <input
                type="text"
                value={provider.models.join(', ')}
                onChange={(e) => settings.updateProviderConfig(provider.id, { models: e.target.value.split(',').map(m => m.trim()) })}
                className="w-full bg-[#3c3c3c] border border-gray-600 rounded px-2 py-1 text-white text-xs"
              />
            </div>
            <button
              onClick={() => setEditingId(null)}
              className="w-full px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white text-xs rounded transition-colors"
            >
              <Check size={14} className="inline mr-1" />
              保存
            </button>
          </div>
        ) : (
          // 查看模式
          <div className="space-y-2 text-xs text-gray-400">
            <div className="flex justify-between">
              <span>{t('customProviderSettings.statusLabel')}:</span>
              <span className={provider.enabled ? 'text-green-400' : 'text-gray-500'}>
                {provider.enabled ? t('customProviderSettings.enabled') : t('customProviderSettings.disabled')}
              </span>
            </div>
            <div className="flex justify-between">
              <span>{t('settings.endpoint')}:</span>
              <span className="font-mono truncate max-w-[200px]" title={provider.baseUrl}>
                {provider.baseUrl}
              </span>
            </div>
            <div className="flex justify-between">
              <span>{t('settings.modelLabel')}:</span>
              <span>{provider.models.length > 0 ? provider.models[0] + t('customProviderSettings.etc') : t('customProviderSettings.notConfigured')}</span>
            </div>

            {/* 模型参数配置器 */}
            {showParamsEditor === provider.id ? (
              <div className="pt-3 border-t border-gray-600">
                <ModelParamsConfigComponent
                  config={provider.modelParams || MODEL_PARAM_PRESETS.balanced}
                  onChange={(newConfig) => settings.updateModelParams(provider.id, newConfig)}
                  showPresets={true}
                  compact={true}
                />
              </div>
            ) : (
              provider.modelParams && (
                <div className="pt-2 border-t border-gray-600">
                  <div className="text-gray-500 mb-1">参数配置:</div>
                  <div className="grid grid-cols-2 gap-1 text-xs">
                    <span>温度: {provider.modelParams.temperature}</span>
                    <span>Top-P: {provider.modelParams.top_p}</span>
                    <span className="col-span-2">最大 Token: {provider.modelParams.max_tokens}</span>
                  </div>
                </div>
              )
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* 标题和添加按钮 */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-bold text-gray-300">{t('settings.customProvider')}</h3>
          <p className="text-xs text-gray-500 mt-1">
            {t('customProviderSettings.customProviderDesc')}
          </p>
        </div>
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className={clsx(
            "flex items-center px-3 py-1.5 rounded text-sm transition-colors",
            showAddForm
              ? "bg-gray-700 text-gray-300 hover:bg-gray-600"
              : "bg-blue-600 text-white hover:bg-blue-700"
          )}
        >
          <Plus size={16} className="mr-1" />
          {t('customProviderSettings.addProvider')}
        </button>
      </div>

      {/* 添加表单 */}
      {showAddForm && (
        <div className="border border-blue-500/50 rounded p-4 bg-blue-900/10 space-y-3">
          <h4 className="text-sm font-medium text-gray-300">{t('customProviderSettings.addNewProvider')}</h4>

          <div>
            <label className="block text-xs text-gray-400 mb-1">{t('customProviderSettings.providerName')}</label>
            <input
              type="text"
              value={newProvider.name}
              onChange={(e) => setNewProvider({ ...newProvider, name: e.target.value })}
              placeholder={t('customProviderSettings.providerNamePlaceholder')}
              className="w-full bg-[#3c3c3c] border border-gray-600 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
            />
          </div>

          <div>
            <label className="block text-xs text-gray-400 mb-1">{t('customProviderSettings.presetTemplate')}</label>
            <select
              value={newProvider.presetTemplate}
              onChange={(e) => setNewProvider({ ...newProvider, presetTemplate: e.target.value as PresetTemplate })}
              className="w-full bg-[#3c3c3c] border border-gray-600 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
            >
              {presetOptions.map(option => (
                <option key={option.value} value={option.value}>
                  {option.label} - {option.description}
                </option>
              ))}
            </select>
          </div>

          {newProvider.presetTemplate === 'custom' && (
            <div>
              <label className="block text-xs text-gray-400 mb-1">{t('customProviderSettings.customEndpoint')}</label>
              <input
                type="text"
                value={newProvider.customEndpoint}
                onChange={(e) => setNewProvider({ ...newProvider, customEndpoint: e.target.value })}
                placeholder="https://your-endpoint.com/v1/chat/completions"
                className="w-full bg-[#3c3c3c] border border-gray-600 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
              />
            </div>
          )}

          <div>
            <label className="block text-xs text-gray-400 mb-1">{t('customProviderSettings.apiKeyOptional')}</label>
            <input
              type="password"
              value={newProvider.apiKey}
              onChange={(e) => setNewProvider({ ...newProvider, apiKey: e.target.value })}
              placeholder={t('customProviderSettings.apiKeyPlaceholder')}
              className="w-full bg-[#3c3c3c] border border-gray-600 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
            />
          </div>

          <div className="flex space-x-2">
            <button
              onClick={handleAddProvider}
              className="flex-1 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded transition-colors"
            >
              <Check size={16} className="inline mr-1" />
              添加
            </button>
            <button
              onClick={() => {
                setShowAddForm(false);
                setNewProvider({
                  name: '',
                  presetTemplate: 'ollama',
                  customEndpoint: '',
                  apiKey: '',
                });
              }}
              className="px-3 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 text-sm rounded transition-colors"
            >
              {t('common.cancel')}
            </button>
          </div>
        </div>
      )}

      {/* 提供商列表 */}
      {customProviders.length === 0 ? (
        <div className="text-center py-8 text-gray-500 text-sm">
          {t('customProviderSettings.noCustomProviders')}
        </div>
      ) : (
        <div className="space-y-3">
          {customProviders.map(renderProviderCard)}
        </div>
      )}
    </div>
  );
};
