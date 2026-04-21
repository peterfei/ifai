/**
 * TaskLogStream Component
 *
 * Industrial-grade log stream viewer with:
 * - ANSI color code support
 * - Search and filter
 * - Auto-scroll to latest
 * - Export functionality
 * - Syntax highlighting
 */

import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Search, Download, ChevronDown, ChevronUp, Filter, X, Copy, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { LogLevel, LogEntry } from './types';
import { parseANSIToHTML, formatLogTimestamp } from './ansiUtils';

// ============================================================================
// Types
// ============================================================================

export interface TaskLogStreamProps {
  /** Log entries to display */
  logs: LogEntry[];

  /** Maximum number of lines to display (for performance) */
  maxLines?: number;

  /** Auto-scroll to latest */
  autoScroll?: boolean;

  /** Show search bar */
  showSearch?: boolean;

  /** Show filters */
  showFilters?: boolean;

  /** Show export button */
  showExport?: boolean;

  /** Show line numbers */
  showLineNumbers?: boolean;

  /** Show timestamps */
  showTimestamps?: boolean;

  /** Font size */
  fontSize?: 'xs' | 'sm' | 'md';

  /** Default log level filter */
  defaultLevel?: LogLevel;

  /** Custom className */
  className?: string;

  /** Export filename */
  exportFilename?: string;
}

export interface LogFilter {
  level?: LogLevel | 'all';
  search?: string;
  startTime?: number;
  endTime?: number;
}

// ============================================================================
// Helper Components
// ============================================================================

/**
 * Log level badge
 */
const LogLevelBadge: React.FC<{ level: LogLevel }> = ({ level }) => {
  const config = {
    [LogLevel.DEBUG]: { label: 'DEBUG', color: 'theme-text-subtle', bg: 'bg-[var(--hover-soft)]' },
    [LogLevel.INFO]: { label: 'INFO', color: 'text-[var(--info-color)]', bg: 'bg-[var(--info-soft-bg)]' },
    [LogLevel.WARN]: { label: 'WARN', color: 'text-[var(--warning-color)]', bg: 'bg-[var(--warning-soft-bg)]' },
    [LogLevel.ERROR]: { label: 'ERROR', color: 'text-[var(--danger-color)]', bg: 'bg-[var(--danger-soft-bg)]' },
  };

  const { label, color, bg } = config[level];

  return (
    <span className={`px-1.5 py-0.5 text-[10px] font-mono font-medium rounded ${color} ${bg}`}>
      {label}
    </span>
  );
};

/**
 * Log search bar
 */
interface LogSearchBarProps {
  search: string;
  onSearchChange: (value: string) => void;
  levelFilter: LogLevel | 'all';
  onLevelChange: (value: LogLevel | 'all') => void;
  logCount: number;
  filteredCount: number;
  onClear?: () => void;
  onExport?: () => void;
  onCopy?: () => void;
}

const LogSearchBar: React.FC<LogSearchBarProps> = ({
  search,
  onSearchChange,
  levelFilter,
  onLevelChange,
  logCount,
  filteredCount,
  onClear,
  onExport,
  onCopy,
}) => {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="theme-panel theme-border flex items-center gap-2 border-b px-2 py-1">
      {/* Search input */}
      <div className="flex items-center gap-1 flex-1 min-w-0">
        <Search size={12} className="theme-text-subtle flex-shrink-0" />
        <input
          type="text"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={t('taskLogStream.searchPlaceholder')}
          className="theme-text flex-1 min-w-0 bg-transparent text-[11px] outline-none placeholder:text-[var(--text-subtle)]"
        />
        {search && (
          <button
            onClick={() => onSearchChange('')}
            className="theme-soft-hover rounded p-0.5 flex-shrink-0"
          >
            <X size={10} className="theme-text-subtle" />
          </button>
        )}
      </div>

      {/* Filter toggle */}
      <button
        onClick={() => setExpanded(!expanded)}
        className={`theme-soft-hover rounded p-1 flex-shrink-0 transition-colors ${
          expanded ? 'theme-panel-muted' : ''
        }`}
        title={t('taskLogStream.filter')}
      >
        <Filter size={12} className="theme-text-subtle" />
      </button>

      {/* Export */}
      {onExport && (
        <button
          onClick={onExport}
          className="theme-soft-hover rounded p-1 flex-shrink-0"
          title={t('taskLogStream.export')}
        >
          <Download size={12} className="theme-text-subtle" />
        </button>
      )}

      {/* Clear */}
      {onClear && logCount > 0 && (
        <button
          onClick={onClear}
          className="theme-soft-hover rounded p-1 flex-shrink-0"
          title={t('taskLogStream.clear')}
        >
          <Trash2 size={12} className="theme-text-subtle" />
        </button>
      )}

      {/* Expanded filters */}
      {expanded && (
        <div className="theme-border ml-2 flex items-center gap-2 border-l pl-2">
          <select
            value={levelFilter}
            onChange={(e) => onLevelChange(e.target.value as LogLevel | 'all')}
            className="theme-panel-muted theme-border theme-text rounded border px-2 py-0.5 text-[10px]"
          >
            <option value="all">{t('taskLogStream.allLevels')}</option>
            <option value={LogLevel.DEBUG}>DEBUG</option>
            <option value={LogLevel.INFO}>INFO</option>
            <option value={LogLevel.WARN}>WARN</option>
            <option value={LogLevel.ERROR}>ERROR</option>
          </select>
          <span className="theme-text-subtle text-[10px]">
            {filteredCount}/{logCount}
          </span>
        </div>
      )}
    </div>
  );
};

