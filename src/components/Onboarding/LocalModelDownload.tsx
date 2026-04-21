/**
 * IfAI Editor - Local Model Download Dialog
 * =========================================
 *
 * 本地模型下载对话框
 *
 * 功能：
 * - 显示下载进度
 * - 显示下载速度和预计剩余时间
 * - 支持后台下载
 * - 支持取消下载
 */

import React, { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';

// ============================================================================
// Types
// ============================================================================

type DownloadStatus = 'NotStarted' | 'Downloading' | 'Completed' | 'Failed' | 'Cancelled';

interface DownloadState {
  status: DownloadStatus;
  progress: number;
  bytes_downloaded: number;
  total_bytes: number;
  speed: number;
  eta: number;
}

interface LocalModelDownloadProps {
  onComplete: () => void;
  onCancel: () => void;
  onError: (error: string) => void;
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
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
};

// ============================================================================
// Component
// ============================================================================

export const LocalModelDownload: React.FC<LocalModelDownloadProps> = ({
  onComplete,
  onCancel,
  onError,
}) => {
  const { t } = useTranslation();
  const [state, setState] = useState<DownloadState>({
    status: 'NotStarted',
    progress: 0,
    bytes_downloaded: 0,
    total_bytes: 379 * 1024 * 1024, // Default 379MB
    speed: 0,
    eta: 0,
  });
  const [isInBackground, setIsInBackground] = useState(false);

  // 开始下载
  const startDownload = useCallback(async () => {
    try {
      const result = await invoke<DownloadState>('start_download');
      setState(result);
    } catch (err) {
      const error = err as string;
      setState(prev => ({ ...prev, status: 'Failed' }));
      onError(error);
      toast.error(`${t('localModel.downloadFailed')}: ${error}`);
    }
  }, [onError, t]);

  // 取消下载
  const handleCancel = async () => {
    try {
      await invoke('cancel_download');
      setState(prev => ({ ...prev, status: 'Cancelled' }));
      onCancel();
    } catch (err) {
      toast.error(`${t('localModel.cancelFailed')}: ${err}`);
    }
  };

  // 后台下载
  const handleBackground = () => {
    setIsInBackground(true);
    toast.info(t('localModel.backgroundDownloadNotice'));
  };

  // 监听下载进度事件
  useEffect(() => {
    const unlistenProgress = listen<DownloadState>('model-download-progress', (event) => {
      setState(event.payload);
    });

    const unlistenComplete = listen<DownloadState>('model-download-complete', (event) => {
      setState(event.payload);
      if (event.payload.status === 'Completed') {
        toast.success(t('localModel.downloadComplete'));
        setTimeout(() => onComplete(), 1000);
      }
    });

    return () => {
      unlistenProgress.then(f => f());
      unlistenComplete.then(f => f());
    };
  }, [onComplete, t]);

  // 自动开始下载
  useEffect(() => {
    if (state.status === 'NotStarted') {
      startDownload();
    }
  }, [state.status, startDownload]);

  // ============================================================================
  // Render
  // ============================================================================

  // 后台模式显示
  if (isInBackground) {
    return (
      <div className="theme-panel-elevated theme-border theme-shadow fixed bottom-4 right-4 z-50 max-w-sm rounded-lg border p-4 animate-slide-up">
        <div className="flex items-center gap-3">
          <div className="theme-surface-accent flex h-10 w-10 items-center justify-center rounded-full">
            <svg className="theme-text-accent h-5 w-5 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <p className="theme-text truncate text-sm font-medium">{t('localModel.downloading')}</p>
            <p className="theme-text-subtle text-xs">
              {state.progress}% • {formatSpeed(state.speed)}
            </p>
          </div>
          <button
            onClick={() => setIsInBackground(false)}
            className="theme-button-ghost theme-text-accent rounded px-2 py-1 text-sm"
          >
            {t('localModel.view')}
          </button>
        </div>
      </div>
    );
  }

  // 完成状态
  if (state.status === 'Completed') {
    return (
      <div className="theme-backdrop fixed inset-0 z-50 flex items-center justify-center">
        <div className="theme-panel-elevated theme-border theme-shadow mx-4 w-full max-w-md rounded-xl border p-8 text-center animate-fade-in">
          <div className="theme-surface-success mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full">
            <svg className="theme-text-success h-10 w-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="theme-text mb-2 text-xl font-bold">{t('localModel.downloadCompleteTitle')}</h2>
          <p className="theme-text-subtle mb-6">{t('localModel.downloadCompleteMessage')}</p>
          <button
            onClick={onComplete}
            className="theme-button-primary w-full rounded-lg px-4 py-3 font-medium"
          >
            {t('localModel.start')}
          </button>
        </div>
      </div>
    );
  }

  // 失败状态
  if (state.status === 'Failed' || state.status === 'Cancelled') {
    return (
      <div className="theme-backdrop fixed inset-0 z-50 flex items-center justify-center">
        <div className="theme-panel-elevated theme-border theme-shadow mx-4 w-full max-w-md rounded-xl border p-8 text-center animate-fade-in">
          <div className="theme-surface-danger mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full">
            <svg className="theme-text-danger h-10 w-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <h2 className="theme-text mb-2 text-xl font-bold">
            {state.status === 'Failed' ? t('localModel.downloadFailedTitle') : t('localModel.downloadCancelledTitle')}
          </h2>
          <p className="theme-text-subtle mb-6">
            {state.status === 'Failed'
              ? t('localModel.downloadFailedMessage')
              : t('localModel.downloadCancelledMessage')}
          </p>
          <button
            onClick={onComplete}
            className="theme-button-secondary w-full rounded-lg px-4 py-3 font-medium"
          >
            {t('localModel.continue')}
          </button>
        </div>
      </div>
    );
  }

  // 下载进度
  return (
    <div className="theme-backdrop fixed inset-0 z-50 flex items-center justify-center">
        <div className="theme-panel-elevated theme-border theme-shadow mx-4 w-full max-w-md overflow-hidden rounded-xl border animate-fade-in">
          {/* Header */}
        <div className="theme-panel-muted theme-border border-b px-6 py-6">
          <div className="flex items-center gap-3 mb-2">
            <div className={`theme-surface-accent flex h-10 w-10 items-center justify-center rounded-full ${state.status === 'Downloading' ? 'animate-pulse' : ''}`}>
              {state.status === 'Downloading' ? (
                <svg className="theme-text-accent h-6 w-6 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
              ) : (
                <svg className="theme-text-accent h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10" />
                </svg>
              )}
            </div>
            <div>
              <h2 className="theme-text text-lg font-bold">{t('localModel.downloadingModel')}</h2>
              <p className="theme-text-muted text-sm">{t('localModel.pleaseWait')}</p>
            </div>
          </div>
        </div>

        {/* Progress */}
        <div className="px-6 py-6">
          {/* 进度条 */}
          <div className="mb-6">
            <div className="flex justify-between text-sm mb-2">
              <span className="theme-text font-medium">{t('localModel.downloadProgress')}</span>
              <span className="theme-text-accent font-semibold">{state.progress}%</span>
            </div>
            <div className="theme-input-surface h-3 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full bg-[var(--accent-color)] transition-all duration-300 ease-out"
                style={{ width: `${state.progress}%` }}
              />
            </div>
          </div>

          {/* 统计信息 */}
          <div className="grid grid-cols-2 gap-4 mb-6">
            <div className="theme-panel-muted rounded-lg p-3">
              <div className="theme-text-subtle mb-1 text-xs">{t('localModel.downloaded')}</div>
              <div className="theme-text font-semibold">
                {formatBytes(state.bytes_downloaded)} / {formatBytes(state.total_bytes)}
              </div>
            </div>
            <div className="theme-panel-muted rounded-lg p-3">
              <div className="theme-text-subtle mb-1 text-xs">{t('localModel.downloadSpeed')}</div>
              <div className="theme-text font-semibold">{formatSpeed(state.speed)}</div>
            </div>
          </div>

          {/* 预计时间 */}
          {state.eta > 0 && (
            <div className="theme-surface-accent mb-6 rounded-lg p-3">
              <div className="theme-text-accent flex items-center gap-2 text-sm">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>{t('localModel.estimatedTime')}: <strong>{formatETA(state.eta)}</strong></span>
              </div>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="px-6 pb-6 flex gap-3">
          <button
            onClick={handleBackground}
            className="theme-button-secondary flex-1 rounded-lg px-4 py-2.5 font-medium"
          >
            {t('localModel.background')}
          </button>
          <button
            onClick={handleCancel}
            className="theme-button-danger flex-1 rounded-lg px-4 py-2.5 font-medium"
          >
            {t('localModel.cancel')}
          </button>
        </div>
      </div>
    </div>
  );
};
