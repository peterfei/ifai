/**
 * ExploreFindings Component
 *
 * Displays structured findings from explore agent:
 * - Summary section
 * - Directory breakdown with key files
 * - Pattern matches (imports, exports, classes, functions)
 */

import React, { useState } from 'react';
import { ChevronDown, ChevronUp, Folder, File, Code, Braces, Box, Import } from 'lucide-react';

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
}

// ============================================================================
// Helper Components
// ============================================================================

const PatternIcon: React.FC<{ type: string }> = ({ type }) => {
  switch (type) {
    case 'import':
      return <Import size={14} className="text-purple-400" />;
    case 'export':
      return <Code size={14} className="text-green-400" />;
    case 'class':
      return <Box size={14} className="text-yellow-400" />;
    case 'function':
      return <Braces size={14} className="text-blue-400" />;
    default:
      return <Code size={14} className="text-gray-400" />;
  }
};

const DirectoryItem: React.FC<{
  dir: ExploreFindingsData['directories'][0];
  initiallyExpanded?: boolean;
}> = ({ dir, initiallyExpanded = false }) => {
  const [isExpanded, setIsExpanded] = useState(initiallyExpanded);

  return (
    <div className="border border-gray-800 rounded-lg overflow-hidden">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between p-3 hover:bg-gray-800 transition-colors"
      >
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <Folder size={14} className="text-yellow-500 flex-shrink-0" />
          <span className="text-sm text-gray-300 truncate">{dir.path}</span>
          <span className="text-xs text-gray-500 flex-shrink-0">({dir.fileCount} 文件)</span>
        </div>
        {isExpanded ? (
          <ChevronUp size={14} className="text-gray-500 flex-shrink-0" />
        ) : (
          <ChevronDown size={14} className="text-gray-500 flex-shrink-0" />
        )}
      </button>

      {isExpanded && dir.keyFiles.length > 0 && (
        <div className="border-t border-gray-800 p-2 bg-gray-900/50">
          <div className="text-xs text-gray-500 mb-2">关键文件</div>
          <div className="space-y-1">
            {dir.keyFiles.map((file, index) => (
              <div key={index} className="flex items-center gap-2 text-xs text-gray-400">
                <File size={12} className="flex-shrink-0" />
                <span className="truncate">{file}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// ============================================================================
// Main Component
// ============================================================================

export const ExploreFindings: React.FC<ExploreFindingsProps> = ({ findings, compact = false }) => {
  const [showPatterns, setShowPatterns] = useState(true);

  if (compact) {
    return (
      <div className="bg-gray-900 border border-gray-800 rounded-lg p-3">
        <div className="flex items-center gap-2 mb-2">
          <Folder size={14} className="text-yellow-500" />
          <span className="text-xs font-medium text-gray-300">探索完成</span>
        </div>
        <div className="text-xs text-gray-400">{findings.summary}</div>
      </div>
    );
  }

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg p-4 my-2">
      {/* Header */}
      <div className="flex items-center gap-2 mb-3">
        <Folder size={16} className="text-yellow-500" />
        <span className="text-sm font-medium text-gray-200">探索结果</span>
      </div>

      {/* Summary */}
      <div className="bg-gray-800 rounded-lg p-3 mb-4">
        <div className="text-xs text-gray-400 font-medium mb-1">概览</div>
        <div className="text-sm text-gray-300">{findings.summary}</div>
      </div>

      {/* Statistics */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="bg-gray-800 rounded-lg p-3">
          <div className="text-xs text-gray-500 mb-1">目录数</div>
          <div className="text-lg font-semibold text-gray-200">{findings.directories.length}</div>
        </div>
        <div className="bg-gray-800 rounded-lg p-3">
          <div className="text-xs text-gray-500 mb-1">总文件数</div>
          <div className="text-lg font-semibold text-gray-200">
            {findings.directories.reduce((sum, d) => sum + d.fileCount, 0)}
          </div>
        </div>
      </div>

      {/* Directories */}
      <div className="mb-4">
        <div className="text-xs text-gray-400 font-medium mb-2">目录详情</div>
        <div className="space-y-2">
          {findings.directories.map((dir, index) => (
            <DirectoryItem
              key={index}
              dir={dir}
              initiallyExpanded={findings.directories.length <= 3}
            />
          ))}
        </div>
      </div>

      {/* Patterns */}
      {findings.patterns && findings.patterns.length > 0 && (
        <div>
          <button
            onClick={() => setShowPatterns(!showPatterns)}
            className="flex items-center justify-between w-full text-left text-xs text-gray-400 font-medium mb-2 hover:text-gray-300"
          >
            <span>发现的模式</span>
            {showPatterns ? (
              <ChevronUp size={14} />
            ) : (
              <ChevronDown size={14} />
            )}
          </button>
          {showPatterns && (
            <div className="space-y-2">
              {findings.patterns.map((pattern, index) => (
                <div
                  key={index}
                  className="flex items-start gap-2 bg-gray-800 rounded-lg p-2"
                >
                  <PatternIcon type={pattern.type} />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-gray-500 capitalize">{pattern.type}</div>
                    <div className="text-sm text-gray-300">{pattern.description}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ExploreFindings;
