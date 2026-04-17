import React, { useState } from 'react';
import { Plus, Trash2, Edit2, Check, X, Globe, Sliders, RefreshCw } from 'lucide-react';
import { useSettingsStore, PresetTemplate, MODEL_PARAM_PRESETS, PRESET_ENDPOINTS } from '../../stores/settingsStore';
import { AIProviderConfig } from '../../stores/settingsStore';
import { ModelParamsConfigComponent } from './ModelParamsConfig';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { isDarkTheme } from '../../utils/theme';

export const CustomProviderSettings = () => {
  const { t } = useTranslation();
  const settings = useSettingsStore();
  const dark = isDarkTheme(settings.theme);
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
    models: PRESET_ENDPOINTS['ollama'].defaultModels.join(', '), // 🚀 默认填充 Ollama 模型
  });

  // 🏆 PIVO 3.0: 物理对齐 - 使用官方接口获取自定义提供商
  const customProviders = settings.getProvidersByGroup('custom');

  // 预设模板选项
  const presetOptions: { value: PresetTemplate; label: string; description: string }[] = [
    { value: 'ollama', label: 'Ollama', description: 'http://localhost:11434' },
    { value: 'nvidia', label: 'NVIDIA NIM', description: 'integrate.api.nvidia.com' },
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
      models: newProvider.models.split(',').map(m => m.trim()).filter(Boolean),
      modelParams: MODEL_PARAM_PRESETS.balanced,
    });

    // 重置表单
    setNewProvider({
      name: '',
      presetTemplate: 'ollama',
      customEndpoint: '',
      apiKey: '',
      models: PRESET_ENDPOINTS['ollama'].defaultModels.join(', '),
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
          'theme-panel-muted theme-border rounded border p-4 transition-all',
          isCurrent && 'border-blue-500 bg-blue-500/10'
        )}
      >
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center">
            <Globe size={16} className="theme-text-subtle mr-2" />
            <span className="theme-text font-semibold">
              {provider.displayName || provider.name}
            </span>
            {isCurrent && (
              <span className="theme-badge-accent ml-2 rounded px-2 py-0.5 text-xs">当前</span>
            )}
            {provider.presetTemplate && (
              <span className="theme-input-surface theme-text-subtle ml-2 rounded px-2 py-0.5 text-xs">
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
                className="theme-button-primary rounded px-2 py-1 text-xs"
                disabled={provider.models.length === 0}
              >
                {t('settings.setAsDefault')}
              </button>
            )}
            <button
              onClick={() => handleToggleEdit(provider.id)}
              className="theme-button-ghost rounded p-1"
              title={isEditing ? t('customProviderSettings.cancelEdit') : t('customProviderSettings.edit')}
            >
              {isEditing ? <X size={14} /> : <Edit2 size={14} />}
            </button>
            <button
              onClick={() => setShowParamsEditor(showParamsEditor === provider.id ? null : provider.id)}
              className={clsx(
                'rounded p-1 transition-colors',
                showParamsEditor === provider.id ? 'theme-button-primary' : 'theme-button-ghost'
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
                  'rounded p-1',
                  refreshingProvider === provider.id ? 'theme-button-secondary text-yellow-400 animate-spin' : 'theme-button-ghost text-green-400'
                )}
                title={t('customProviderSettings.refreshFromOllama')}
                disabled={refreshingProvider === provider.id}
              >
                <RefreshCw size={14} />
              </button>
            )}
            <button
              onClick={() => handleDeleteProvider(provider.id)}
              className="theme-button-ghost rounded p-1 text-red-400 hover:bg-red-500/10"
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
              <label className="theme-text-subtle mb-1 block text-xs">{t('customProviderSettings.providerName')}</label>
              <input
                type="text"
                value={provider.displayName || provider.name}
                onChange={(e) => settings.updateProviderConfig(provider.id, { displayName: e.target.value })}
                className="theme-input-surface theme-border theme-text w-full rounded border px-2 py-1 text-xs"
              />
            </div>
            <div>
              <label className="theme-text-subtle mb-1 block text-xs">{t('customProviderSettings.apiUrl')}</label>
              <input
                type="text"
                value={provider.baseUrl}
                onChange={(e) => settings.updateProviderConfig(provider.id, { baseUrl: e.target.value })}
                className="theme-input-surface theme-border theme-text w-full rounded border px-2 py-1 text-xs"
              />
            </div>
            <div>
              <label className="theme-text-subtle mb-1 block text-xs">API Key</label>
              <input
                type="password"
                value={provider.apiKey}
                onChange={(e) => settings.updateProviderConfig(provider.id, { apiKey: e.target.value })}
                className="theme-input-surface theme-border theme-text w-full rounded border px-2 py-1 text-xs"
              />
            </div>
            <div>
              <label className="theme-text-subtle mb-1 block text-xs">
                {t('customProviderSettings.availableModels')} (多个模型请用逗号分隔)
              </label>
              <input
                type="text"
                value={provider.models.join(', ')}
                placeholder="例如: qwen2.5-coder, gpt-4o"
                onChange={(e) => settings.updateProviderConfig(provider.id, { models: e.target.value.split(',').map(m => m.trim()).filter(Boolean) })}
                className="theme-input-surface theme-border theme-text w-full rounded border px-2 py-1 text-xs"
              />
            </div>
            <button
              onClick={() => setEditingId(null)}
              className="theme-button-success w-full rounded px-3 py-1.5 text-xs"
            >
              <Check size={14} className="inline mr-1" />
              保存
            </button>
          </div>
        ) : (
          // 查看模式
          <div className="theme-text-subtle space-y-2 text-xs">
            <div className="flex justify-between">
              <span>{t('customProviderSettings.statusLabel')}:</span>
              <span className={provider.enabled ? 'text-green-400' : 'theme-text-subtle'}>
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
              <div className="theme-border border-t pt-3">
                <ModelParamsConfigComponent
                  config={provider.modelParams || MODEL_PARAM_PRESETS.balanced}
                  onChange={(newConfig) => settings.updateModelParams(provider.id, newConfig)}
                  showPresets={true}
                  compact={true}
                />
              </div>
            ) : (
              provider.modelParams && (
                <div className="theme-border border-t pt-2">
                  <div className="theme-text-subtle mb-1">参数配置:</div>
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
          <h3 className="theme-text-muted text-sm font-bold">{t('settings.customProvider')}</h3>
          <p className="theme-text-subtle mt-1 text-xs">
            {t('customProviderSettings.customProviderDesc')}
          </p>
        </div>
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className={clsx(
            'flex items-center rounded px-3 py-1.5 text-sm',
            showAddForm
              ? 'theme-button-secondary'
              : 'theme-button-primary'
          )}
        >
          <Plus size={16} className="mr-1" />
          {t('customProviderSettings.addProvider')}
        </button>
      </div>

      {/* 添加表单 */}
      {showAddForm && (
        <div className={dark ? 'space-y-3 rounded border border-blue-500/50 bg-blue-900/10 p-4' : 'space-y-3 rounded border border-blue-200 bg-blue-50 p-4'}>
          <h4 className="theme-text-muted text-sm font-medium">{t('customProviderSettings.addNewProvider')}</h4>

          <div>
            <label className="theme-text-subtle mb-1 block text-xs">{t('customProviderSettings.providerName')}</label>
            <input
              type="text"
              value={newProvider.name}
              onChange={(e) => setNewProvider({ ...newProvider, name: e.target.value })}
              placeholder={t('customProviderSettings.providerNamePlaceholder')}
              className="theme-input-surface theme-border theme-text w-full rounded border px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="theme-text-subtle mb-1 block text-xs">{t('customProviderSettings.presetTemplate')}</label>
            <select
              value={newProvider.presetTemplate}
              onChange={(e) => {
                const template = e.target.value as PresetTemplate;
                setNewProvider({ 
                  ...newProvider, 
                  presetTemplate: template,
                  // 🚀 自动同步预设模型
                  models: PRESET_ENDPOINTS[template]?.defaultModels.join(', ') || ''
                });
              }}
              className="theme-input-surface theme-border theme-text w-full rounded border px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            >
              {presetOptions.map(option => (
                <option key={option.value} value={option.value}>
                  {option.label} - {option.description}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="theme-text-subtle mb-1 block text-xs">
              {t('customProviderSettings.availableModels')} (多个请用逗号分隔)
            </label>
            <input
              type="text"
              value={newProvider.models}
              onChange={(e) => setNewProvider({ ...newProvider, models: e.target.value })}
              placeholder="例如: gpt-4o, qwen2.5-coder"
              className="theme-input-surface theme-border theme-text w-full rounded border px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            />
          </div>

          {newProvider.presetTemplate === 'custom' && (
            <div>
              <label className="theme-text-subtle mb-1 block text-xs">{t('customProviderSettings.customEndpoint')}</label>
              <input
                type="text"
                value={newProvider.customEndpoint}
                onChange={(e) => setNewProvider({ ...newProvider, customEndpoint: e.target.value })}
                placeholder="https://your-endpoint.com/v1/chat/completions"
                className="theme-input-surface theme-border theme-text w-full rounded border px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              />
            </div>
          )}

          <div>
            <label className="theme-text-subtle mb-1 block text-xs">{t('customProviderSettings.apiKeyOptional')}</label>
            <input
              type="password"
              value={newProvider.apiKey}
              onChange={(e) => setNewProvider({ ...newProvider, apiKey: e.target.value })}
              placeholder={t('customProviderSettings.apiKeyPlaceholder')}
              className="theme-input-surface theme-border theme-text w-full rounded border px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            />
          </div>

          <div className="flex space-x-2">
            <button
              onClick={handleAddProvider}
              className="theme-button-primary flex-1 rounded px-3 py-2 text-sm"
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
                  models: '',
                });
              }}
              className="theme-button-secondary rounded px-3 py-2 text-sm"
            >
              {t('common.cancel')}
            </button>
          </div>
        </div>
      )}

      {/* 提供商列表 */}
      {customProviders.length === 0 ? (
        <div className="theme-text-subtle py-8 text-center text-sm">
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
