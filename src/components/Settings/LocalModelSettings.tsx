/**
 * IfAI Editor - Local Model Settings Component
 * ============================================
 *
 * 本地模型设置组件，用于：
 * - 显示模型状态和下载进度
 * - 手动下载模型
 * - 启用/禁用本地模型
 * - 配置本地推理参数
 */

import React, { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { listen } from '@tauri-apps/api/event';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';

// ============================================================================
// Types
// ============================================================================

interface ModelInfo {
  path: string;
  size_mb: number;
  size_bytes: number;
  format: string;
  model: string;
}

interface SystemInfo {
  os: string;
  arch: string;
  family: string;
  model_dir: string;
  model_exists: boolean;
}

interface LocalModelConfig {
  model_name: string;
  enabled: boolean;
  max_seq_length: number;
  temperature: number;
  top_p: number;
  context_size: number;
}

type DownloadStatus = 'NotStarted' | 'Downloading' | 'Completed' | 'Failed' | 'Cancelled';

interface DownloadState {
  status: DownloadStatus;
  progress: number;
  bytes_downloaded: number;
  total_bytes: number;
  speed: number;
  eta: number;
}

// ============================================================================
// Helper Functions
// ============================================================================

const formatBytes = (bytes: number): string => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
};

const formatSpeed = (bytesPerSecond: number): string => {
  return `${formatBytes(bytesPerSecond)}/s`;
};

