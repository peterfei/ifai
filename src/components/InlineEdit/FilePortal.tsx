import React from 'react';
import { motion } from 'framer-motion';
import { FileText, ExternalLink } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface FilePortalProps {
  files: string[];
  onNavigate: (path: string) => void;
}

export const FilePortal: React.FC<FilePortalProps> = ({ files, onNavigate }) => {
  const { t } = useTranslation();

  if (files.length === 0) return null;

  return (
    <div className="file-portal theme-border mt-3 border-t pt-2">
      <div className="flex items-center gap-2 mb-2 px-1">
        <span className="theme-text-subtle text-[10px] font-bold uppercase tracking-widest">
          {t('inlineAIWidget.modifiedFiles', { count: files.length })}
        </span>
      </div>
      
      <div className="flex flex-col gap-1">
        {files.map((path) => (
          <motion.button
            key={path}
            whileHover={{ x: 2 }}
            onClick={() => onNavigate(path)}
            title={path}
            aria-label={t('inlineAIWidget.openModifiedFile', { file: path.split('/').pop() ?? path })}
            className="theme-panel-muted theme-border flex w-full items-center justify-between rounded-md border px-2 py-1.5 text-left transition-all group hover:border-[var(--accent-soft-border)] hover:bg-[var(--hover-bg)]"
          >
            <div className="flex items-center gap-2 min-w-0">
              <FileText size={12} className="theme-text-accent shrink-0 opacity-70" />
              <span className="theme-text-muted text-[11px] truncate font-mono">
                {path.split('/').pop()}
                <span className="theme-text-subtle ml-2 text-[9px]">
                  {path.includes('/') ? path.substring(0, path.lastIndexOf('/')) : ''}
                </span>
              </span>
            </div>
            <ExternalLink size={10} className="theme-text-subtle text-transparent transition-colors group-hover:text-[var(--accent-color)]" />
          </motion.button>
        ))}
      </div>
    </div>
  );
};
