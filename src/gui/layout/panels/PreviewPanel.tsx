/**
 * PreviewPanel — 内置浏览器预览
 *
 * 双模式（统一 iframe 渲染）：
 *   Tauri 模式 — invoke('read_preview_file', { path }) → blob URL → iframe
 *   浏览器模式 — http://localhost:8080/{path} → iframe
 *
 * 控件: 刷新、设备模拟、关闭
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useFileStore } from '../../../stores/fileStore';
import { isHtmlFile } from './previewRules';
import type { FileChangeData } from './useArtifactData';

// =============================================================
// 环境检测
// =============================================================

/** 是否运行在 Tauri desktop 环境 */
function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

/** 浏览器模式下的本地 HTTP 服务端口 */
const DEV_SERVER_PORT = 8080;

// =============================================================
// 类型定义
// =============================================================

interface PreviewPanelProps {
  /** 选中的文件 */
  file?: FileChangeData | null;
}

type DeviceMode = 'desktop' | 'tablet' | 'mobile';

const DEVICE_SIZES: Record<DeviceMode, { width: number; height: number }> = {
  desktop: { width: 1200, height: 900 },
  tablet: { width: 768, height: 1024 },
  mobile: { width: 375, height: 667 },
};

const DEVICE_LABELS: Record<DeviceMode, string> = {
  desktop: 'Desktop',
  tablet: 'Tablet',
  mobile: 'Mobile',
};

// =============================================================
// MIME 类型推断
// =============================================================

const MIME_MAP: Record<string, string> = {
  html: 'text/html',
  htm: 'text/html',
  js: 'application/javascript',
  css: 'text/css',
  svg: 'image/svg+xml',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  json: 'application/json',
  xml: 'application/xml',
};

function mimeFromPath(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() ?? '';
  return MIME_MAP[ext] || 'text/plain';
}

// =============================================================
// PreviewPanel 组件
// =============================================================

