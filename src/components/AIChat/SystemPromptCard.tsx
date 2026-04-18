import React, { useState, useCallback } from 'react';
import { ChevronDown, ChevronRight, Eye, FileText, Loader2, Zap } from 'lucide-react';
import { useTransparencyStore, type SystemPromptMeta, type PromptSectionMeta } from '../../stores/transparencyStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { useTranslation } from 'react-i18next';

type TransparencyLevel = 'minimal' | 'standard' | 'verbose' | 'debug';

interface SystemPromptCardProps {
  meta: SystemPromptMeta;
}

export const SystemPromptCard: React.FC<SystemPromptCardProps> = ({ meta }) => {
  const { t } = useTranslation();
  const transparencyLevel = useSettingsStore(s => s.transparencyLevel);
  const { promptDetailCache, loadingSection, fetchPromptDetail } = useTransparencyStore();

  const [expanded, setExpanded] = useState(transparencyLevel === 'debug');
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    transparencyLevel === 'debug' ? new Set(meta.sections.map(s => s.name)) : new Set()
  );
  const [loadedSections, setLoadedSections] = useState<Set<string>>(new Set());

  // debug 模式自动展开
  React.useEffect(() => {
    if (transparencyLevel === 'debug') {
      setExpanded(true);
      setExpandedSections(new Set(meta.sections.map(s => s.name)));
    }
  }, [transparencyLevel, meta.sections]);

  const toggleSection = useCallback((name: string) => {
    setExpandedSections(prev => {
      const next = new Set(prev);
      if (next.has(name)) {
        next.delete(name);
      } else {
        next.add(name);
      }
      return next;
    });
  }, []);

  const loadSectionContent = useCallback(async (section: PromptSectionMeta) => {
    if (loadedSections.has(section.name) || !section.present && section.char_count === 0) return;

    try {
      await fetchPromptDetail(section.name);
      setLoadedSections(prev => new Set(prev).add(section.name));
    } catch (e) {
      console.error(`[SystemPromptCard] Failed to load section ${section.name}:`, e);
    }
  }, [loadedSections, fetchPromptDetail]);

  const presentSections = meta.sections.filter(s => s.present !== false || s.char_count > 0);

  if (transparencyLevel === 'minimal') return null;

  const totalTokens = meta.total_tokens_estimate;

  return (
    <div className="theme-panel-muted theme-border mx-2 my-1.5 overflow-hidden rounded-lg border shadow-sm">
      {/* Header - always visible */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="theme-hoverable theme-text-subtle flex w-full items-center gap-2 px-3 py-2 text-xs transition-colors"
      >
        {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        <Eye size={12} className="theme-text-accent opacity-60" />
        <span className="font-medium">{t('systemPromptCard.title')}</span>
        <span className="theme-text-subtle opacity-60">|</span>
        <span>{t('systemPromptCard.sectionsCount', { count: presentSections.length })}</span>
        <span className="theme-text-subtle opacity-60">|</span>
        <span>{t('systemPromptCard.totalTokens', { count: totalTokens, tokens: t('conversation.summary.tokens') })}</span>
        {meta.mode && (
          <>
            <span className="theme-text-subtle opacity-60">|</span>
            <span className="theme-text-info opacity-60">{meta.mode}</span>
          </>
        )}
        {meta.skills.length > 0 && (
          <>
            <span className="theme-text-subtle opacity-60">|</span>
            <span className="theme-text-warning opacity-60">
              <Zap size={10} className="inline mr-0.5" />
              {t('systemPromptCard.skillsCount', { count: meta.skills.length })}
            </span>
          </>
        )}
      </button>

      {/* Expanded content */}
      {expanded && (
        <div className="theme-border space-y-1 border-t px-3 py-2">
          {presentSections.map(section => (
            <SectionItem
              key={section.name}
              section={section}
              isExpanded={expandedSections.has(section.name)}
              isLoading={loadingSection === section.name}
              content={promptDetailCache[section.name]}
              showDetails={transparencyLevel === 'verbose' || transparencyLevel === 'debug'}
              onToggle={() => {
                toggleSection(section.name);
                if (!expandedSections.has(section.name)) {
                  loadSectionContent(section);
                }
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
};

// === Section Item ===

interface SectionItemProps {
  section: PromptSectionMeta;
  isExpanded: boolean;
  isLoading: boolean;
  content?: string;
  showDetails: boolean;
  onToggle: () => void;
}

const SectionItem: React.FC<SectionItemProps> = ({
  section,
  isExpanded,
  isLoading,
  content,
  showDetails,
  onToggle,
}) => {
  const { t } = useTranslation();

  return (
    <div>
      <button
        onClick={onToggle}
        className="theme-hoverable flex w-full items-center gap-2 rounded px-2 py-1.5 text-xs transition-colors"
      >
        {isExpanded ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
        <FileText size={11} className="theme-text-subtle opacity-70" />
        <span className="theme-text">{section.label}</span>
        <span className="theme-text-subtle ml-auto">
          {section.char_count > 0 && (
            <>
              {t('dialog.characterCount', { count: section.char_count })}
              {showDetails && (
                <> / {t('systemPromptCard.totalTokens', { count: section.tokens_estimate, tokens: t('conversation.summary.tokens') })}</>
              )}
            </>
          )}
          {section.present === false && section.char_count === 0 && (
            <span className="theme-text-subtle italic opacity-70">{t('systemPromptCard.inactive')}</span>
          )}
        </span>
        {isLoading && <Loader2 size={10} className="theme-text-accent animate-spin opacity-60" />}
      </button>

      {/* Expanded section content */}
      {isExpanded && content && (
        <div className="theme-input-surface theme-border ml-6 mt-1 mb-2 max-h-60 overflow-y-auto rounded border p-2">
          <pre className="theme-text-subtle whitespace-pre-wrap font-mono text-[11px] leading-relaxed">
            {content.length > 3000 ? `${content.slice(0, 3000)}\n\n${t('systemPromptCard.truncated')}` : content}
          </pre>
        </div>
      )}

      {isExpanded && !content && !isLoading && section.char_count > 0 && (
        <div className="theme-text-subtle ml-6 mt-1 text-[11px] italic opacity-80">
          {t('systemPromptCard.clickToLoad')}
        </div>
      )}
    </div>
  );
};
