/**
 * ExploreProgress Component
 *
 * Displays real-time progress for explore agent operations:
 * - Phase indicator (scanning/analyzing)
 * - Overall progress bar
 * - Directory tree progress
 * - Current file being scanned
 */

import React, { useMemo } from 'react';
import { Search, Folder, File, CheckCircle2, Circle, Loader2 } from 'lucide-react';

// ============================================================================
// Types
// ============================================================================

export interface ExploreProgressData {
  phase: 'scanning' | 'analyzing';
  currentPath?: string;
  progress: {
    total: number;
    scanned: number;
    byDirectory: Record<string, {
      total: number;
      scanned: number;
      status: 'pending' | 'scanning' | 'completed';
    }>;
  };
}

interface ExploreProgressProps {
  progress: ExploreProgressData;
  compact?: boolean; // Compact mode for monitor panel
}

// ============================================================================
// Helper Components
// ============================================================================

const PhaseIndicator: React.FC<{ phase: 'scanning' | 'analyzing' }> = ({ phase }) => {
  const phases = [
    { key: 'scanning', label: '扫描', icon: Search },
    { key: 'analyzing', label: '分析', icon: File },
  ];

  const currentIndex = phases.findIndex(p => p.key === phase);

  return (
    <div className="flex items-center gap-2 mb-3">
      {phases.map((p, index) => {
        const Icon = p.icon;
        const isActive = index === currentIndex;
        const isCompleted = index < currentIndex;

        return (
          <React.Fragment key={p.key}>
            <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border transition-all ${
              isActive
                ? 'bg-blue-600/20 border-blue-500 text-blue-400'
                : isCompleted
                ? 'bg-green-600/20 border-green-500 text-green-400'
                : 'bg-gray-800 border-gray-700 text-gray-500'
            }`}>
              <Icon size={14} />
              <span className="text-xs font-medium">{p.label}</span>
              {isActive && (
                <Loader2 size={12} className="animate-spin ml-1" />
              )}
              {isCompleted && (
                <CheckCircle2 size={12} className="ml-1" />
              )}
            </div>
            {index < phases.length - 1 && (
              <div className={`w-8 h-0.5 ${
                index < currentIndex ? 'bg-green-500' : 'bg-gray-700'
              }`} />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
};

const ProgressBar: React.FC<{ current: number; total: number }> = ({ current, total }) => {
  const percentage = total > 0 ? Math.round((current / total) * 100) : 0;

  return (
    <div className="mb-3">
      <div className="flex justify-between items-center mb-1">
        <span className="text-xs text-gray-400">总体进度</span>
        <span className="text-xs font-medium text-gray-300">{percentage}%</span>
      </div>
      <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-blue-600 to-blue-400 transition-all duration-300 ease-out"
          style={{ width: `${percentage}%` }}
        />
      </div>
      <div className="text-xs text-gray-500 mt-1">
        {current} / {total} 个文件
      </div>
    </div>
  );
};

const DirectoryTreeProgress: React.FC<{
  byDirectory: ExploreProgressData['progress']['byDirectory'];
  compact?: boolean;
}> = ({ byDirectory, compact }) => {
  const directories = useMemo(() => {
    return Object.entries(byDirectory)
      .map(([path, data]) => ({ path, ...data }))
      .sort((a, b) => {
        // Sort by status: scanning first, then pending, then completed
        const statusOrder = { scanning: 0, pending: 1, completed: 2 };
        return statusOrder[a.status] - statusOrder[b.status];
      });
  }, [byDirectory]);

  if (compact) {
    // Compact mode: show only active/pending directories
    const activeDirs = directories.filter(d => d.status !== 'completed');
    if (activeDirs.length === 0) return null;

    return (
      <div className="space-y-1">
        {activeDirs.slice(0, 3).map((dir) => {
          const percentage = dir.total > 0 ? Math.round((dir.scanned / dir.total) * 100) : 0;
          return (
            <div key={dir.path} className="flex items-center gap-2 text-xs">
              <Folder size={12} className="text-gray-500 flex-shrink-0" />
              <span className="flex-1 truncate text-gray-400">{dir.path}</span>
              <span className="text-gray-500">{percentage}%</span>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className="space-y-2 mt-3">
      <div className="text-xs text-gray-400 font-medium">目录扫描状态</div>
      {directories.map((dir) => {
        const percentage = dir.total > 0 ? Math.round((dir.scanned / dir.total) * 100) : 0;
        const isScanning = dir.status === 'scanning';
        const isCompleted = dir.status === 'completed';

        return (
          <div key={dir.path} className="flex items-start gap-2">
            <div className="flex-shrink-0 mt-0.5">
              {isCompleted ? (
                <CheckCircle2 size={14} className="text-green-500" />
              ) : isScanning ? (
                <Loader2 size={14} className="text-blue-500 animate-spin" />
              ) : (
                <Circle size={14} className="text-gray-600" fill="none" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex justify-between items-center mb-1">
                <span className={`text-xs truncate ${
                  isScanning ? 'text-blue-400 font-medium' : 'text-gray-400'
                }`}>
                  {dir.path}
                </span>
                <span className="text-xs text-gray-500 ml-2">
                  {dir.scanned}/{dir.total}
                </span>
              </div>
              <div className="h-1 bg-gray-800 rounded-full overflow-hidden">
                <div
                  className={`h-full transition-all duration-300 ${
                    isCompleted ? 'bg-green-500' : isScanning ? 'bg-blue-500' : 'bg-gray-700'
                  }`}
                  style={{ width: `${percentage}%` }}
                />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};

// ============================================================================
// Main Component
// ============================================================================

export const ExploreProgress: React.FC<ExploreProgressProps> = ({ progress, compact = false }) => {
  const { phase, currentPath, progress: data } = progress;
  const percentage = data.total > 0 ? Math.round((data.scanned / data.total) * 100) : 0;

  if (compact) {
    return (
      <div className="bg-gray-900 border border-gray-800 rounded-lg p-3">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            {phase === 'scanning' ? (
              <Loader2 size={14} className="text-blue-500 animate-spin" />
            ) : (
              <Search size={14} className="text-gray-400" />
            )}
            <span className="text-xs font-medium text-gray-300">
              {phase === 'scanning' ? '扫描中' : '分析中'}
            </span>
          </div>
          <span className="text-xs text-gray-500">{percentage}%</span>
        </div>
        <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
          <div
            className="h-full bg-blue-500 transition-all duration-300"
            style={{ width: `${percentage}%` }}
          />
        </div>
        {currentPath && (
          <div className="mt-2 text-xs text-gray-500 truncate" title={currentPath}>
            {currentPath}
          </div>
        )}
        <DirectoryTreeProgress byDirectory={data.byDirectory} compact />
      </div>
    );
  }

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg p-4 my-2">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Search size={16} className="text-blue-500" />
          <span className="text-sm font-medium text-gray-200">探索中</span>
        </div>
        {currentPath && (
          <div className="text-xs text-gray-500 truncate max-w-[200px]" title={currentPath}>
            {currentPath}
          </div>
        )}
      </div>

      {/* Phase Indicator */}
      <PhaseIndicator phase={phase} />

      {/* Overall Progress */}
      <ProgressBar current={data.scanned} total={data.total} />

      {/* Directory Tree */}
      <DirectoryTreeProgress byDirectory={data.byDirectory} />
    </div>
  );
};

export default ExploreProgress;
