import React, { useState, useEffect, useCallback } from 'react';
import { usePromptStore } from '../../stores/promptStore';
import { useAgentStore } from '../../stores/agentStore';
import { Play, X, Save, AlertTriangle, Lock } from 'lucide-react';
import { toast } from 'sonner';
import { checkFeature, IS_COMMERCIAL } from '../../config/edition';

export const PromptEditor: React.FC = () => {
  const canEdit = checkFeature('promptEditing');
  const { selectedPrompt, updatePrompt, renderTemplate } = usePromptStore();
  const { launchAgent, runningAgents } = useAgentStore();
  const [content, setContent] = useState('');
  const [preview, setPreview] = useState('');
  const [activeTab, setActiveTab] = useState<'edit' | 'preview'>('edit');
  
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
    try {
      await updatePrompt(selectedPrompt.path, content);
      if (isBuiltin) {
        toast.success('Project-specific override created', {
          description: 'This prompt will now be used for the current project.'
        });
      } else {
        toast.success('Prompt saved successfully');
      }
    } catch (e) {
      toast.error('Failed to save prompt', {
        description: String(e)
      });
    }
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

  if (!selectedPrompt) {
    return (
        <div className="flex-1 flex flex-col items-center justify-center text-gray-400 bg-gray-50 dark:bg-gray-800/20">
            <div className="text-4xl mb-4 opacity-10">Select a prompt</div>
            <p className="text-sm">Click a prompt on the left to start editing</p>
        </div>
    );
  }

  // Double check structure
  if (!selectedPrompt.metadata) {
      return (
          <div className="flex-1 flex flex-col items-center justify-center text-red-500 bg-red-50 dark:bg-red-900/10 p-4">
              <AlertTriangle size={32} className="mb-4" />
              <p className="font-bold">Invalid Prompt Data</p>
              <p className="text-xs mt-2 opacity-70">Metadata field is missing in the backend response.</p>
          </div>
      );
  }

  const isBuiltin = selectedPrompt.path?.startsWith('builtin://') || false;
  const isReadOnly = !canEdit || (selectedPrompt.metadata.access_tier !== 'public' && !isBuiltin);

  return (
    <div className="flex-1 flex flex-col h-full bg-white dark:bg-gray-800 shadow-inner">
      {!canEdit && (
          <div className="bg-amber-50 dark:bg-amber-900/20 px-4 py-2 text-xs text-amber-700 dark:text-amber-300 border-b border-amber-100 dark:border-amber-900/50 flex items-center justify-between">
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
          <div className="bg-blue-50 dark:bg-blue-900/20 px-4 py-1.5 text-[10px] text-blue-700 dark:text-blue-300 border-b border-blue-100 dark:border-blue-900/50 flex items-center gap-2">
              <span className="bg-blue-500 text-white px-1 rounded-sm font-bold">INFO</span>
              This is a built-in system prompt. Saving will create a project-specific override.
          </div>
      )}
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-900/20">
        <div className="flex space-x-1">
            <button 
                className={`px-4 py-1.5 text-xs font-semibold rounded-t-md transition-all ${activeTab === 'edit' ? 'bg-white dark:bg-gray-800 text-blue-600 border-x border-t border-gray-200 dark:border-gray-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                onClick={() => setActiveTab('edit')}
            >
                Editor
            </button>
            <button 
                className={`px-4 py-1.5 text-xs font-semibold rounded-t-md transition-all ${activeTab === 'preview' ? 'bg-white dark:bg-gray-800 text-blue-600 border-x border-t border-gray-200 dark:border-gray-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                onClick={() => setActiveTab('preview')}
            >
                Preview
            </button>
        </div>
        <div className="flex items-center space-x-2">
            {isReadOnly && (
                <span className="text-[10px] text-yellow-600 dark:text-yellow-500 font-mono bg-yellow-50 dark:bg-yellow-900/20 px-2 py-1 rounded">
                    READ-ONLY
                </span>
            )}
            <button 
                onClick={handleRun}
                className="p-1.5 bg-green-600 text-white rounded hover:bg-green-700 transition-shadow shadow-sm active:shadow-none"
                title="Launch Agent"
            >
                <Play size={14} fill="currentColor" />
            </button>
            {!isReadOnly && (
                <button 
                    onClick={handleSave}
                    className="px-3 py-1.5 bg-blue-600 text-white text-xs font-bold rounded hover:bg-blue-700 transition-all flex items-center gap-1.5 shadow-sm active:shadow-none"
                >
                    <Save size={14} />
                    {isBuiltin ? '创建覆盖' : '保存'}
                </button>
            )}
        </div>
      </div>

      <div className="flex-1 overflow-hidden relative flex flex-col bg-gray-50 dark:bg-gray-900/40">
          {activeTab === 'edit' ? (
              <textarea
                className="flex-1 p-6 font-mono text-sm bg-white dark:bg-[#1e1e1e] text-gray-800 dark:text-gray-300 resize-none outline-none custom-scrollbar leading-relaxed"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                readOnly={isReadOnly}
                spellCheck={false}
                placeholder="---
name: My Agent
---

Write your prompt here..."
              />
          ) : (
              <div className="flex flex-col h-full bg-white dark:bg-[#1e1e1e]">
                  <div className="p-3 bg-gray-100/50 dark:bg-gray-800/50 border-b border-gray-200 dark:border-gray-700 flex gap-4 overflow-x-auto custom-scrollbar items-center">
                      <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mr-2">Variables</div>
                      {Object.entries(testVariables).map(([key, val]) => (
                          <div key={key} className="flex items-center gap-2 bg-white dark:bg-gray-900 px-2 py-1 rounded border border-gray-200 dark:border-gray-700 shadow-sm min-w-[120px]">
                              <label className="text-[10px] font-mono text-blue-500 whitespace-nowrap">{key}</label>
                              <input 
                                className="bg-transparent border-none p-0 text-[10px] dark:text-white outline-none w-full"
                                value={val}
                                onChange={e => setTestVariables({...testVariables, [key]: e.target.value})}
                              />
                          </div>
                      ))}
                  </div>
                  <pre className="flex-1 p-8 overflow-auto whitespace-pre-wrap font-mono text-sm text-gray-800 dark:text-gray-300 leading-relaxed selection:bg-blue-100 dark:selection:bg-blue-900/40">
                      {preview || <span className="text-gray-400 italic">No preview available. Try typing something above.</span>}
                  </pre>
              </div>
          )}
      </div>
    </div>
  );
};