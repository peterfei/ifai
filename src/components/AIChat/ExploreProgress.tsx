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
import { useTranslation } from 'react-i18next';

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
  const { t } = useTranslation();
  const { phase, currentFile } = progress;
  const { total, scanned } = progress.progress;
  const percentage = total > 0 ? Math.min(100, Math.round((scanned / total) * 100)) : 0;
  const isComplete = scanned >= total && total > 0;

  return (
    <div className="explore-status-bar">
      {/* Phase and percentage */}
      <div className="flex items-center gap-2">
        {isComplete ? (
          <CheckCircle2 size={12} className="text-[var(--success-color)]" />
        ) : phase === 'scanning' ? (
          <Loader2 size={12} className="text-[var(--info-color)] animate-spin" />
        ) : (
          <Search size={12} className="text-[var(--warning-color)]" />
        )}
        <span className="theme-text">{t(`aiChat.exploreProgress.phase.${phase}`)}</span>
        <span className="theme-text-subtle">{percentage}%</span>
      </div>

      {/* Separator */}
      <span className="theme-text-subtle opacity-60">|</span>

      {/* Directory progress */}
      <span className="theme-text font-mono text-[11px]">
        {t('aiChat.exploreProgress.directories', { current: scanned, total })}
      </span>

      {/* Separator */}
      <span className="theme-text-subtle opacity-60">|</span>

      {/* File count and scan rate */}
      <span className="theme-text font-mono text-[11px]">
        {t('aiChat.exploreProgress.files', { count: progress.scannedFiles?.length || 0 })}
      </span>

      {scanRate > 0 && !isComplete && (
        <>
          <span className="theme-text-subtle opacity-60">|</span>
          <span className="font-mono text-[11px] text-[var(--success-color)]">
            {t('aiChat.exploreProgress.filesPerSecond', { count: scanRate })}
          </span>
        </>
      )}

      {/* Current file (truncated) */}
      {currentFile && !isComplete && (
        <>
          <span className="theme-text-subtle opacity-60">|</span>
          <span
            className="font-mono text-[11px] text-[var(--info-color)] truncate max-w-[200px]"
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
  const { t } = useTranslation();
  const steps = [
    { key: 'scanning', label: t('aiChat.exploreProgress.phase.scanning') },
    { key: 'analyzing', label: t('aiChat.exploreProgress.phase.analyzing') },
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
                ? 'bg-[var(--accent-soft-bg)] border border-[var(--accent-soft-border)] text-[var(--accent-color)]'
                : isCompletedStep
                ? 'bg-[var(--success-soft-bg)] border border-[var(--success-soft-border)] text-[var(--success-color)]'
                : 'theme-panel-muted theme-border theme-text-subtle border'
            }`}>
              <span>{step.label}</span>
              {isActive && <Loader2 size={8} className="animate-spin ml-1" />}
              {isCompletedStep && !isActive && <CheckCircle2 size={8} className="ml-1" />}
            </div>
            {index < steps.length - 1 && (
              <div className={`w-6 h-px ${index < currentIndex || isComplete ? 'bg-[var(--success-color)]' : 'theme-divider'}`} />
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
      <div className="theme-panel-muted h-1 rounded-full overflow-hidden">
        <div
          className={`h-full transition-all duration-300 ease-out ${
            isComplete ? 'bg-[var(--success-color)]' : 'bg-[var(--accent-color)]'
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
  const { t } = useTranslation();
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
      <div className="theme-panel-muted rounded p-3">
        <div className="theme-text-subtle flex items-center gap-2 text-[12px]">
          <Loader2 size={10} className="animate-spin text-[var(--info-color)]" />
          <span>{t('aiChat.exploreProgress.preparing')}</span>
        </div>
      </div>
    );
  }

  return (
    <div className={compact ? "mt-3" : "mt-4"}>
      <div className="theme-text mb-2 text-[12px] font-medium">
        {compact ? t('aiChat.exploreProgress.scannedFiles') : t('aiChat.exploreProgress.recentScanned')}
      </div>
      <div className={`theme-panel-muted overflow-hidden rounded ${compact ? 'p-2 max-h-[100px]' : 'p-3 max-h-[140px]'}`}>
        <div className="space-y-1">
          {/* Show scanning file at top */}
          {scanningFile && !isComplete && (
            <div
              key={`scanning-${scanningFile}`}
              className="flex items-center gap-2 text-[12px] py-1 px-2 rounded transition-all duration-300 bg-[var(--info-soft-bg)] animate-in slide-in-from-top-2 fade-in"
            >
              <Loader2 size={10} className="text-[var(--info-color)] animate-spin flex-shrink-0" />
              <span className="flex-1 truncate font-mono text-[var(--info-color)]">
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
                <CheckCircle2 size={10} className="text-[var(--success-color)] flex-shrink-0" />
                <span className="theme-text flex-1 truncate font-mono">
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
        return <CheckCircle2 size={12} className="text-[var(--success-color)] flex-shrink-0" />;
      case 'scanning':
        return <Loader2 size={12} className="text-[var(--info-color)] animate-spin flex-shrink-0" />;
      default:
        return hasChildren ? (
          expanded ? (
            <FolderOpen size={12} className="text-[var(--warning-color)] flex-shrink-0" />
          ) : (
            <Folder size={12} className="theme-text-subtle flex-shrink-0" />
          )
        ) : (
          <Folder size={12} className="theme-text-subtle flex-shrink-0" />
        );
    }
  };

  return (
    <div>
      <div
        className={`theme-soft-hover flex items-center gap-1 py-1 rounded cursor-pointer text-[12px] ${
          node.status === 'scanning' ? 'bg-[var(--info-soft-bg)]' : ''
        }`}
        style={{ paddingLeft: `${(node.depth - 1) * 12 + 4}px` }}
        onClick={() => hasChildren && setExpanded(!expanded)}
      >
        {hasChildren && (
          <span className="theme-text-subtle">
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
          node.status === 'scanning' ? 'text-[var(--info-color)]' :
          node.status === 'completed' ? 'theme-text' :
          'theme-text-subtle'
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
  const { t } = useTranslation();
  const tree = useMemo(() => buildDirectoryTree(byDirectory), [byDirectory]);
  const hasData = Object.keys(byDirectory).length > 0;

  if (!hasData) return null;

  return (
    <div className="theme-border mt-3 border-t pt-3">
      <button
        onClick={onToggle}
        className="theme-text-muted flex w-full items-center gap-2 mb-2 text-[12px] font-medium transition-colors hover:text-[var(--text-primary)]"
      >
        {isCollapsed ? (
          <ChevronRight size={12} />
        ) : (
          <ChevronDown size={12} />
        )}
        <span>{t('aiChat.exploreProgress.directoryTree', { count: Object.keys(byDirectory).length })}</span>
      </button>
      {!isCollapsed && (
        <div className="theme-panel-muted rounded p-3 max-h-[180px] overflow-y-auto">
          {tree.length > 0 ? (
            tree.map(node => (
              <DirectoryTreeNode
                key={node.path}
                node={node}
                onOpenFile={onOpenFile}
              />
            ))
          ) : (
            <div className="theme-text-subtle py-3 text-[12px]">{t('aiChat.exploreProgress.scanningDirectory')}</div>
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
  const { t } = useTranslation();
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
      <div className="theme-panel-muted theme-border rounded border p-3">
        <StatusBar progress={progress} scanRate={scanRate} />
        <CompactProgressBar current={data.scanned} total={data.total} isComplete={isComplete} />
        {isComplete && (
          <div className="mt-2 flex items-center gap-2 text-[11px] text-[var(--success-color)]">
            <CheckCircle2 size={10} />
            <span>{t('aiChat.exploreProgress.scanCompleted', { count: progress.scannedFiles?.length || 0 })}</span>
          </div>
        )}
      </div>
    );
  }

  // Compact mode
  if (mode === 'compact') {
    return (
      <div className="theme-panel-muted theme-border rounded border p-4">
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
          <div className="theme-panel theme-border mt-3 rounded border p-3">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <File size={12} className="text-[var(--info-color)]" />
                <span className="theme-text text-[12px] font-medium">
                  {phase === 'scanning' ? t('aiChat.exploreProgress.scanningNow') : phase === 'analyzing' ? t('aiChat.exploreProgress.phase.analyzing') : t('aiChat.exploreProgress.scannedFiles')}
                </span>
                {phase === 'scanning' && <Loader2 size={10} className="text-[var(--info-color)] animate-spin" />}
                {phase === 'analyzing' && <Search size={10} className="text-[var(--warning-color)] animate-pulse" />}
                {isComplete && <CheckCircle2 size={10} className="text-[var(--success-color)]" />}
              </div>
              <span className="theme-text-subtle text-[11px]">
                {t('aiChat.exploreProgress.files', { count: progress.scannedFiles?.length || 0 })}
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
              <div className="theme-border mt-2 flex items-center gap-2 border-t pt-2 text-[11px] text-[var(--success-color)]">
                <CheckCircle2 size={10} />
                <span>{t('aiChat.exploreProgress.scanCompletedTotal', { count: progress.scannedFiles?.length || 0 })}</span>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  // Full mode
  return (
    <div className="theme-panel-muted theme-border my-3 rounded border p-5">
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
        <div className="theme-border mt-3 flex items-center gap-2 border-t pt-3 text-[12px] text-[var(--success-color)]">
          <CheckCircle2 size={12} />
          <span>{t('aiChat.exploreProgress.scanCompletedDetailed', { count: progress.scannedFiles?.length || 0 })}</span>
        </div>
      )}
    </div>
  );
};

export default ExploreProgress;
