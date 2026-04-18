import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { usePromptStore } from '../../stores/promptStore';
import { useAgentStore } from '../../stores/agentStore';
import { Play, Save, AlertTriangle, Lock, History, Shield } from 'lucide-react';
import { toast } from 'sonner';
import { checkFeature } from '../../config/edition';
import { VersionHistory } from './VersionHistory';
import { VersionDiffViewer } from './VersionDiffViewer';
import { OverrideConfirmDialog } from './OverrideConfirmDialog';
import { PromptMonacoEditor } from './PromptMonacoEditor';
import { ValidationPanel } from './ValidationPanel';
import { AccessTier } from '../../types/prompt';

export const PromptEditor: React.FC = () => {
  const { t } = useTranslation();
  const canEdit = checkFeature('promptEditing');
  const { selectedPrompt, updatePrompt, renderTemplate } = usePromptStore();
  const { launchAgent } = useAgentStore();
  const [content, setContent] = useState('');
  const [preview, setPreview] = useState('');
  const [activeTab, setActiveTab] = useState<'edit' | 'preview'>('edit');
  const [showVersionHistory, setShowVersionHistory] = useState(false);
  const [diffVersions, setDiffVersions] = useState<{ old: string; new: string } | null>(null);
  const [showOverrideDialog, setShowOverrideDialog] = useState(false);
  const [showValidationPanel, setShowValidationPanel] = useState(false);

  const createDefaultTestVariables = (): Record<string, string> => ({
    USER_NAME: t('promptManager.editor.sampleUser'),
    TARGET_LANGUAGE: t('promptManager.editor.sampleLanguage'),
    PROJECT_NAME: t('promptManager.editor.sampleProject'),
    CWD: t('promptManager.editor.sampleCwd'),
  });
  const getOverrideFileName = (promptPath: string): string => {
    const baseName = promptPath.split('/').filter(Boolean).pop()?.replace(/^builtin:\/\//, '') || 'prompt.md';
    return baseName.endsWith('.md')
      ? baseName.replace(/\.md$/i, '.override.md')
      : `${baseName}.override.md`;
  };
  const [testVariables, setTestVariables] = useState<Record<string, string>>(() => createDefaultTestVariables());
  const overrideFileName = selectedPrompt?.path ? getOverrideFileName(selectedPrompt.path) : 'prompt.override.md';

  useEffect(() => {
    if (selectedPrompt) {
      setContent(selectedPrompt.raw_text || selectedPrompt.content || "");
      const newVars = { ...createDefaultTestVariables() };
      selectedPrompt.metadata?.variables?.forEach(v => {
          if (!newVars[v]) newVars[v] = t('promptManager.editor.sampleValue');
      });
      setTestVariables(newVars);
    }
  }, [selectedPrompt, t]);

  const handleRender = async () => {
      try {
        const result = await renderTemplate(content, testVariables);
        setPreview(result);
      } catch (e) {
          setPreview(t('promptManager.editor.renderFailed', { error: String(e) }));
      }
  };

  useEffect(() => {
      if (activeTab === 'preview') {
          handleRender();
      }
  }, [content, activeTab, testVariables]);

  const handleSave = async () => {
    if (!selectedPrompt?.path) return;

    const isBuiltin = selectedPrompt.path.startsWith('builtin://');
    const accessTier = selectedPrompt.metadata?.access_tier || AccessTier.Public;
    const needsOverride = isBuiltin || accessTier === AccessTier.Protected || accessTier === AccessTier.Private;

    // 显示覆盖确认对话框
    if (needsOverride) {
      setShowOverrideDialog(true);
      return;
    }

    // 直接保存 Public 提示词
    try {
      await updatePrompt(selectedPrompt.path, content);
      toast.success(t('promptManager.editor.saveSuccess'));
    } catch (e) {
      toast.error(t('promptManager.editor.saveFailed'), {
        description: String(e)
      });
    }
  };

  const handleOverrideConfirm = async () => {
    if (!selectedPrompt?.path) return;

    const isBuiltin = selectedPrompt.path.startsWith('builtin://');

    try {
      await updatePrompt(selectedPrompt.path, content);
      setShowOverrideDialog(false);

      if (isBuiltin) {
        toast.success(t('promptManager.editor.overrideProjectCreated'), {
          description: t('promptManager.editor.overrideProjectCreatedDesc')
        });
      } else {
        toast.success(t('promptManager.editor.overrideFileCreated'), {
          description: t('promptManager.editor.overrideFileCreatedDesc', {
            fileName: overrideFileName,
          })
        });
      }
    } catch (e) {
      toast.error(t('promptManager.editor.saveFailed'), {
        description: String(e)
      });
    }
  };

  const handleOverrideCancel = () => {
    setShowOverrideDialog(false);
  };

  const handleRun = async () => {
      if (!selectedPrompt?.metadata) return;
      try {
          await launchAgent(selectedPrompt.metadata.name, t('promptManager.editor.launchTask'));
          toast.info(t('promptManager.editor.launchStarted', { name: selectedPrompt.metadata.name }));
      } catch (e) {
          toast.error(t('promptManager.editor.launchFailed'), {
            description: String(e)
          });
      }
  };

  const handleVersionCompare = (oldVersion: string, newVersion: string) => {
    setDiffVersions({ old: oldVersion, new: newVersion });
  };

  const handleVersionRollback = async (versionId: string) => {
    toast.success(t('promptManager.editor.rollbackSuccess', { version: versionId.substring(0, 7) }));
    setShowVersionHistory(false);
  };

  const handleValidationComplete = (result: any) => {
    void result;
  };

  if (!selectedPrompt) {
    return (
        <div className="theme-panel theme-text-subtle flex flex-1 flex-col items-center justify-center">
            <div className="theme-text-muted mb-2 text-sm font-semibold">{t('promptManager.editor.emptyTitle')}</div>
            <p className="text-center text-sm">{t('promptManager.editor.emptyDescription')}</p>
        </div>
    );
  }

  // Double check structure
  if (!selectedPrompt.metadata) {
      return (
          <div className="theme-surface-danger flex flex-1 flex-col items-center justify-center p-4">
              <AlertTriangle size={32} className="theme-text-danger mb-4" />
              <p className="theme-text font-bold">{t('promptManager.editor.invalidTitle')}</p>
              <p className="theme-text-subtle mt-2 text-center text-xs">{t('promptManager.editor.invalidDescription')}</p>
          </div>
      );
  }

  const isBuiltin = selectedPrompt.path?.startsWith('builtin://') || false;
  const isReadOnly = !canEdit || (selectedPrompt.metadata.access_tier !== 'public' && !isBuiltin);

  return (
    <div className="theme-panel flex-1 flex flex-col h-full shadow-inner">
      {!canEdit && (
          <div className="theme-panel-muted theme-border flex items-center justify-between border-b px-4 py-2 text-xs">
              <div className="theme-text flex items-center gap-2">
                  <Lock size={12} className="theme-text-warning" />
                  <span>{t('promptManager.editor.commercialNotice')}</span>
              </div>
              <button 
                onClick={() => window.open('https://ifai.dev/pricing')}
                className="theme-button-primary rounded px-2.5 py-1 text-[11px] font-semibold"
              >
                {t('promptManager.editor.learnMore')}
              </button>
          </div>
      )}
      {canEdit && isBuiltin && (
          <div className="theme-surface-info flex items-center gap-2 border-b px-4 py-1.5 text-[10px]">
              <span className="theme-badge-info rounded-sm px-1 font-bold">{t('promptManager.editor.infoBadge')}</span>
              <span className="theme-text">{t('promptManager.editor.builtInNotice')}</span>
          </div>
      )}
      <div className="theme-panel-muted theme-border flex items-center justify-between border-b px-4 py-2">
        <div className="flex space-x-1">
            <button 
                className={`rounded-t-md px-4 py-1.5 text-xs font-semibold transition-all ${activeTab === 'edit' ? 'theme-panel theme-border border-x border-t theme-text-accent shadow-sm' : 'theme-text-subtle hover:text-[var(--text-primary)]'}`}
                onClick={() => setActiveTab('edit')}
            >
                {t('promptManager.editor.tabEditor')}
            </button>
            <button 
                className={`rounded-t-md px-4 py-1.5 text-xs font-semibold transition-all ${activeTab === 'preview' ? 'theme-panel theme-border border-x border-t theme-text-accent shadow-sm' : 'theme-text-subtle hover:text-[var(--text-primary)]'}`}
                onClick={() => setActiveTab('preview')}
            >
                {t('promptManager.editor.tabPreview')}
            </button>
        </div>
        <div className="flex items-center space-x-2">
            {isReadOnly && (
                <span className="rounded border border-[var(--warning-soft-border)] bg-[var(--warning-soft-bg)] px-2 py-1 font-mono text-[10px] text-[var(--text-primary)]">
                    {t('promptManager.editor.readOnly')}
                </span>
            )}
            <button
                onClick={() => setShowVersionHistory(true)}
                className="theme-button-secondary theme-soft-hover-accent rounded p-1.5 transition-shadow shadow-sm active:shadow-none"
                title={t('promptManager.editor.versionHistory')}
                data-testid="version-history-button"
            >
                <History size={14} />
            </button>
            <button
                onClick={() => setShowValidationPanel(!showValidationPanel)}
                className={`rounded p-1.5 transition-shadow shadow-sm active:shadow-none ${
                  showValidationPanel
                    ? 'theme-button-success'
                    : 'theme-button-secondary'
                }`}
                title={t('promptManager.editor.validatePrompt')}
                data-testid="validation-toggle-button"
            >
                <Shield size={14} />
            </button>
            <button 
                onClick={handleRun}
                className="theme-button-success rounded p-1.5 transition-shadow shadow-sm active:shadow-none"
                title={t('promptManager.editor.launchAgent')}
            >
                <Play size={14} fill="currentColor" />
            </button>
            {!isReadOnly && (
                <button 
                    onClick={handleSave}
                    className="theme-button-primary flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-bold shadow-sm transition-all active:shadow-none"
                >
                    <Save size={14} />
                    {isBuiltin ? t('promptManager.editor.createOverride') : t('promptManager.editor.save')}
                </button>
            )}
        </div>
      </div>

      <div className="theme-panel-muted relative flex flex-1 flex-col overflow-hidden">
          {activeTab === 'edit' ? (
              <div className="h-full">
                  <PromptMonacoEditor
                    value={content}
                    onChange={setContent}
                    readOnly={isReadOnly}
                    variables={selectedPrompt?.metadata?.variables || []}
                    height="100%"
                  />
              </div>
          ) : (
              <div className="theme-panel flex h-full flex-col">
                  <div className="theme-panel-muted theme-border flex items-center gap-4 overflow-x-auto border-b p-3 custom-scrollbar">
                      <div className="theme-text-subtle mr-2 text-[10px] font-bold uppercase tracking-widest">{t('promptManager.editor.variables')}</div>
                      {Object.entries(testVariables).map(([key, val]) => (
                          <div key={key} className="theme-panel theme-border flex min-w-[120px] items-center gap-2 rounded border px-2 py-1 shadow-sm">
                              <label className="theme-text-accent whitespace-nowrap text-[10px] font-mono">{key}</label>
                              <input 
                                className="theme-text w-full bg-transparent border-none p-0 text-[10px] outline-none"
                                value={val}
                                onChange={e => setTestVariables({...testVariables, [key]: e.target.value})}
                              />
                          </div>
                      ))}
                  </div>
                  <pre className="theme-code-surface flex-1 overflow-auto whitespace-pre-wrap p-8 font-mono text-sm leading-relaxed selection:bg-[var(--accent-soft-bg)]">
                      {preview || <span className="theme-text-subtle italic">{t('promptManager.editor.noPreview')}</span>}
                  </pre>
              </div>
          )}
      </div>

      {/* 版本历史 */}
      {showVersionHistory && selectedPrompt?.path && (
        <div className="theme-panel absolute inset-0 z-10">
          <VersionHistory
            promptPath={selectedPrompt.path}
            onCompare={handleVersionCompare}
            onRollback={handleVersionRollback}
          />
        </div>
      )}

      {/* 版本对比 */}
      {diffVersions && selectedPrompt?.path && (
        <VersionDiffViewer
          promptPath={selectedPrompt.path}
          oldVersion={diffVersions.old}
          newVersion={diffVersions.new}
          onClose={() => setDiffVersions(null)}
        />
      )}

      {/* 验证面板 */}
      {showValidationPanel && (
        <div className="absolute bottom-0 left-0 right-0 z-10">
          <ValidationPanel
            content={content}
            isVisible={showValidationPanel}
            onClose={() => setShowValidationPanel(false)}
            onValidationComplete={handleValidationComplete}
          />
        </div>
      )}

      {/* 覆盖确认对话框 */}
      {showOverrideDialog && selectedPrompt && (
        <OverrideConfirmDialog
          isOpen={showOverrideDialog}
          accessTier={selectedPrompt.metadata.access_tier || AccessTier.Public}
          promptName={selectedPrompt.metadata.name || t('promptManager.list.untitledPrompt')}
          overrideFileName={overrideFileName}
          onConfirm={handleOverrideConfirm}
          onCancel={handleOverrideCancel}
        />
      )}
    </div>
  );
};