// ============================================================================
// Main Component
// ============================================================================

export const TaskLogStream: React.FC<TaskLogStreamProps> = ({
  logs = [],
  maxLines = 1000,
  autoScroll = true,
  showSearch = true,
  showFilters = true,
  showExport = true,
  showLineNumbers = false,
  showTimestamps = true,
  fontSize = 'xs',
  defaultLevel = LogLevel.INFO,
  className = '',
  exportFilename = 'logs.txt',
}) => {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const [levelFilter, setLevelFilter] = useState<LogLevel | 'all'>('all');
  const [autoScrollEnabled, setAutoScrollEnabled] = useState(autoScroll);
  const [expanded, setExpanded] = useState(true);
  const logContainerRef = useRef<HTMLDivElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to latest
  useEffect(() => {
    if (autoScrollEnabled && expanded && logs.length > 0) {
      endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  }, [logs, autoScrollEnabled, expanded]);

  // Filter logs
  const filteredLogs = useMemo(() => {
    return logs
      .filter((log) => {
        // Level filter
        if (levelFilter !== 'all' && log.level !== levelFilter) {
          return false;
        }
        // Search filter
        if (search) {
          const searchLower = search.toLowerCase();
          return log.message.toLowerCase().includes(searchLower);
        }
        return true;
      })
      .slice(-maxLines); // Only show last N lines
  }, [logs, levelFilter, search, maxLines]);


  // Export logs
  const handleExport = () => {
    const text = filteredLogs
      .map((log) => {
        const timestamp = formatLogTimestamp(log.timestamp);
        const level = log.level.toUpperCase();
        return `[${timestamp}] [${level}] ${log.message}`;
      })
      .join('\n');

    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = exportFilename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Copy logs
  const handleCopy = () => {
    const text = filteredLogs
      .map((log) => {
        const timestamp = formatLogTimestamp(log.timestamp);
        const level = log.level.toUpperCase();
        return `[${timestamp}] [${level}] ${log.message}`;
      })
      .join('\n');

    navigator.clipboard.writeText(text);
  };

  // Clear logs
  const handleClear = () => {
    // This would be handled by parent component
    // For now, just trigger the onClear callback if passed
  };

  // Font size mapping
  const fontSizeClass = {
    xs: 'text-[10px]',
    sm: 'text-[11px]',
    md: 'text-[12px]',
  }[fontSize];

  return (
    <div className={`task-log-stream theme-panel theme-border rounded border ${className}`}>
      {/* Header with search and actions */}
      {(showSearch || showFilters || showExport) && (
        <div className="theme-panel-muted theme-border flex items-center justify-between border-b px-2 py-1">
          <button
            onClick={() => setExpanded(!expanded)}
            className="theme-text flex items-center gap-1 text-[11px] transition-colors hover:text-[var(--accent-color)]"
          >
            {expanded ? (
              <ChevronDown size={12} />
            ) : (
              <ChevronUp size={12} />
            )}
            <span>{t('taskLogStream.title', { count: filteredLogs.length })}</span>
          </button>
        </div>
      )}

      {/* Search bar */}
      {expanded && (showSearch || showFilters) && (
        <LogSearchBar
          search={search}
          onSearchChange={setSearch}
          levelFilter={levelFilter}
          onLevelChange={setLevelFilter}
          logCount={logs.length}
          filteredCount={filteredLogs.length}
          onExport={showExport ? handleExport : undefined}
          onCopy={handleCopy}
          onClear={handleClear}
        />
      )}

      {/* Log content */}
      {expanded && (
        <div
          ref={logContainerRef}
          className={`overflow-y-auto font-mono ${fontSizeClass}`}
          style={{ maxHeight: '300px' }}
        >
          {filteredLogs.length === 0 ? (
            <div className="theme-text-subtle px-3 py-8 text-center italic">
              {logs.length === 0 ? t('taskLogStream.empty') : t('taskLogStream.noMatches')}
            </div>
          ) : (
            <div className="px-2 py-1 space-y-0.5">
              {filteredLogs.map((log, index) => {
                const { html, hasColor } = parseANSIToHTML(log.message);
                const timestamp = formatLogTimestamp(log.timestamp);
                const lineNumber = logs.length - filteredLogs.length + index + 1;

                return (
                  <div
                    key={`${log.timestamp}-${index}`}
                    className="theme-soft-hover group flex gap-2 rounded px-1 py-0.5"
                  >
                    {/* Line number */}
                    {showLineNumbers && (
                      <span className="theme-text-subtle min-w-[40px] select-none text-right">
                        {lineNumber}
                      </span>
                    )}

                    {/* Timestamp */}
                    {showTimestamps && (
                      <span className="theme-text-subtle min-w-[80px] select-none">
                        {timestamp}
                      </span>
                    )}

                    {/* Level badge */}
                    <LogLevelBadge level={log.level} />

                    {/* Message */}
                    <div className="flex-1 min-w-0 overflow-hidden">
                      {hasColor ? (
                        <span
                          className="break-words"
                          dangerouslySetInnerHTML={{ __html: html }}
                        />
                      ) : (
                        <span className="theme-text break-words">{log.message}</span>
                      )}
                    </div>
                  </div>
                );
              })}
              <div ref={endRef} />
            </div>
          )}
        </div>
      )}

      {/* Auto-scroll toggle */}
      {expanded && filteredLogs.length > 10 && (
        <div className="theme-panel-muted theme-border flex items-center justify-between border-t px-2 py-1">
          <label className="theme-text-subtle flex cursor-pointer items-center gap-1.5 text-[10px]">
            <input
              type="checkbox"
              checked={autoScrollEnabled}
              onChange={(e) => setAutoScrollEnabled(e.target.checked)}
              className="theme-checkbox-input h-3 w-3"
            />
            <span>{t('taskLogStream.autoScroll')}</span>
          </label>
        </div>
      )}
    </div>
  );
};

// ============================================================================
// Compact Variant (Inline)
// ============================================================================

export interface TaskLogCompactProps {
  logs: LogEntry[];
  maxLines?: number;
  className?: string;
  showTimestamp?: boolean;
  showLevel?: boolean;
  showColors?: boolean;
  clickable?: boolean;
  onClick?: () => void;
  theme?: 'default' | 'subtle' | 'vibrant';
}

const LEVEL_COLORS: Record<LogLevel, string> = {
  debug: 'var(--text-subtle)',
  info: 'var(--info-color)',
  warn: 'var(--warning-color)',
  error: 'var(--danger-color)',
};

const getLevelColor = (level: LogLevel, theme: TaskLogCompactProps['theme'] = 'default'): string => {
  if (theme === 'subtle') {
    return 'var(--text-subtle)';
  }
  return LEVEL_COLORS[level] || LEVEL_COLORS.info;
};

export const TaskLogCompact: React.FC<TaskLogCompactProps> = ({
  logs,
  maxLines = 5,
  className = '',
  showTimestamp = false,
  showLevel = true,
  showColors = true,
  clickable = false,
  onClick,
  theme = 'default',
}) => {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const recentLogs = logs.slice(-maxLines);
  const displayLogs = expanded ? logs : recentLogs;

  if (displayLogs.length === 0) return null;

  const hasMore = logs.length > maxLines && !expanded;

  return (
    <div
      className={`task-log-compact ${clickable ? 'cursor-pointer theme-soft-hover' : ''} ${className}`}
      onClick={() => {
        if (clickable && onClick) {
          onClick();
        } else if (logs.length > maxLines) {
          setExpanded(!expanded);
        }
      }}
    >
      {displayLogs.map((log, index) => {
        const levelColor = getLevelColor(log.level, theme);
        const { html } = parseANSIToHTML(log.message);

        return (
          <div
            key={`${log.timestamp}-${index}`}
            className="text-[10px] font-mono truncate flex items-center gap-1.5"
            style={{ color: 'var(--text-subtle)' }}
          >
            {/* Timestamp */}
            {showTimestamp && (
              <span className="opacity-50 select-none">
                {formatLogTimestamp(log.timestamp, false)}
              </span>
            )}

            {/* Level badge */}
            {showLevel && (
              <span
                className="font-medium select-none flex-shrink-0"
                style={{ color: showColors ? levelColor : undefined }}
              >
                [{log.level.toUpperCase()}]
              </span>
            )}

            {/* Message with ANSI colors */}
            <span
              className="flex-1 truncate"
              dangerouslySetInnerHTML={{ __html: html }}
            />
          </div>
        );
      })}

      {/* Show more/less indicator */}
      {hasMore && (
        <div className="mt-0.5 text-[10px] font-mono text-[var(--info-color)] opacity-70">
          {t('taskLogStream.more', { count: logs.length - maxLines })}
        </div>
      )}
      {expanded && logs.length > maxLines && (
        <div className="mt-0.5 text-[10px] font-mono text-[var(--info-color)] opacity-70">
          {t('taskLogStream.less')}
        </div>
      )}
    </div>
  );
};

export default TaskLogStream;
