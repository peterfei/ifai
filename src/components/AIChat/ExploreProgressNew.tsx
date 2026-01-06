/**
 * ExploreProgress Component (Refactored with TaskMonitor)
 *
 * Now using the industrial-grade TaskMonitor system while
 * preserving the explore-specific features like file stream.
 */

import React, { useState, useEffect, useRef } from 'react';
import { Search, File, CheckCircle2, Loader2 } from 'lucide-react';
import { useTaskStore } from '../../stores/taskStore';
import { TaskCard } from '../TaskMonitor/TaskCard';
import { TaskProgressBar } from '../TaskMonitor/TaskProgressBar';
import { exploreToTaskMetadata } from './exploreTaskAdapter';
import type { ExploreProgressData } from './ExploreProgress';

interface ExploreProgressProps {
  progress: ExploreProgressData;
  mode?: 'full' | 'compact' | 'minimal';
  onOpenFile?: (path: string) => void;
}

// ============================================================================
// ScannedFileStream Component (Preserved)
// ============================================================================

interface FileStreamItem {
  path: string;
  status: 'scanning' | 'completed';
  timestamp: number;
}

interface ScannedFileStreamProps {
  currentFile?: string;
  isComplete?: boolean;
  compact?: boolean;
  scannedCount?: number;
  totalCount?: number;
  scannedFiles?: string[];
}