export function PreviewPanel({ file }: PreviewPanelProps) {
  const rootPath = useFileStore((s) => s.rootPath);
  const [deviceMode, setDeviceMode] = useState<DeviceMode>('desktop');
  const [showDeviceMenu, setShowDeviceMenu] = useState(false);
  const [previewSrc, setPreviewSrc] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>('');
  const renderKeyRef = useRef(0);
  const blobUrlRef = useRef<string>('');

  // 清理 blob URL
  const revokeBlob = () => {
    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current);
      blobUrlRef.current = '';
    }
  };

  // 加载预览内容
  const loadPreview = useCallback(async () => {
    if (!file || !isHtmlFile(file.name)) return;

    setLoading(true);
    setError('');
    revokeBlob();

    try {
      if (isTauri()) {
        // Tauri 模式：通过 invoke 读文件 → blob URL
        // 如果路径是相对路径，基于 rootPath 解析为绝对路径
        const absolutePath = file.path.startsWith('/') ? file.path : rootPath ? `${rootPath}/${file.path}` : file.path;
        const data: number[] = await invoke('read_preview_file', { path: absolutePath });
        const uint8 = new Uint8Array(data);
        const blob = new Blob([uint8], { type: mimeFromPath(file.name) });
        const url = URL.createObjectURL(blob);
        blobUrlRef.current = url;
        setPreviewSrc(url);
      } else {
        // 浏览器模式：通过 HTTP 服务加载
        const relative = rootPath && file.path.startsWith(rootPath)
          ? file.path.slice(rootPath.length).replace(/^\//, '')
          : file.path;
        setPreviewSrc(`http://localhost:${DEV_SERVER_PORT}/${relative.replace(/^\//, '')}`);
      }
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }, [file?.path, file?.name, rootPath]);

  // 文件变化时加载
  useEffect(() => {
    loadPreview();
    return revokeBlob;
  }, [loadPreview]);

  // 刷新：递增 renderKey（iframe 重新挂载）+ 重新加载
  const handleRefresh = useCallback(() => {
    renderKeyRef.current++;
    loadPreview();
  }, [loadPreview]);

  // 关闭
  const handleClose = useCallback(() => {
    renderKeyRef.current++;
    setPreviewSrc('');
    setError('');
    revokeBlob();
  }, []);

  // 切换设备
  const handleDeviceChange = useCallback(
    (mode: DeviceMode) => {
      setDeviceMode(mode);
      setShowDeviceMenu(false);
    },
    [],
  );

  // ============ 空态 ============
  if (!file) {
    return (
      <div
        data-testid="preview-panel"
        style={{
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#6B7280',
          fontSize: 13,
        }}
      >
        选择产出物中的 HTML 文件以预览
      </div>
    );
  }

  // ============ 非 HTML 文件 ============
  if (!isHtmlFile(file.name)) {
    return (
      <div
        data-testid="preview-panel"
        style={{
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#6B7280',
          fontSize: 13,
        }}
      >
        当前文件不是 HTML，无法预览
      </div>
    );
  }

  // ============ 激活态 ============
  return (
    <div
      data-testid="preview-panel"
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        padding: '12px',
        gap: 12,
      }}
    >
      {/* 标题 */}
      <div style={{ fontSize: 13, color: '#E5E7EB', fontWeight: 500 }}>{file.name}</div>

      {/* 工具栏 */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', flexShrink: 0 }}>
        {/* 刷新按钮 */}
        <button
          onClick={handleRefresh}
          style={{
            padding: '6px 12px',
            fontSize: 12,
            color: '#D1D5DB',
            background: '#2D2D2D',
            border: '1px solid #3D3D3D',
            borderRadius: 6,
            cursor: 'pointer',
          }}
        >
          刷新
        </button>

        {/* 设备模拟下拉 */}
        <div style={{ position: 'relative' }}>
          <button
            onClick={() => setShowDeviceMenu(!showDeviceMenu)}
            style={{
              padding: '6px 12px',
              fontSize: 12,
              color: '#D1D5DB',
              background: '#2D2D2D',
              border: '1px solid #3D3D3D',
              borderRadius: 6,
              cursor: 'pointer',
            }}
          >
            {DEVICE_LABELS[deviceMode]}
          </button>
          {showDeviceMenu && (
            <div
              style={{
                position: 'absolute',
                top: '100%',
                left: 0,
                marginTop: 4,
                background: '#2D2D2D',
                border: '1px solid #3D3D3D',
                borderRadius: 6,
                zIndex: 10,
              }}
            >
              {(Object.keys(DEVICE_LABELS) as DeviceMode[]).map((mode) => (
                <button
                  key={mode}
                  onClick={() => handleDeviceChange(mode)}
                  style={{
                    display: 'block',
                    width: '100%',
                    padding: '6px 16px',
                    fontSize: 12,
                    color: mode === deviceMode ? '#60A5FA' : '#D1D5DB',
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  {DEVICE_LABELS[mode]}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* 关闭按钮 */}
        <button
          onClick={handleClose}
          style={{
            padding: '6px 12px',
            fontSize: 12,
            color: '#FCA5A5',
            background: '#2D2D2D',
            border: '1px solid #3D3D3D',
            borderRadius: 6,
            cursor: 'pointer',
          }}
        >
          关闭
        </button>
      </div>

      {/* 预览内容区域 */}
      <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
        {loading ? (
          <div style={{
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#6B7280',
            fontSize: 13,
          }}>
            加载中...
          </div>
        ) : error ? (
          <div style={{
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#EF4444',
            fontSize: 12,
            padding: 16,
            textAlign: 'center',
          }}>
            {error}
          </div>
        ) : previewSrc ? (
          <iframe
            key={renderKeyRef.current}
            src={previewSrc}
            title={file.name}
            style={{
              width: '100%',
              height: '100%',
              border: '1px solid #3D3D3D',
              borderRadius: 6,
              background: '#fff',
            }}
            sandbox="allow-scripts allow-same-origin"
          />
        ) : null}
      </div>

      {/* 地址栏 */}
      {previewSrc && (
        <div style={{ fontSize: 11, color: '#6B7280', fontFamily: 'monospace', flexShrink: 0 }}>
          {previewSrc}
        </div>
      )}
    </div>
  );
}

export default PreviewPanel;
