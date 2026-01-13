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
      <div className="bg-[#1e1e1e] rounded-lg p-4 border border-gray-700">
        <h3 className="text-sm font-medium text-gray-300 mb-3">{t('dataManagement.statistics')}</h3>
        <div className="grid grid-cols-3 gap-4">
          <div className="text-center">
            <div className="text-2xl font-bold text-blue-400">{activeThreads}</div>
            <div className="text-xs text-gray-500 mt-1">{t('dataManagement.activeThreads')}</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-yellow-400">{archivedThreads}</div>
            <div className="text-xs text-gray-500 mt-1">{t('dataManagement.archivedThreads')}</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-green-400">{totalMessages}</div>
            <div className="text-xs text-gray-500 mt-1">{t('dataManagement.totalMessages')}</div>
          </div>
        </div>
      </div>

      {/* Export / Import */}
      <div className="space-y-4">
        <h3 className="text-sm font-medium text-gray-300">{t('dataManagement.exportImport')}</h3>
        <p className="text-xs text-gray-500">
          {t('dataManagement.exportImportDesc')}
        </p>

        <div className="flex gap-3">
          <button
            onClick={handleExport}
            disabled={isExporting || activeThreads === 0}
            className={`
              flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors
              ${isExporting || activeThreads === 0
                ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                : 'bg-blue-600 hover:bg-blue-700 text-white'
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
              flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors
              ${isImporting
                ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                : 'bg-green-600 hover:bg-green-700 text-white'
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
        <h3 className="text-sm font-medium text-gray-300">{t('dataManagement.storageManagement')}</h3>
        <p className="text-xs text-gray-500">
          {t('dataManagement.storageManagementDesc')}
        </p>

        <div className="flex gap-3">
          <button
            onClick={handleClearDeleted}
            disabled={isClearing}
            className={`
              flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors
              ${isClearing
                ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                : 'bg-red-600 hover:bg-red-700 text-white'
              }
            `}
          >
            <Trash2 size={16} />
            {isClearing ? t('dataManagement.clearing') : t('dataManagement.clearDeletedThreads')}
          </button>
        </div>
      </div>

      {/* Info */}
      <div className="bg-blue-900/20 border border-blue-700 rounded-lg p-4">
        <div className="flex gap-2">
          <RefreshCw size={16} className="text-blue-400 flex-shrink-0 mt-0.5" />
          <div className="text-xs text-blue-200">
            <strong className="block mb-1">{t('dataManagement.autoSave')}</strong>
            {t('dataManagement.autoSaveDesc')}
          </div>
        </div>
      </div>
    </div>
  );
};
