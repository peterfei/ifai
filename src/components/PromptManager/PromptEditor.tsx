import React, { useState, useEffect, useCallback } from 'react';
import { usePromptStore } from '../../stores/promptStore';
import { useAgentStore } from '../../stores/agentStore';
import { Play, X, Save, AlertTriangle, Lock, History, CheckCircle, Shield } from 'lucide-react';
import { toast } from 'sonner';
import { checkFeature, IS_COMMERCIAL } from '../../config/edition';
import { VersionHistory } from './VersionHistory';
import { VersionDiffViewer } from './VersionDiffViewer';
import { OverrideConfirmDialog } from './OverrideConfirmDialog';
import { PromptMonacoEditor } from './PromptMonacoEditor';
import { ValidationPanel } from './ValidationPanel';
import { AccessTier } from '../../types/prompt';

export const PromptEditor: React.FC = () => {
  const canEdit = checkFeature('promptEditing');
  const { selectedPrompt, updatePrompt, renderTemplate } = usePromptStore();
  const { launchAgent, runningAgents } = useAgentStore();
  const [content, setContent] = useState('');
  const [preview, setPreview] = useState('');
  const [activeTab, setActiveTab] = useState<'edit' | 'preview'>('edit');
  const [showVersionHistory, setShowVersionHistory] = useState(false);
  const [diffVersions, setDiffVersions] = useState<{ old: string; new: string } | null>(null);
  const [showOverrideDialog, setShowOverrideDialog] = useState(false);
  const [showValidationPanel, setShowValidationPanel] = useState(false);
  
  // Dummy variables for preview
  const [testVariables, setTestVariables] = useState<Record<string, string>>({
      "USER_NAME": "Developer",
      "TARGET_LANGUAGE": "Rust",
      "PROJECT_NAME": "IfAI Project",
      "CWD": "/home/project"
  });

  useEffect(() => {
    if (selectedPrompt) {
      setContent(selectedPrompt.raw_text || selectedPrompt.content || "");
      
      // Update test variables based on metadata
      if (selectedPrompt.metadata?.variables) {
          const newVars = { ...testVariables };
          selectedPrompt.metadata.variables.forEach(v => {
              if (!newVars[v]) newVars[v] = "TEST_VALUE";
          });
          setTestVariables(newVars);
      }
    }
  }, [selectedPrompt]);

  const handleRender = async () => {
      try {
        const result = await renderTemplate(content, testVariables);
        setPreview(result);
      } catch (e) {
          setPreview(`Render failed: ${e}`);
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
      toast.success('Prompt saved successfully');
    } catch (e) {
      toast.error('Failed to save prompt', {
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
        toast.success('Project-specific override created', {
          description: 'This prompt will now be used for the current project.'
        });
      } else {
        toast.success('Override file created successfully', {
          description: `${selectedPrompt.metadata.name}.override.md has been created.`
        });
      }
    } catch (e) {
      toast.error('Failed to save prompt', {
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
          await launchAgent(selectedPrompt.metadata.name, "Test task triggered from Prompt Manager");
          toast.info(`Agent '${selectedPrompt.metadata.name}' started`);
      } catch (e) {
          toast.error('Launch failed', {
            description: String(e)
          });
      }
  };

  const handleVersionCompare = (oldVersion: string, newVersion: string) => {
    setDiffVersions({ old: oldVersion, new: newVersion });
  };

  const handleVersionRollback = async (versionId: string) => {
    toast.success(`已回滚到版本 ${versionId.substring(0, 7)}`);
    setShowVersionHistory(false);
  };

  const handleValidationComplete = (result: any) => {
    if (result.is_valid) {
      // 可以在编辑器上显示一个验证通过的指示器
      console.log('[PromptEditor] Validation passed');
    } else {
      console.log('[PromptEditor] Validation failed:', result.errors.length, 'errors');
    }
  };

  if (!selectedPrompt) {
    return (
        <div className="theme-panel theme-text-subtle flex flex-1 flex-col items-center justify-center">
            <div className="mb-4 text-4xl opacity-10">Select a prompt</div>
            <p className="text-sm">Click a prompt on the left to start editing</p>
        </div>
    );
  }

  // Double check structure
  if (!selectedPrompt.metadata) {
      return (
          <div className="flex flex-1 flex-col items-center justify-center bg-red-500/10 p-4 text-red-500">
              <AlertTriangle size={32} className="mb-4" />
              <p className="font-bold">Invalid Prompt Data</p>
              <p className="text-xs mt-2 opacity-70">Metadata field is missing in the backend response.</p>
          </div>
      );
  }

  const isBuiltin = selectedPrompt.path?.startsWith('builtin://') || false;
  const isReadOnly = !canEdit || (selectedPrompt.metadata.access_tier !== 'public' && !isBuiltin);

  return (
    <div className="theme-panel flex-1 flex flex-col h-full shadow-inner">
      {!canEdit && (
          <div className="flex items-center justify-between border-b border-amber-500/20 bg-amber-500/10 px-4 py-2 text-xs text-amber-600">
              <div className="flex items-center gap-2">
                  <Lock size={12} />
                  <span>提示词编辑功能仅在<b>商业版</b>中可用</span>
              </div>
              <button 
                onClick={() => window.open('https://ifai.dev/pricing')}
                className="bg-amber-600 hover:bg-amber-700 text-white px-2 py-0.5 rounded text-[10px] font-bold transition-colors"
              >
                了解更多
              </button>
          </div>
      )}
      {canEdit && isBuiltin && (
          <div className="flex items-center gap-2 border-b border-blue-500/20 bg-blue-500/10 px-4 py-1.5 text-[10px] text-blue-500">
              <span className="bg-blue-500 text-white px-1 rounded-sm font-bold">INFO</span>
              This is a built-in system prompt. Saving will create a project-specific override.
          </div>
      )}
      <div className="theme-panel-muted theme-border flex items-center justify-between border-b px-4 py-2">
        <div className="flex space-x-1">
            <button 
                className={`rounded-t-md px-4 py-1.5 text-xs font-semibold transition-all ${activeTab === 'edit' ? 'theme-panel theme-border border-x border-t text-blue-500 shadow-sm' : 'theme-text-subtle hover:text-[var(--text-primary)]'}`}
                onClick={() => setActiveTab('edit')}
            >
                Editor
            </button>
            <button 
                className={`rounded-t-md px-4 py-1.5 text-xs font-semibold transition-all ${activeTab === 'preview' ? 'theme-panel theme-border border-x border-t text-blue-500 shadow-sm' : 'theme-text-subtle hover:text-[var(--text-primary)]'}`}
                onClick={() => setActiveTab('preview')}
            >
                Preview
            </button>
        </div>
        <div className="flex items-center space-x-2">
            {isReadOnly && (
                <span className="rounded bg-yellow-500/10 px-2 py-1 font-mono text-[10px] text-yellow-600">
                    READ-ONLY
                </span>
            )}
            <button
                onClick={() => setShowVersionHistory(true)}
                className="theme-button-secondary rounded p-1.5 transition-shadow shadow-sm active:shadow-none hover:text-blue-500"
                title="版本历史"
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
                title="验证提示词"
                data-testid="validation-toggle-button"
            >
                <Shield size={14} />
            </button>
            <button 
                onClick={handleRun}
                className="theme-button-success rounded p-1.5 transition-shadow shadow-sm active:shadow-none"
                title="Launch Agent"
            >
                <Play size={14} fill="currentColor" />
            </button>
            {!isReadOnly && (
                <button 
                    onClick={handleSave}
                    className="theme-button-primary flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-bold shadow-sm transition-all active:shadow-none"
                >
                    <Save size={14} />
                    {isBuiltin ? '创建覆盖' : '保存'}
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
                      <div className="theme-text-subtle mr-2 text-[10px] font-bold uppercase tracking-widest">Variables</div>
                      {Object.entries(testVariables).map(([key, val]) => (
                          <div key={key} className="theme-panel theme-border flex min-w-[120px] items-center gap-2 rounded border px-2 py-1 shadow-sm">
                              <label className="text-[10px] font-mono text-blue-500 whitespace-nowrap">{key}</label>
                              <input 
                                className="theme-text w-full bg-transparent border-none p-0 text-[10px] outline-none"
                                value={val}
                                onChange={e => setTestVariables({...testVariables, [key]: e.target.value})}
                              />
                          </div>
                      ))}
                  </div>
                  <pre className="theme-code-surface flex-1 overflow-auto whitespace-pre-wrap p-8 font-mono text-sm leading-relaxed selection:bg-blue-500/20">
                      {preview || <span className="theme-text-subtle italic">No preview available. Try typing something above.</span>}
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
            onClose={() => setShowVersionHistory(false)}
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
          promptName={selectedPrompt.metadata.name || 'Unknown'}
          onConfirm={handleOverrideConfirm}
          onCancel={handleOverrideCancel}
        />
      )}
    </div>
  );
};
