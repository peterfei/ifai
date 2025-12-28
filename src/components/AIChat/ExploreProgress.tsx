/**
 * ExploreProgress Component
 *
 * Displays real-time progress for explore agent operations with a
 * VS Code-inspired compact design:
 *
 * - Compact single-line progress indicator with scan rate
 * - Phase indicator (scanning/analyzing)
 * - Collapsible directory tree (default collapsed)
 * - Current path being scanned
 * - Recent scanned files stream
 */

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Search, Folder, FolderOpen, File, CheckCircle2, ChevronRight, ChevronDown, Loader2 } from 'lucide-react';
import { useExploreStore } from '../../stores/exploreStore';

// ============================================================================
// Types
// ============================================================================

export interface ExploreProgressData {
  phase: 'scanning' | 'analyzing' | 'completed';
  currentPath?: string;
  currentFile?: string;
  progress: {
    total: number;
    scanned: number;
    byDirectory: Record<string, {
      total: number;
      scanned: number;
      status: 'pending' | 'scanning' | 'completed';
    }>;
  };
  scannedFiles?: string[];
}

interface ExploreProgressProps {
  progress: ExploreProgressData;
  mode?: 'full' | 'compact' | 'minimal';
  onOpenFile?: (path: string) => void;
}

// ============================================================================
// Helper Components
// ============================================================================

/**
 * VS Code-style compact status bar
 */
const StatusBar: React.FC<{
  progress: ExploreProgressData;
  scanRate: number;
}> = ({ progress, scanRate }) => {
  const { phase, currentFile } = progress;
  const { total, scanned } = progress.progress;
  const percentage = total > 0 ? Math.min(100, Math.round((scanned / total) * 100)) : 0;
  const isComplete = scanned >= total && total > 0;

  const phaseText = {
    'scanning': '扫描中',
    'analyzing': '分析中',
    'completed': '已完成'
  }[phase];

  return (
    <div className="explore-status-bar">
      {/* Phase and percentage */}
      <div className="flex items-center gap-2">
        {isComplete ? (
          <CheckCircle2 size={12} className="text-[#4ec9b0]" />
        ) : phase === 'scanning' ? (
          <Loader2 size={12} className="text-[#569cd6] animate-spin" />
        ) : (
          <Search size={12} className="text-[#dcdcaa]" />
        )}
        <span className="text-[#cccccc]">{phaseText}</span>
        <span className="text-[#858585]">{percentage}%</span>
      </div>

      {/* Separator */}
      <span className="text-[#3c3c3c]">|</span>

      {/* Directory progress */}
      <span className="text-[#cccccc] font-mono text-[11px]">
        {scanned}/{total} 目录
      </span>

      {/* Separator */}
      <span className="text-[#3c3c3c]">|</span>

      {/* File count and scan rate */}
      <span className="text-[#cccccc] font-mono text-[11px]">
        {progress.scannedFiles?.length || 0} 文件
      </span>

      {scanRate > 0 && !isComplete && (
        <>
          <span className="text-[#3c3c3c]">|</span>
          <span className="text-[#4ec9b0] font-mono text-[11px]">
            ⚡ {scanRate} 文件/秒
          </span>
        </>
      )}

      {/* Current file (truncated) */}
      {currentFile && !isComplete && (
        <>
          <span className="text-[#3c3c3c]">|</span>
          <span
            className="text-[#569cd6] font-mono text-[11px] truncate max-w-[200px]"
            title={currentFile}
          >
            {currentFile.split('/').pop()}
          </span>
        </>
      )}
    </div>
  );
};

/**
 * Compact phase stepper
 */
