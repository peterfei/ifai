import React from 'react';
import { motion } from 'framer-motion';
import { FileText, ArrowRight, ExternalLink } from 'lucide-react';

interface FilePortalProps {
  files: string[];
  onNavigate: (path: string) => void;
}

export const FilePortal: React.FC<FilePortalProps> = ({ files, onNavigate }) => {
  if (files.length === 0) return null;

  return (
    <div className="file-portal theme-border mt-3 border-t pt-2">
      <div className="flex items-center gap-2 mb-2 px-1">
        <span className="theme-text-subtle text-[10px] font-bold uppercase tracking-widest">
          Modified Files ({files.length})
        </span>
      </div>
      
      <div className="flex flex-col gap-1">
        {files.map((path) => (
          <motion.button
            key={path}
            whileHover={{ x: 2, backgroundColor: 'rgba(255, 255, 255, 0.05)' }}
            onClick={() => onNavigate(path)}
            className="theme-soft-hover flex items-center justify-between w-full rounded-md px-2 py-1.5 text-left transition-all group"
          >
            <div className="flex items-center gap-2 min-w-0">
              <FileText size={12} className="text-blue-400/60" />
              <span className="theme-text-muted text-[11px] truncate font-mono">
                {path.split('/').pop()}
                <span className="theme-text-subtle ml-2 text-[9px]">
                  {path.includes('/') ? path.substring(0, path.lastIndexOf('/')) : ''}
                </span>
              </span>
            </div>
            <ExternalLink size={10} className="text-transparent group-hover:text-[var(--text-subtle)] transition-colors" />
          </motion.button>
        ))}
      </div>
    </div>
  );
};