const formatETA = (seconds: number): string => {
  if (seconds === 0) return '--';
  if (seconds < 60) return `${seconds}秒`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}分${seconds % 60}秒`;
  return `${Math.floor(seconds / 3600)}小时${Math.floor((seconds % 3600) / 60)}分`;
};

// ============================================================================
// Component
// ============================================================================

export const LocalModelSettings: React.FC = () => {
  const { t } = useTranslation();
  const [config, setConfig] = useState<LocalModelConfig | null>(null);
  const [modelInfo, setModelInfo] = useState<ModelInfo | null>(null);
  const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null);
  const [downloadState, setDownloadState] = useState<DownloadState>({
    status: 'NotStarted',
    progress: 0,
    bytes_downloaded: 0,
    total_bytes: 379 * 1024 * 1024,
    speed: 0,
    eta: 0,
  });
  const [showDownloadDialog, setShowDownloadDialog] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 加载配置和系统信息
  useEffect(() => {
    loadInfo();
  }, []);

  // 监听下载进度
  useEffect(() => {
    const unlistenProgress = listen<DownloadState>('model-download-progress', (event) => {
      setDownloadState(event.payload);
    });

    const unlistenComplete = listen<DownloadState>('model-download-complete', (event) => {
      setDownloadState(event.payload);
      if (event.payload.status === 'Completed') {
        toast.success(t('localModelSettings.downloadComplete'));
        loadInfo(); // 刷新模型状态
      }
    });

    return () => {
      unlistenProgress.then(f => f());
      unlistenComplete.then(f => f());
    };
  }, []);

  const loadInfo = async () => {
    try {
      setLoading(true);

      const [cfg, sys] = await Promise.all([
        invoke<LocalModelConfig>('get_local_model_config'),
        invoke<SystemInfo>('get_system_info'),
      ]);

      setConfig(cfg);
      setSystemInfo(sys);

      // 如果模型存在，加载模型信息
      if (sys.model_exists) {
        const info = await invoke<ModelInfo>('validate_local_model');
        setModelInfo(info);
      } else {
        setModelInfo(null);
      }

      // 加载下载状态
      const downloadStatus = await invoke<DownloadState>('get_download_status');
      setDownloadState(downloadStatus);

      setError(null);
    } catch (err) {
      setError(err as string);
    } finally {
      setLoading(false);
    }
  };

  // 开始下载
  const handleStartDownload = async () => {
    try {
      const result = await invoke<DownloadState>('start_download');
      setDownloadState(result);
      setShowDownloadDialog(true);
    } catch (err) {
      const error = err as string;
      setError(error);
      toast.error(t('localModelSettings.downloadFailed', { error }));
    }
  };

  // 取消下载
  const handleCancelDownload = async () => {
    try {
      await invoke('cancel_download');
      setDownloadState(prev => ({ ...prev, status: 'Cancelled' }));
      setShowDownloadDialog(false);
    } catch (err) {
      toast.error(t('localModelSettings.cancelFailed', { error: err }));
    }
  };

  // 切换本地模型启用状态
  const handleToggleEnabled = async () => {
    if (!config) return;

    const newEnabled = !config.enabled;
    setConfig({ ...config, enabled: newEnabled });

    // TODO: 调用后端 API 保存配置
    toast.success(newEnabled ? t('localModelSettings.enabled') : t('localModelSettings.disabled'));
  };

  // 验证模型
  const handleValidate = async () => {
    try {
      const info = await invoke<ModelInfo>('validate_local_model');
      setModelInfo(info);
      setError(null);
      toast.success(t('localModelSettings.validateSuccess'));
    } catch (err) {
      setError(err as string);
      setModelInfo(null);
    }
  };

  // 打开模型目录
  const handleOpenModelDir = async () => {
    if (systemInfo) {
      open({ directory: true, path: systemInfo.model_dir }).catch(console.error);
    }
  };

  // 测试工具调用解析
  const handleTestToolParse = async () => {
    const testText = "我会使用 agent_read_file(rel_path='src/auth.ts') 来完成这个任务。";
    try {
      const result = await invoke<any[]>('test_tool_parse', { text: testText });
      console.log('Tool parse result:', result);
      toast.success(`${t('localModelSettings.parseSuccess')}\n${JSON.stringify(result, null, 2)}`);
    } catch (err) {
      console.error(err);
      toast.error(t('localModelSettings.parseFailed'));
    }
  };

  // ============================================================================
  // Render
  // ============================================================================

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-gray-500">{t('common.loading')}</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 标题 */}
      <div className="border-b pb-4">
        <h2 className="text-xl font-semibold">{t('localModelSettings.title')}</h2>
        <p className="text-sm text-gray-500 mt-1">
          {t('localModelSettings.description')}
        </p>
      </div>

      {/* 模型状态卡片 */}
      <div className={`rounded-lg p-4 ${
        modelInfo ? 'bg-green-50 border border-green-200' :
        downloadState.status === 'Downloading' ? 'bg-blue-50 border border-blue-200' :
        'bg-yellow-50 border border-yellow-200'
      }`}>
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <h3 className="font-semibold text-gray-900">{t('localModelSettings.modelStatus')}</h3>
              {modelInfo && (
                <span className="px-2 py-0.5 text-xs bg-green-600 text-white rounded-full">{t('localModelSettings.downloaded')}</span>
              )}
              {downloadState.status === 'Downloading' && (
                <span className="px-2 py-0.5 text-xs bg-blue-600 text-white rounded-full animate-pulse">{t('localModelSettings.downloading')}</span>
              )}
              {!modelInfo && downloadState.status !== 'Downloading' && (
                <span className="px-2 py-0.5 text-xs bg-yellow-600 text-white rounded-full">{t('localModelSettings.notDownloaded')}</span>
              )}
            </div>

            {modelInfo ? (
              <div className="mt-3 text-sm space-y-2 bg-white/50 rounded-lg p-3">
                <div className="flex items-baseline gap-2">
                  <span className="font-semibold text-gray-700 min-w-[3rem]">{t('localModelSettings.file')}:</span>
                  <span className="text-gray-900 break-all font-mono text-xs">{modelInfo.path}</span>
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="font-semibold text-gray-700 min-w-[3rem]">{t('localModelSettings.size')}:</span>
                  <span className="text-gray-900 font-medium">{modelInfo.size_mb.toFixed(2)} MB</span>
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="font-semibold text-gray-700 min-w-[3rem]">{t('localModelSettings.format')}:</span>
                  <span className="text-gray-900 font-medium">{modelInfo.format}</span>
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="font-semibold text-gray-700 min-w-[3rem]">{t('localModelSettings.model')}:</span>
                  <span className="text-gray-900 font-medium">{modelInfo.model}</span>
                </div>
              </div>
            ) : downloadState.status === 'Downloading' ? (
              <div className="mt-3 space-y-2">
                <div className="flex items-center justify-between text-sm mb-1">
                  <span className="font-medium">{t('localModelSettings.downloadProgress')}</span>
                  <span className="text-blue-600 font-semibold">{downloadState.progress}%</span>
                </div>
                <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-blue-500 rounded-full transition-all duration-300"
                    style={{ width: `${downloadState.progress}%` }}
                  />
                </div>
                <div className="grid grid-cols-3 gap-2 text-xs text-gray-600">
                  <div>{formatBytes(downloadState.bytes_downloaded)} / {formatBytes(downloadState.total_bytes)}</div>
                  <div>{formatSpeed(downloadState.speed)}</div>
                  <div>{formatETA(downloadState.eta)}</div>
                </div>
              </div>
            ) : (
              <p className="mt-2 text-sm text-yellow-700">
                {t('localModelSettings.modelNotFound')}
              </p>
            )}
          </div>

          <div className="flex gap-2 ml-4">
            {modelInfo && (
              <>
                <button
                  onClick={handleValidate}
                  className="px-3 py-1.5 text-sm bg-blue-500 text-white rounded hover:bg-blue-600"
                >
                  {t('localModelSettings.refresh')}
                </button>
                <button
                  onClick={handleOpenModelDir}
                  className="px-3 py-1.5 text-sm bg-gray-500 text-white rounded hover:bg-gray-600"
                >
                  {t('localModelSettings.openDir')}
                </button>
              </>
            )}
            {!modelInfo && downloadState.status !== 'Downloading' && (
              <button
                onClick={handleStartDownload}
                className="px-4 py-2 text-sm bg-gradient-to-r from-blue-500 to-purple-600 text-white rounded hover:from-blue-600 hover:to-purple-700 flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                {t('localModelSettings.downloadModel')}
              </button>
            )}
            {downloadState.status === 'Downloading' && (
              <button
                onClick={handleCancelDownload}
                className="px-3 py-1.5 text-sm bg-red-500 text-white rounded hover:bg-red-600"
              >
                {t('localModelSettings.cancel')}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 启用开关 */}
      {modelInfo && config && (
        <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-gray-900">{t('localModelSettings.enableLocalModel')}</h3>
              <p className="text-sm text-gray-600 mt-1">
                {t('localModelSettings.enableLocalModelDesc')}
              </p>
            </div>
            <button
              onClick={handleToggleEnabled}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                config.enabled ? 'bg-blue-600' : 'bg-gray-300'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  config.enabled ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>
        </div>
      )}

      {/* 系统信息 */}
      {systemInfo && (
        <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
          <h3 className="font-semibold text-gray-900 mb-3">{t('localModelSettings.systemInfo')}</h3>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="flex items-baseline gap-2">
              <span className="font-semibold text-gray-700">{t('localModelSettings.os')}:</span>
              <span className="text-gray-900">{systemInfo.os}</span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="font-semibold text-gray-700">{t('localModelSettings.arch')}:</span>
              <span className="text-gray-900">{systemInfo.arch}</span>
            </div>
            <div className="col-span-2 flex items-baseline gap-2">
              <span className="font-semibold text-gray-700">{t('localModelSettings.modelDir')}:</span>
              <span className="text-gray-900 break-all font-mono text-xs">{systemInfo.model_dir}</span>
            </div>
          </div>
        </div>
      )}

      {/* 错误信息 */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* 推理参数 */}
      {config && modelInfo && (
        <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm space-y-4">
          <h3 className="font-semibold text-gray-900">{t('localModelSettings.inferenceParams')}</h3>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Temperature</label>
              <input
                type="number"
                step="0.1"
                min="0"
                max="2"
                value={config.temperature}
                onChange={(e) => setConfig({ ...config, temperature: parseFloat(e.target.value) })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
              <p className="text-xs text-gray-500 mt-1.5">{t('localModelSettings.temperatureDesc')}</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Top P</label>
              <input
                type="number"
                step="0.05"
                min="0"
                max="1"
                value={config.top_p}
                onChange={(e) => setConfig({ ...config, top_p: parseFloat(e.target.value) })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
              <p className="text-xs text-gray-500 mt-1.5">{t('localModelSettings.topPDesc')}</p>
            </div>
          </div>
        </div>
      )}

      {/* 测试按钮 */}
      <div className="border-t border-gray-200 pt-4">
        <h3 className="font-semibold text-gray-900 mb-3">{t('localModelSettings.testFeatures')}</h3>
        <div className="flex gap-2">
          <button
            onClick={handleTestToolParse}
            className="px-4 py-2 text-sm font-medium bg-purple-500 text-white rounded-md hover:bg-purple-600 transition-colors"
          >
            {t('localModelSettings.testToolParse')}
          </button>
        </div>
      </div>

      {/* 功能说明 */}
      <div className="bg-white border border-blue-200 rounded-lg p-4 text-sm shadow-sm">
        <h3 className="font-semibold text-gray-900 mb-3">{t('localModelSettings.currentlySupported')}</h3>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li className="flex items-start gap-2">
            <span className="text-blue-500 mt-0.5">•</span>
            <span>{t('localModelSettings.supportFeature1')}</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-blue-500 mt-0.5">•</span>
            <span>{t('localModelSettings.supportFeature2')}</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-blue-500 mt-0.5">•</span>
            <span>{t('localModelSettings.supportFeature3')}</span>
          </li>
        </ul>

        <h3 className="font-semibold text-gray-900 mt-5 mb-3">{t('localModelSettings.comingSoon')}</h3>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li className="flex items-start gap-2">
            <span className="text-purple-500 mt-0.5">•</span>
            <span>{t('localModelSettings.comingFeature1')}</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-purple-500 mt-0.5">•</span>
            <span>{t('localModelSettings.comingFeature2')}</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-purple-500 mt-0.5">•</span>
            <span>{t('localModelSettings.comingFeature3')}</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-purple-500 mt-0.5">•</span>
            <span>{t('localModelSettings.comingFeature4')}</span>
          </li>
        </ul>
      </div>
    </div>
  );
};
