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
  if (seconds < 60) return `${seconds}秒`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}分${seconds % 60}秒`;
  return `${Math.floor(seconds / 3600)}小时${Math.floor((seconds % 3600) / 60)}分`;
};

// ============================================================================
// Component
// ============================================================================

export const LocalModelDownload: React.FC<LocalModelDownloadProps> = ({
  onComplete,
  onCancel,
  onError,
}) => {
  const [state, setState] = useState<DownloadState>({
    status: 'NotStarted',
    progress: 0,
    bytes_downloaded: 0,
    total_bytes: 379 * 1024 * 1024, // 默认 379MB
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
      toast.error(`下载失败: ${error}`);
    }
  }, [onError]);

  // 取消下载
  const handleCancel = async () => {
    try {
      await invoke('cancel_download');
      setState(prev => ({ ...prev, status: 'Cancelled' }));
      onCancel();
    } catch (err) {
      toast.error(`取消失败: ${err}`);
    }
  };

  // 后台下载
  const handleBackground = () => {
    setIsInBackground(true);
    toast.info('下载正在后台进行，完成后将通知您');
  };

  // 监听下载进度事件
  useEffect(() => {
    const unlistenProgress = listen<DownloadState>('model-download-progress', (event) => {
      setState(event.payload);
    });

    const unlistenComplete = listen<DownloadState>('model-download-complete', (event) => {
      setState(event.payload);
      if (event.payload.status === 'Completed') {
        toast.success('本地模型下载完成！');
        setTimeout(() => onComplete(), 1000);
      }
    });

    return () => {
      unlistenProgress.then(f => f());
      unlistenComplete.then(f => f());
    };
  }, [onComplete]);

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
      <div className="fixed bottom-4 right-4 z-50 bg-white rounded-lg shadow-lg border p-4 max-w-sm animate-slide-up">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
            <svg className="w-5 h-5 text-blue-600 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-900 truncate">正在下载本地模型</p>
            <p className="text-xs text-gray-500">
              {state.progress}% • {formatSpeed(state.speed)}
            </p>
          </div>
          <button
            onClick={() => setIsInBackground(false)}
            className="text-blue-600 text-sm hover:underline"
          >
            查看
          </button>
        </div>
      </div>
    );
  }

  // 完成状态
  if (state.status === 'Completed') {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
        <div className="bg-white rounded-xl shadow-2xl max-w-md w-full mx-4 p-8 text-center animate-fade-in">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-10 h-10 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">下载完成！</h2>
          <p className="text-gray-600 mb-6">本地模型已成功下载并启用，您现在可以享受本地 AI 功能了。</p>
          <button
            onClick={onComplete}
            className="w-full py-3 px-4 bg-gradient-to-r from-blue-500 to-purple-600 text-white rounded-lg font-medium hover:from-blue-600 hover:to-purple-700 transition-all"
          >
            开始使用
          </button>
        </div>
      </div>
    );
  }

  // 失败状态
  if (state.status === 'Failed' || state.status === 'Cancelled') {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
        <div className="bg-white rounded-xl shadow-2xl max-w-md w-full mx-4 p-8 text-center animate-fade-in">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-10 h-10 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">
            {state.status === 'Failed' ? '下载失败' : '下载已取消'}
          </h2>
          <p className="text-gray-600 mb-6">
            {state.status === 'Failed'
              ? '下载过程中出现错误，请稍后重试或在设置中手动下载。'
              : '您可以稍后在设置中手动下载本地模型。'}
          </p>
          <button
            onClick={onComplete}
            className="w-full py-3 px-4 bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200 transition-colors"
          >
            继续
          </button>
        </div>
      </div>
    );
  }

  // 下载进度
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-xl shadow-2xl max-w-md w-full mx-4 overflow-hidden animate-fade-in">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-500 to-purple-600 px-6 py-6 text-white">
          <div className="flex items-center gap-3 mb-2">
            <div className={`w-10 h-10 bg-white/20 rounded-full flex items-center justify-center ${state.status === 'Downloading' ? 'animate-pulse' : ''}`}>
              {state.status === 'Downloading' ? (
                <svg className="w-6 h-6 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
              ) : (
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10" />
                </svg>
              )}
            </div>
            <div>
              <h2 className="text-lg font-bold">正在下载本地 AI 模型</h2>
              <p className="text-sm text-white/80">请稍候，这可能需要几分钟...</p>
            </div>
          </div>
        </div>

        {/* Progress */}
        <div className="px-6 py-6">
          {/* 进度条 */}
          <div className="mb-6">
            <div className="flex justify-between text-sm mb-2">
              <span className="font-medium text-gray-900">下载进度</span>
              <span className="text-blue-600 font-semibold">{state.progress}%</span>
            </div>
            <div className="h-3 bg-gray-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-blue-500 to-purple-600 rounded-full transition-all duration-300 ease-out"
                style={{ width: `${state.progress}%` }}
              />
            </div>
          </div>

          {/* 统计信息 */}
          <div className="grid grid-cols-2 gap-4 mb-6">
            <div className="bg-gray-50 rounded-lg p-3">
              <div className="text-xs text-gray-500 mb-1">已下载</div>
              <div className="font-semibold text-gray-900">
                {formatBytes(state.bytes_downloaded)} / {formatBytes(state.total_bytes)}
              </div>
            </div>
            <div className="bg-gray-50 rounded-lg p-3">
              <div className="text-xs text-gray-500 mb-1">下载速度</div>
              <div className="font-semibold text-gray-900">{formatSpeed(state.speed)}</div>
            </div>
          </div>

          {/* 预计时间 */}
          {state.eta > 0 && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-6">
              <div className="flex items-center gap-2 text-sm text-blue-800">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>预计剩余时间: <strong>{formatETA(state.eta)}</strong></span>
              </div>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="px-6 pb-6 flex gap-3">
          <button
            onClick={handleBackground}
            className="flex-1 py-2.5 px-4 bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200 transition-colors"
          >
            后台下载
          </button>
          <button
            onClick={handleCancel}
            className="flex-1 py-2.5 px-4 bg-red-100 text-red-700 rounded-lg font-medium hover:bg-red-200 transition-colors"
          >
            取消
          </button>
        </div>
      </div>
    </div>
  );
};