const PhaseStepper: React.FC<{ phase: 'scanning' | 'analyzing' | 'completed' }> = ({ phase }) => {
  const steps = [
    { key: 'scanning', label: '扫描' },
    { key: 'analyzing', label: '分析' },
  ];

  const currentIndex = phase === 'completed' ? steps.length : steps.findIndex(s => s.key === phase);
  const isComplete = phase === 'completed';

  return (
    <div className="flex items-center gap-2 py-2">
      {steps.map((step, index) => {
        const isActive = phase === step.key && !isComplete;
        const isCompletedStep = index < currentIndex || (isComplete && index <= currentIndex);

        return (
          <React.Fragment key={step.key}>
            <div className={`flex items-center gap-1.5 px-2 py-1 rounded text-[11px] font-medium transition-all ${
              isActive
                ? 'bg-[#569cd6]/20 border border-[#569cd6] text-[#569cd6]'
                : isCompletedStep
                ? 'bg-[#4ec9b0]/20 border border-[#4ec9b0] text-[#4ec9b0]'
                : 'bg-[#252526] border border-[#3c3c3c] text-[#858585]'
            }`}>
              <span>{step.label}</span>
              {isActive && <Loader2 size={8} className="animate-spin ml-1" />}
              {isCompletedStep && !isActive && <CheckCircle2 size={8} className="ml-1" />}
            </div>
            {index < steps.length - 1 && (
              <div className={`w-6 h-px ${index < currentIndex || isComplete ? 'bg-[#4ec9b0]' : 'bg-[#3c3c3c]'}`} />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
};

/**
 * Compact progress bar
 */
const CompactProgressBar: React.FC<{
  current: number;
  total: number;
  isComplete: boolean;
}> = ({ current, total, isComplete }) => {
  const percentage = total > 0 ? Math.min(100, Math.round((current / total) * 100)) : 0;

  return (
    <div className="py-1">
      <div className="h-1 bg-[#2d2d2d] rounded-full overflow-hidden">
        <div
          className={`h-full transition-all duration-300 ease-out ${
            isComplete ? 'bg-[#4ec9b0]' : 'bg-[#569cd6]'
          }`}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
};

/**
 * Streaming file list - shows recently scanned files
 */
interface FileStreamItem {
  path: string;
  status: 'scanning' | 'completed';
  timestamp: number;
}

export const ScannedFileStream: React.FC<{
  currentFile?: string;
  isComplete?: boolean;
  compact?: boolean;
  scannedCount?: number;
  totalCount?: number;
  scannedFiles?: string[];
}> = ({
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

  // Mark all as completed when scan finishes
  useEffect(() => {
    if (isComplete && fileStream.length > 0) {
      setFileStream(prev => prev.map(f => ({ ...f, status: 'completed' as const })));
    }
  }, [isComplete, fileStream.length]);

  const getFileName = (filePath: string): string => {
    const parts = filePath.split('/');
    return parts[parts.length - 1] || filePath;
  };

  if (fileStream.length === 0 && !isComplete) {
    return (
      <div className="bg-[#252526] rounded p-3">
        <div className="flex items-center gap-2 text-[12px] text-[#858585]">
          <Loader2 size={10} className="animate-spin text-[#569cd6]" />
          <span>正在准备扫描...</span>
        </div>
      </div>
    );
  }

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

/**
 * Directory tree component
 */
interface DirectoryTreeNode {
  name: string;
  path: string;
  status: 'pending' | 'scanning' | 'completed';
  children: DirectoryTreeNode[];
  depth: number;
}

const buildDirectoryTree = (byDirectory: Record<string, any>): DirectoryTreeNode[] => {
  const paths = Object.keys(byDirectory).sort();
  const validPaths = paths.filter(p => p && p !== '.').map(p => {
    return p.startsWith('./') ? p.substring(2) : p;
  });

  if (validPaths.length === 0) {
    return [];
  }

  const root: DirectoryTreeNode = { name: '', path: '', status: 'pending', children: [], depth: 0 };

  validPaths.forEach(fullPath => {
    const status = byDirectory[fullPath]?.status || byDirectory[`./${fullPath}`]?.status || 'pending';
    const parts = fullPath.split('/').filter(p => p);

    let current = root;
    let currentPath = '';

    parts.forEach((part, index) => {
      currentPath = currentPath ? `${currentPath}/${part}` : part;
      let child = current.children.find(c => c.name === part);

      if (!child) {
        child = {
          name: part,
          path: currentPath,
          status: index === parts.length - 1 ? status : 'pending',
          children: [],
          depth: index + 1
        };
        current.children.push(child);
      }

      if (index === parts.length - 1) {
        child.status = status;
      }

      current = child;
    });
  });

  return root.children;
};

const DirectoryTreeNode: React.FC<{
  node: DirectoryTreeNode;
  isExpanded?: boolean;
  onOpenFile?: (path: string) => void;
}> = ({ node, isExpanded, onOpenFile }) => {
  const [expanded, setExpanded] = useState(isExpanded ?? node.depth <= 2);
  const hasChildren = node.children.length > 0;

  const getStatusIcon = () => {
    switch (node.status) {
      case 'completed':
        return <CheckCircle2 size={12} className="text-[#4ec9b0] flex-shrink-0" />;
      case 'scanning':
        return <Loader2 size={12} className="text-[#569cd6] animate-spin flex-shrink-0" />;
      default:
        return hasChildren ? (
          expanded ? (
            <FolderOpen size={12} className="text-[#dcdcaa] flex-shrink-0" />
          ) : (
            <Folder size={12} className="text-[#dcdcaa]/50 flex-shrink-0" />
          )
        ) : (
          <Folder size={12} className="text-[#858585] flex-shrink-0" />
        );
    }
  };

  return (
    <div>
      <div
        className={`flex items-center gap-1 py-1 hover:bg-[#2a2d2e] rounded cursor-pointer text-[12px] ${
          node.status === 'scanning' ? 'bg-[#569cd6]/10' : ''
        }`}
        style={{ paddingLeft: `${(node.depth - 1) * 12 + 4}px` }}
        onClick={() => hasChildren && setExpanded(!expanded)}
      >
        {hasChildren && (
          <span className="text-[#858585]">
            {expanded ? (
              <ChevronDown size={10} />
            ) : (
              <ChevronRight size={10} />
            )}
          </span>
        )}
        {!hasChildren && <span className="w-4" />}
        {getStatusIcon()}
        <span className={`truncate font-mono ${
          node.status === 'scanning' ? 'text-[#569cd6]' :
          node.status === 'completed' ? 'text-[#cccccc]' :
          'text-[#858585]'
        }`}>
          {node.name}
        </span>
      </div>
      {expanded && hasChildren && (
        <div>
          {node.children.map(child => (
            <DirectoryTreeNode
              key={child.path}
              node={child}
              onOpenFile={onOpenFile}
            />
          ))}
        </div>
      )}
    </div>
  );
};

/**
 * Collapsible directory tree section
 */
const CollapsibleDirectoryTree: React.FC<{
  byDirectory: ExploreProgressData['progress']['byDirectory'];
  isCollapsed: boolean;
  onToggle: () => void;
  onOpenFile?: (path: string) => void;
}> = ({ byDirectory, isCollapsed, onToggle, onOpenFile }) => {
  const tree = useMemo(() => buildDirectoryTree(byDirectory), [byDirectory]);
  const hasData = Object.keys(byDirectory).length > 0;

  if (!hasData) return null;

  return (
    <div className="border-t border-[#3c3c3c] pt-3 mt-3">
      <button
        onClick={onToggle}
        className="flex items-center gap-2 text-[12px] text-[#cccccc] font-medium hover:text-[#ffffff] transition-colors mb-2 w-full"
      >
        {isCollapsed ? (
          <ChevronRight size={12} />
        ) : (
          <ChevronDown size={12} />
        )}
        <span>目录结构 ({Object.keys(byDirectory).length})</span>
      </button>
      {!isCollapsed && (
        <div className="bg-[#252526] rounded p-3 max-h-[180px] overflow-y-auto">
          {tree.length > 0 ? (
            tree.map(node => (
              <DirectoryTreeNode
                key={node.path}
                node={node}
                onOpenFile={onOpenFile}
              />
            ))
          ) : (
            <div className="text-[12px] text-[#858585] py-3">正在扫描目录...</div>
          )}
        </div>
      )}
    </div>
  );
};

// ============================================================================
// Main Component
// ============================================================================

export const ExploreProgress: React.FC<ExploreProgressProps> = ({
  progress,
  mode = 'full',
  onOpenFile,
}) => {
  const { toggleSection, collapsedSections } = useExploreStore();
  const [scanRate, setScanRate] = useState(0);
  const lastUpdateRef = useRef<number>(Date.now());
  const lastFileCountRef = useRef(0);

  const { phase, progress: data } = progress;
  const percentage = data.total > 0 ? Math.min(100, Math.round((data.scanned / data.total) * 100)) : 0;
  const isComplete = data.scanned >= data.total && data.total > 0;

  // Calculate scan rate (files per second)
  useEffect(() => {
    const fileCount = progress.scannedFiles?.length || 0;

    if (!isComplete && fileCount > 0) {
      const now = Date.now();
      const elapsed = (now - lastUpdateRef.current) / 1000; // seconds
      const filesScanned = fileCount - lastFileCountRef.current;

      if (elapsed > 0.5 && filesScanned > 0) { // Update every 0.5s
        const rate = Math.round(filesScanned / elapsed);
        setScanRate(rate);
        lastUpdateRef.current = now;
        lastFileCountRef.current = fileCount;
      }
    }

    if (isComplete) {
      setScanRate(0);
    }
  }, [progress.scannedFiles, isComplete]);

  // Minimal mode - compact progress bar for top analysis area
  if (mode === 'minimal') {
    return (
      <div className="bg-[#252526] border border-[#3c3c3c] rounded p-3">
        <StatusBar progress={progress} scanRate={scanRate} />
        <CompactProgressBar current={data.scanned} total={data.total} isComplete={isComplete} />
        {isComplete && (
          <div className="flex items-center gap-2 mt-2 text-[11px] text-[#4ec9b0]">
            <CheckCircle2 size={10} />
            <span>扫描完成 {progress.scannedFiles?.length || 0} 个文件</span>
          </div>
        )}
      </div>
    );
  }

  // Compact mode
  if (mode === 'compact') {
    return (
      <div className="bg-[#252526] border border-[#3c3c3c] rounded p-4">
        <StatusBar progress={progress} scanRate={scanRate} />
        <CompactProgressBar current={data.scanned} total={data.total} isComplete={isComplete} />
        <PhaseStepper phase={phase} />

        {/* Collapsible directory tree */}
        {Object.keys(data.byDirectory).length > 0 && (
          <CollapsibleDirectoryTree
            byDirectory={data.byDirectory}
            isCollapsed={collapsedSections['progress-tree'] ?? true}
            onToggle={() => toggleSection('progress-tree')}
            onOpenFile={onOpenFile}
          />
        )}

        {/* Scanned files stream */}
        {(phase === 'scanning' || phase === 'analyzing' || (progress.scannedFiles && progress.scannedFiles.length > 0)) && (
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
                {progress.scannedFiles?.length || 0} 文件
              </span>
            </div>
            <ScannedFileStream
              currentFile={isComplete ? undefined : progress.currentFile}
              isComplete={isComplete}
              compact={true}
              scannedCount={data.scanned}
              totalCount={data.total}
              scannedFiles={progress.scannedFiles}
            />
            {isComplete && (
              <div className="flex items-center gap-2 mt-2 pt-2 border-t border-[#3c3c3c] text-[11px] text-[#4ec9b0]">
                <CheckCircle2 size={10} />
                <span>扫描完成，共 {progress.scannedFiles?.length || 0} 个文件</span>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  // Full mode
  return (
    <div className="bg-[#252526] border border-[#3c3c3c] rounded p-5 my-3">
      <StatusBar progress={progress} scanRate={scanRate} />
      <PhaseStepper phase={phase} />
      <CompactProgressBar current={data.scanned} total={data.total} isComplete={isComplete} />

      {/* Collapsible directory tree */}
      {Object.keys(data.byDirectory).length > 0 && (
        <CollapsibleDirectoryTree
          byDirectory={data.byDirectory}
          isCollapsed={collapsedSections['progress-tree'] ?? true}
          onToggle={() => toggleSection('progress-tree')}
          onOpenFile={onOpenFile}
        />
      )}

      {/* Scanned files stream */}
      <ScannedFileStream
        currentFile={isComplete ? undefined : progress.currentFile}
        isComplete={isComplete}
        scannedCount={data.scanned}
        totalCount={data.total}
        scannedFiles={progress.scannedFiles}
      />

      {/* Complete message */}
      {isComplete && (
        <div className="flex items-center gap-2 mt-3 pt-3 border-t border-[#3c3c3c] text-[12px] text-[#4ec9b0]">
          <CheckCircle2 size={12} />
          <span>扫描完成，共扫描 {progress.scannedFiles?.length || 0} 个文件</span>
        </div>
      )}
    </div>
  );
};

export default ExploreProgress;
