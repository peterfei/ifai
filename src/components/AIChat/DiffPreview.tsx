import React, { memo } from 'react';
import { Eye, FileText, ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface DiffPreviewProps {
  oldContent: string | null;
  newContent: string;
  fileName: string;
}

export const DiffPreview: React.FC<DiffPreviewProps> = memo(({ oldContent, newContent, fileName }) => {
  const { t } = useTranslation();
  const isNewFile = oldContent === null;
  
  // 基础统计与保护
  const safeNewContent = newContent || '';
  const oldLines = oldContent ? oldContent.split('\n') : [];
  const newLines = safeNewContent.split('\n');
  
  return (
    <div className="mt-3 overflow-hidden rounded-xl border border-[var(--accent-soft-border)] bg-[var(--accent-soft-bg)] transition-all">
      <div className="flex items-center justify-between border-b border-[var(--accent-soft-border)] bg-[var(--accent-soft-bg)] px-4 py-2">
        <div className="flex items-center gap-2">
          <Eye size={14} className="theme-text-accent" />
          <span className="text-[10px] font-bold uppercase tracking-widest theme-text-accent">
            {isNewFile ? t('aiChat.diffPreview.newFile') : t('aiChat.diffPreview.semantic')}
          </span>
        </div>
        <div className="flex items-center gap-1.5 rounded-md theme-panel px-2 py-0.5 border border-[var(--accent-soft-border)]">
          <FileText size={12} className="theme-text-accent opacity-70" />
          <span className="text-[10px] font-mono theme-text-muted">{fileName}</span>
        </div>
      </div>
      
      <div className="p-3 max-h-[300px] overflow-auto font-mono text-[11px] leading-relaxed">
        {isNewFile ? (
          <div className="space-y-0.5">
            {newLines.slice(0, 50).map((line, i) => (
              <div key={i} className="flex gap-3 group">
                <span className="w-8 text-right theme-text-subtle opacity-60 select-none">{i + 1}</span>
                <span className="theme-text whitespace-pre-wrap">{line}</span>
              </div>
            ))}
            {newLines.length > 50 && (
              <div className="pl-11 theme-text-subtle italic">{t('aiChat.diffPreview.remainingLines', { count: newLines.length - 50 })}</div>
            )}
          </div>
        ) : (
          <div className="space-y-1">
             <div className="flex items-center gap-2 theme-text-accent opacity-70 italic mb-2">
                <ChevronRight size={12} />
                <span>{t('aiChat.diffPreview.analyzing')}</span>
             </div>
             <div className="p-2 rounded theme-panel border border-[var(--accent-soft-border)] theme-text-muted">
                {t('aiChat.diffPreview.lineSummary', { oldCount: oldLines.length, newCount: newLines.length })}
             </div>
          </div>
        )}
      </div>
      
      <div className="px-4 py-1.5 bg-[var(--accent-soft-bg)] border-t border-[var(--accent-soft-border)] flex justify-end">
         <span className="text-[9px] theme-text-subtle uppercase tracking-tighter">{t('aiChat.diffPreview.poweredBy')}</span>
      </div>
    </div>
  );
});
