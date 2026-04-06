import React, { useState, useCallback } from 'react';
import { ChevronDown, ChevronRight, Eye, FileText, Loader2, Zap } from 'lucide-react';
import { useTransparencyStore, type SystemPromptMeta, type PromptSectionMeta } from '../../stores/transparencyStore';
import { useSettingsStore } from '../../stores/settingsStore';
import clsx from 'clsx';

type TransparencyLevel = 'minimal' | 'standard' | 'verbose' | 'debug';

interface SystemPromptCardProps {
  meta: SystemPromptMeta;
}

export const SystemPromptCard: React.FC<SystemPromptCardProps> = ({ meta }) => {
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
    <div className="mx-2 my-1.5 rounded-lg border border-white/5 bg-white/[0.03] overflow-hidden">
      {/* Header - always visible */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-3 py-2 text-xs text-white/50 hover:text-white/70 hover:bg-white/[0.03] transition-colors"
      >
        {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        <Eye size={12} className="text-blue-400/60" />
        <span className="font-medium">System Prompt</span>
        <span className="text-white/30">|</span>
        <span>{presentSections.length} sections</span>
        <span className="text-white/30">|</span>
        <span>~{totalTokens.toLocaleString()} tokens</span>
        {meta.mode && (
          <>
            <span className="text-white/30">|</span>
            <span className="text-purple-400/60">{meta.mode}</span>
          </>
        )}
        {meta.skills.length > 0 && (
          <>
            <span className="text-white/30">|</span>
            <span className="text-amber-400/60">
              <Zap size={10} className="inline mr-0.5" />
              {meta.skills.length} skills
            </span>
          </>
        )}
      </button>

      {/* Expanded content */}
      {expanded && (
        <div className="border-t border-white/5 px-3 py-2 space-y-1">
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
  return (
    <div>
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-2 px-2 py-1.5 text-xs rounded hover:bg-white/[0.04] transition-colors"
      >
        {isExpanded ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
        <FileText size={11} className="text-white/30" />
        <span className="text-white/60">{section.label}</span>
        <span className="text-white/25 ml-auto">
          {section.char_count > 0 && (
            <>
              {section.char_count.toLocaleString()} chars
              {showDetails && (
                <> / ~{section.tokens_estimate.toLocaleString()} tokens</>
              )}
            </>
          )}
          {section.present === false && section.char_count === 0 && (
            <span className="text-white/20 italic">inactive</span>
          )}
        </span>
        {isLoading && <Loader2 size={10} className="animate-spin text-blue-400/60" />}
      </button>

      {/* Expanded section content */}
      {isExpanded && content && (
        <div className="ml-6 mt-1 mb-2 p-2 rounded bg-black/30 border border-white/5 max-h-60 overflow-y-auto">
          <pre className="text-[11px] text-white/40 whitespace-pre-wrap font-mono leading-relaxed">
            {content.length > 3000 ? content.slice(0, 3000) + '\n\n... (truncated)' : content}
          </pre>
        </div>
      )}

      {isExpanded && !content && !isLoading && section.char_count > 0 && (
        <div className="ml-6 mt-1 text-[11px] text-white/20 italic">
          Click to load content
        </div>
      )}
    </div>
  );
};
