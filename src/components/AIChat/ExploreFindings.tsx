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
import { useTranslation } from 'react-i18next';

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
  const { t } = useTranslation();
  const totalFiles = findings.directories.reduce((sum, d) => sum + d.fileCount, 0);
  const patternCount = findings.patterns?.length || 0;

  // Compact mode - simplified view
  if (compact) {
    return (
      <div className="theme-panel-muted theme-border rounded border p-3">
        <div className="flex items-center gap-2 mb-2">
          <CheckCircle2 size={14} className="text-[var(--success-color)]" />
          <span className="theme-text text-[11px] font-medium">{t('aiChat.exploreFindings.completed')}</span>
        </div>
        <div className="theme-text-muted text-[11px]">{findings.summary}</div>
      </div>
    );
  }

  // Simplified mode - single line summary
  return (
    <div className="theme-panel-muted theme-border my-2 rounded border p-3">
      <div className="explore-status-bar">
        <CheckCircle2 size={12} className="text-[var(--success-color)]" />
        <span className="theme-text">{t('aiChat.exploreFindings.completed')}</span>
        <span className="theme-text-subtle opacity-60">|</span>
        <span className="theme-text">{t('aiChat.exploreFindings.directories', { count: findings.directories.length })}</span>
        <span className="theme-text-subtle opacity-60">|</span>
        <span className="theme-text">{t('aiChat.exploreFindings.files', { count: totalFiles })}</span>
        {patternCount > 0 && (
          <>
            <span className="theme-text-subtle opacity-60">|</span>
            <span className="theme-text">{t('aiChat.exploreFindings.patterns', { count: patternCount })}</span>
          </>
        )}
      </div>
    </div>
  );
};

export default ExploreFindings;
