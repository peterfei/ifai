/**
 * ExploreFindings Component
 *
 * Displays structured findings from explore agent with a
 * VS Code search results-inspired design:
 *
 * - Compact status bar with statistics
 * - Collapsible overview section
 * - Clickable file list with hover effects
 * - Pattern matches with color-coded tags
 */

import React from 'react';
import { CheckCircle2 } from 'lucide-react';

// ============================================================================
// Types
// ============================================================================

export interface ExploreFindingsData {
  summary: string;
  directories: Array<{
    path: string;
    fileCount: number;
    keyFiles: string[];
  }>;
  patterns?: Array<{
    type: 'import' | 'export' | 'class' | 'function';
    description: string;
  }>;
}

interface ExploreFindingsProps {
  findings: ExploreFindingsData;
  compact?: boolean;
  onOpenFile?: (path: string) => void;
}

// ============================================================================
// Main Component
// ============================================================================

export const ExploreFindings: React.FC<ExploreFindingsProps> = ({
  findings,
  compact = false,
  onOpenFile,
}) => {
  const totalFiles = findings.directories.reduce((sum, d) => sum + d.fileCount, 0);
  const patternCount = findings.patterns?.length || 0;

  // Compact mode - simplified view
  if (compact) {
    return (
      <div className="bg-[#252526] border border-[#3c3c3c] rounded p-3">
        <div className="flex items-center gap-2 mb-2">
          <CheckCircle2 size={14} className="text-[#4ec9b0]" />
          <span className="text-[11px] font-medium text-[#cccccc]">探索完成</span>
        </div>
        <div className="text-[11px] text-[#cccccc]">{findings.summary}</div>
      </div>
    );
  }

  // Simplified mode - single line summary
  return (
    <div className="bg-[#252526] border border-[#3c3c3c] rounded p-3 my-2">
      <div className="explore-status-bar">
        <CheckCircle2 size={12} className="text-[#4ec9b0]" />
        <span className="text-[#cccccc]">探索完成</span>
        <span className="text-[#3c3c3c]">|</span>
        <span className="text-[#cccccc]">{findings.directories.length} 目录</span>
        <span className="text-[#3c3c3c]">|</span>
        <span className="text-[#cccccc]">{totalFiles} 文件</span>
        {patternCount > 0 && (
          <>
            <span className="text-[#3c3c3c]">|</span>
            <span className="text-[#cccccc]">{patternCount} 模式</span>
          </>
        )}
      </div>
    </div>
  );
};

export default ExploreFindings;