export const ScannedFileStream: React.FC<ScannedFileStreamProps> = ({
  currentFile,
  isComplete,
  compact = false,
  scannedFiles: externalFiles = []
}) => {
  const MAX_FILES = compact ? 5 : 6;
  const fileStreamRef = useRef<Set<string>>(new Set());
  const [fileStream, setFileStream] = useState<FileStreamItem[]>([]);
  const [scanningFile, setScanningFile] = useState<string | undefined>(currentFile);

  // Initialize from external scannedFiles list
  useEffect(() => {
    if (externalFiles.length > 0 && fileStream.length === 0) {
      const newStream: FileStreamItem[] = externalFiles.slice(0, MAX_FILES).map(path => ({
        path,
        status: 'completed' as const,
        timestamp: Date.now()
      }));
      newStream.forEach(f => fileStreamRef.current.add(f.path));
      setFileStream(newStream);
    }
  }, [externalFiles, MAX_FILES, fileStream.length]);

  // Update the scanning file separately (always shown at top)
  useEffect(() => {
    if (currentFile && currentFile !== scanningFile) {
      // Move old scanning file to completed stream
      if (scanningFile && !fileStreamRef.current.has(scanningFile)) {
        fileStreamRef.current.add(scanningFile);
        const completedEntry: FileStreamItem = {
          path: scanningFile,
          status: 'completed' as const,
          timestamp: Date.now()
        };
        setFileStream(prev => [completedEntry, ...prev].slice(0, MAX_FILES));
      }
      setScanningFile(currentFile);
    } else if (!currentFile && scanningFile && isComplete) {
      // Scan complete, move scanning file to stream
      if (scanningFile && !fileStreamRef.current.has(scanningFile)) {
        fileStreamRef.current.add(scanningFile);
        const completedEntry: FileStreamItem = {
          path: scanningFile,
          status: 'completed' as const,
          timestamp: Date.now()
        };
        setFileStream(prev => [completedEntry, ...prev].slice(0, MAX_FILES));
      }
      setScanningFile(undefined);
    }
  }, [currentFile, scanningFile, isComplete, MAX_FILES]);

  const getFileName = (filePath: string): string => {
    const parts = filePath.split('/');
    return parts[parts.length - 1] || filePath;
  };

  return (
    <div className={compact ? "mt-3" : "mt-4"}>
      <div className="text-[12px] text-[#cccccc] font-medium mb-2">
        {compact ? '扫描文件' : '最近扫描'}
      </div>
      <div className={`bg-[#252526] rounded p-${compact ? '2' : '3'} max-h-[${compact ? '100' : '140'}px] overflow-hidden`}>
        <div className="space-y-1">
          {/* Show scanning file at top */}
          {scanningFile && !isComplete && (
            <div
              key={`scanning-${scanningFile}`}
              className="flex items-center gap-2 text-[12px] py-1 px-2 rounded transition-all duration-300 bg-[#569cd6]/20 animate-in slide-in-from-top-2 fade-in"
            >
              <Loader2 size={10} className="text-[#569cd6] animate-spin flex-shrink-0" />
              <span className="flex-1 truncate font-mono text-[#569cd6]">
                {getFileName(scanningFile)}
              </span>
            </div>
          )}

          {/* Show completed files */}
          {fileStream.map((file) => {
            const fileName = getFileName(file.path);

            return (
              <div
                key={`${file.path}-${file.timestamp}`}
                className="flex items-center gap-2 text-[12px] py-1 px-2 rounded transition-all duration-300"
              >
                <CheckCircle2 size={10} className="text-[#4ec9b0] flex-shrink-0" />
                <span className="flex-1 truncate font-mono text-[#cccccc]">
                  {fileName}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// Main ExploreProgress Component
// ============================================================================

export const ExploreProgress: React.FC<ExploreProgressProps> = ({
  progress,
  mode = 'full',
  onOpenFile,
}) => {
  const { tasks } = useTaskStore();
  const [taskId] = useState<string>(() => `explore-${Date.now()}`);

  // Convert explore data to task metadata
  const existingTask = tasks.find(t => t.id === taskId);
  const taskMetadata = exploreToTaskMetadata(progress, existingTask);

  // Update task in store
  useEffect(() => {
    if (taskMetadata) {
      // This would normally use useTaskStore actions
      // For now, we'll use the task directly
    }
  }, [taskMetadata]);

  const { phase, progress: data, scannedFiles } = progress;
  const percentage = data.total > 0 ? Math.min(100, Math.round((data.scanned / data.total) * 100)) : 0;
  const isComplete = data.scanned >= data.total && data.total > 0;

  // ============================================================================
  // Minimal mode - ultra compact for chat
  // ============================================================================
  if (mode === 'minimal') {
    return (
      <div className="bg-[#252526] border border-[#3c3c3c] rounded p-3">
        {/* Status bar */}
        <div className="flex items-center gap-3 mb-2">
          {/* Phase icon */}
          {isComplete ? (
            <CheckCircle2 size={12} className="text-[#4ec9b0] flex-shrink-0" />
          ) : phase === 'scanning' ? (
            <Loader2 size={12} className="text-[#569cd6] animate-spin flex-shrink-0" />
          ) : (
            <Search size={12} className="text-[#dcdcaa] flex-shrink-0" />
          )}

          {/* Phase text */}
          <span className="text-[12px] text-[#cccccc]">
            {phase === 'scanning' ? '扫描中' : phase === 'analyzing' ? '分析中' : '已完成'}
          </span>

          {/* Stats */}
          <span className="text-[#3c3c3c]">|</span>
          <span className="text-[11px] text-[#858585] font-mono">{data.scanned}/{data.total} 目录</span>
          <span className="text-[#3c3c3c]">|</span>
          <span className="text-[11px] text-[#858585] font-mono">{scannedFiles?.length || 0} 文件</span>
        </div>

        {/* Progress bar */}
        <TaskProgressBar
          value={percentage}
          height={3}
          color={isComplete ? 'green' : 'blue'}
          showPercentage={false}
        />

        {/* Complete message */}
        {isComplete && (
          <div className="flex items-center gap-2 mt-2 text-[11px] text-[#4ec9b0]">
            <CheckCircle2 size={10} />
            <span>扫描完成 {scannedFiles?.length || 0} 个文件</span>
          </div>
        )}
      </div>
    );
  }

  // ============================================================================
  // Compact mode - task card style
  // ============================================================================
  if (mode === 'compact') {
    return (
      <div className="space-y-3">
        {/* Use TaskCard for the main display */}
        <TaskCard
          task={taskMetadata}
          mode="normal"
        />

        {/* Scanned files stream */}
        {(phase === 'scanning' || phase === 'analyzing' || (scannedFiles && scannedFiles.length > 0)) && (
          <div className="mt-3 bg-[#1e1e1e] border border-[#3c3c3c] rounded p-3">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <File size={12} className="text-[#569cd6]" />
                <span className="text-[12px] font-medium text-[#cccccc]">
                  {phase === 'scanning' ? '正在扫描' : phase === 'analyzing' ? '分析中' : '扫描文件'}
                </span>
                {phase === 'scanning' && <Loader2 size={10} className="text-[#569cd6] animate-spin" />}
                {phase === 'analyzing' && <Search size={10} className="text-[#dcdcaa] animate-pulse" />}
                {isComplete && <CheckCircle2 size={10} className="text-[#4ec9b0]" />}
              </div>
              <span className="text-[11px] text-[#858585]">
                {scannedFiles?.length || 0} 文件
              </span>
            </div>
            <ScannedFileStream
              currentFile={isComplete ? undefined : progress.currentFile}
              isComplete={isComplete}
              compact={true}
              scannedCount={data.scanned}
              totalCount={data.total}
              scannedFiles={scannedFiles}
            />
            {isComplete && (
              <div className="flex items-center gap-2 mt-2 pt-2 border-t border-[#3c3c3c] text-[11px] text-[#4ec9b0]">
                <CheckCircle2 size={10} />
                <span>扫描完成，共 {scannedFiles?.length || 0} 个文件</span>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  // ============================================================================
  // Full mode - detailed view
  // ============================================================================
  return (
    <div className="space-y-3">
      {/* Use TaskCard for the main display */}
      <TaskCard
        task={taskMetadata}
        mode="detailed"
      />

      {/* Scanned files stream */}
      <ScannedFileStream
        currentFile={isComplete ? undefined : progress.currentFile}
        isComplete={isComplete}
        scannedCount={data.scanned}
        totalCount={data.total}
        scannedFiles={scannedFiles}
      />

      {/* Complete message */}
      {isComplete && (
        <div className="flex items-center gap-2 mt-3 pt-3 border-t border-[#3c3c3c] text-[12px] text-[#4ec9b0]">
          <CheckCircle2 size={12} />
          <span>扫描完成，共扫描 {scannedFiles?.length || 0} 个文件</span>
        </div>
      )}
    </div>
  );
};

export default ExploreProgress;
