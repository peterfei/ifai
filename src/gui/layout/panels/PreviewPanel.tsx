/**
 * PreviewPanel — 代码预览子面板
 *
 * 展示选中的文件信息，预留代码内容展示区域
 */

import React from 'react';
import type { FileChangeData } from './useArtifactData';

interface PreviewPanelProps {
  /** 选中的文件 */
  file?: FileChangeData | null;
}

export function PreviewPanel({ file }: PreviewPanelProps) {
  if (!file) {
    return (
      <div
        data-testid="preview-panel"
        style={{
          padding: '16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          color: '#9CA3AF',
          fontSize: '13px',
        }}
      >
        选择文件查看预览
      </div>
    );
  }

  return (
    <div
      data-testid="preview-panel"
      style={{ padding: '8px 12px', height: '100%', display: 'flex', flexDirection: 'column' }}
    >
      {/* 文件信息头 */}
      <div
        style={{
          borderRadius: 6,
          border: '1px solid #2D2D2D',
          background: '#1A1A1A',
          padding: '12px',
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* 头部 */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <span style={{ fontSize: 12, color: '#9CA3AF', fontWeight: 500 }}>
            {file.name}
          </span>
          <div style={{ display: 'flex', gap: 4 }}>
            <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#EF4444' }} />
            <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#F59E0B' }} />
            <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#10B981' }} />
          </div>
        </div>

        {/* 路径 */}
        <div style={{ fontSize: 11, color: '#6B7280', fontFamily: 'monospace', marginBottom: 8 }}>
          {file.path}
        </div>

        {/* 统计 */}
        <div style={{ display: 'flex', gap: 16, marginBottom: 12 }}>
          <span style={{ fontSize: 12, color: '#10B981' }}>+{file.additions}</span>
          <span style={{ fontSize: 12, color: '#EF4444' }}>-{file.deletions}</span>
          <span style={{ fontSize: 12, color: '#9CA3AF' }}>{file.size}</span>
        </div>

        {/* 预览占位 */}
        <div style={{ flex: 1, fontFamily: 'monospace', fontSize: 12, color: '#9CA3AF', lineHeight: 1.6 }}>
          <p style={{ color: 'rgba(255,255,255,0.2)', margin: 0 }}>
            {/* 文件内容预览区域 */}
          </p>
        </div>
      </div>
    </div>
  );
}
