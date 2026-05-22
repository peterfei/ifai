/**
 * ArtifactsPanel — 产出物子面板
 *
 * 从 useArtifactData 获取文件变更数据，
 * 支持点击选择文件进行预览
 */

import React from 'react';
import { useArtifactData, type FileChangeData } from './useArtifactData';

/** 文件类型 → 图标标签 */
function getFileTypeIcon(type: string): string {
  const icons: Record<string, string> = {
    ts: 'TS',
    tsx: 'TX',
    test: 'T',
    md: 'M',
    css: 'C',
    json: 'J',
  };
  return icons[type] ?? '#';
}

interface ArtifactsPanelProps {
  /** 文件选择回调 */
  onFileSelect?: (file: FileChangeData) => void;
}

export function ArtifactsPanel({ onFileSelect }: ArtifactsPanelProps) {
  const artifacts = useArtifactData();

  if (artifacts.length === 0) {
    return (
      <div data-testid="artifacts-panel" style={{ padding: '16px', textAlign: 'center', color: '#9CA3AF', fontSize: '13px' }}>
        暂无产出物
      </div>
    );
  }

  return (
    <div data-testid="artifacts-panel" style={{ padding: '8px 12px' }}>
      {artifacts.map((file) => (
        <div
          key={file.path}
          onClick={() => onFileSelect?.(file)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            padding: '8px 12px',
            borderRadius: 6,
            cursor: onFileSelect ? 'pointer' : 'default',
            transition: 'background 0.2s',
            marginBottom: 2,
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLElement).style.background = '#2D2D2D';
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.background = 'transparent';
          }}
        >
          {/* 文件图标 */}
          <div
            style={{
              width: 20,
              height: 20,
              borderRadius: 4,
              background: '#2D2D2D',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <span style={{ fontSize: 10, fontWeight: 700, color: '#9CA3AF' }}>
              {getFileTypeIcon(file.type)}
            </span>
          </div>

          {/* 文件名 */}
          <span style={{ flex: 1, fontSize: 13, color: '#fff', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {file.name}
          </span>

          {/* 文件大小 */}
          <span style={{ fontSize: 12, color: '#9CA3AF', flexShrink: 0 }}>
            {file.size}
          </span>
        </div>
      ))}
    </div>
  );
}
