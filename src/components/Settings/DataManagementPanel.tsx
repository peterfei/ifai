/**
 * Data Management Panel
 *
 * Provides thread data export/import functionality
 */

import React, { useState, useRef } from 'react';
import { Download, Upload, Trash2, RefreshCw } from 'lucide-react';
import { useThreadStore } from '../../stores/threadStore';
import { exportThreadsToFile, importThreadsFromFile } from '../../stores/persistence/threadPersistence';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

export const DataManagementPanel: React.FC = () => {
  const { t } = useTranslation();
  const threadStore = useThreadStore();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [isClearing, setIsClearing] = useState(false);

  // Get thread statistics
  const threads = Object.values(threadStore.threads);
  const activeThreads = threads.filter(t => t.status === 'active').length;
  const archivedThreads = threads.filter(t => t.status === 'archived').length;
  const totalMessages = threads.reduce((sum, t) => sum + t.messageCount, 0);

  // Export all threads to JSON file
  const handleExport = async () => {
    setIsExporting(true);
    try {
      await exportThreadsToFile();
      toast.success(t('dataManagement.exportSuccess'), {
        description: t('dataManagement.exportSuccessDesc'),
      });
    } catch (error) {
      console.error('Export failed:', error);
      toast.error(t('dataManagement.exportFailed'), {
        description: error instanceof Error ? error.message : t('dataManagement.unknownError'),
      });
    } finally {
      setIsExporting(false);
    }
  };

  // Import threads from JSON file
  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleImportFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    try {
      await importThreadsFromFile(file);
      toast.success(t('dataManagement.importSuccess'), {
        description: t('dataManagement.importSuccessDesc'),
      });
      // Refresh the page to reload data
      setTimeout(() => {
        window.location.reload();
      }, 1000);
    } catch (error) {
      console.error('Import failed:', error);
      toast.error(t('dataManagement.importFailed'), {
        description: error instanceof Error ? error.message : t('dataManagement.fileFormatError'),
      });
    } finally {
      setIsImporting(false);
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  // Clear all deleted threads
  const handleClearDeleted = async () => {
    setIsClearing(true);
    try {
      threadStore.clearDeletedThreads();
      toast.success(t('dataManagement.clearSuccess'), {
        description: t('dataManagement.clearSuccessDesc'),
      });
    } finally {
      setIsClearing(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Statistics */}
      <div className="theme-panel-muted theme-border rounded-lg border p-4">
        <h3 className="theme-text-muted mb-3 text-sm font-medium">{t('dataManagement.statistics')}</h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="text-center">
            <div className="text-2xl font-bold text-[var(--accent-color)]">{activeThreads}</div>
            <div className="theme-text-subtle mt-1 text-xs">{t('dataManagement.activeThreads')}</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-[var(--warning-color)]">{archivedThreads}</div>
            <div className="theme-text-subtle mt-1 text-xs">{t('dataManagement.archivedThreads')}</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-[var(--success-color)]">{totalMessages}</div>
            <div className="theme-text-subtle mt-1 text-xs">{t('dataManagement.totalMessages')}</div>
          </div>
        </div>
      </div>

      {/* Export / Import */}
      <div className="space-y-4">
        <h3 className="theme-text-muted text-sm font-medium">{t('dataManagement.exportImport')}</h3>
        <p className="theme-text-subtle text-xs">
          {t('dataManagement.exportImportDesc')}
        </p>

        <div className="flex flex-wrap gap-3">
          <button
            onClick={handleExport}
            disabled={isExporting || activeThreads === 0}
            className={`
              flex min-w-[180px] flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors sm:flex-none
              ${isExporting || activeThreads === 0
                ? 'theme-input-surface theme-text-subtle cursor-not-allowed'
                : 'theme-button-primary'
              }
            `}
          >
            <Download size={16} />
            {isExporting ? t('dataManagement.exporting') : t('dataManagement.exportThreads')}
          </button>

          <button
            onClick={handleImportClick}
            disabled={isImporting}
            className={`
              flex min-w-[180px] flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors sm:flex-none
              ${isImporting
                ? 'theme-input-surface theme-text-subtle cursor-not-allowed'
                : 'theme-button-success'
              }
            `}
          >
            <Upload size={16} />
            {isImporting ? t('dataManagement.importing') : t('dataManagement.importThreads')}
          </button>

          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            onChange={handleImportFileChange}
            className="hidden"
          />
        </div>
      </div>

      {/* Storage Management */}
      <div className="space-y-4">
        <h3 className="theme-text-muted text-sm font-medium">{t('dataManagement.storageManagement')}</h3>
        <p className="theme-text-subtle text-xs">
          {t('dataManagement.storageManagementDesc')}
        </p>

        <div className="flex flex-wrap gap-3">
          <button
            onClick={handleClearDeleted}
            disabled={isClearing}
            className={`
              flex min-w-[220px] items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors
              ${isClearing
                ? 'theme-input-surface theme-text-subtle cursor-not-allowed'
                : 'theme-button-danger'
              }
            `}
          >
            <Trash2 size={16} />
            {isClearing ? t('dataManagement.clearing') : t('dataManagement.clearDeletedThreads')}
          </button>
        </div>
      </div>

      {/* Info */}
      <div className="theme-surface-info rounded-lg p-4">
        <div className="flex gap-2">
          <RefreshCw size={16} className="theme-text-info mt-0.5 flex-shrink-0" />
          <div className="text-xs">
            <strong className="block mb-1">{t('dataManagement.autoSave')}</strong>
            <span className="theme-text-subtle">{t('dataManagement.autoSaveDesc')}</span>
          </div>
        </div>
      </div>
    </div>
  );
};
