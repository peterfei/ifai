import React, { useState, useEffect, useRef } from 'react';
import { useEditorStore } from '../../stores/editorStore';
import { useChatStore } from '../../stores/useChatStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { Sparkles, X, Loader2 } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { v4 as uuidv4 } from 'uuid';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';

export const InlineEditWidget = () => {
  const { t } = useTranslation();
  const { editorInstance, inlineEdit, closeInlineEdit } = useEditorStore();
  const { providers, currentProviderId } = useSettingsStore();
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const [style, setStyle] = useState<React.CSSProperties>({ display: 'none' });

  useEffect(() => {
    if (inlineEdit.isVisible && editorInstance && inlineEdit.position) {
      const coords = editorInstance.getScrolledVisiblePosition(inlineEdit.position);
      if (coords) {
        setStyle({
          display: 'flex',
          top: coords.top + 30, // Position below the cursor line
          left: coords.left + 50, // Slight offset
        });
        setTimeout(() => inputRef.current?.focus(), 50);
      }
    } else {
      setStyle({ display: 'none' });
      setInput('');
    }
  }, [inlineEdit.isVisible, inlineEdit.position, editorInstance]);

  const handleSubmit = async () => {
    if (!input.trim()) return;
    
    const currentProvider = providers.find(p => p.id === currentProviderId);
    if (!currentProvider || !currentProvider.apiKey || !currentProvider.enabled) {
        toast.error(t('chat.errorNoKey'));
        return;
    }

    if (!editorInstance || !inlineEdit.selection) return;
    
    setIsLoading(true);
    const selection = inlineEdit.selection;
    const model = editorInstance.getModel();
    if (!model) return;

    const originalCode = model.getValueInRange(selection);
    
    // Construct Prompt
    const prompt = `You are a coding assistant. Rewrite the following code based on the user's instruction.
IMPORTANT: Output ONLY the code. Do NOT wrap in markdown blocks. Do NOT add explanations.

Code:
${originalCode}

Instruction:
${input}`;

    const eventId = `inline_edit_${uuidv4()}`;
    let generatedCode = '';

    try {
        const unlistenData = await listen<string>(eventId, (event) => {
            generatedCode += event.payload;
        });

        const cleanup = () => {
            setIsLoading(false);
            unlistenData();
            unlistenError();
            unlistenFinish();
            closeInlineEdit();
        };

        const unlistenError = await listen<string>(`${eventId}_error`, (event) => {
            console.error('Inline Edit Error:', event.payload);
            toast.error(`AI Error: ${event.payload}`);
            cleanup();
        });

        const unlistenFinish = await listen<string>(`${eventId}_finish`, () => {
            // Apply edit
            if (generatedCode) {
                // Ensure we replace the correct range
                editorInstance.executeEdits('inline-ai', [{
                    range: selection,
                    text: generatedCode,
                    forceMoveMarkers: true
                }]);
                
                // Trigger format selection to fix indentation
                setTimeout(() => {
                    editorInstance.setSelection(selection); // Ensure selection matches replaced range
                    editorInstance.getAction('editor.action.formatSelection')?.run();
                }, 100);

                toast.success(t('editor.inlineWidget.success'));
            }
            cleanup();
        });

        const history = [{ role: 'user', content: prompt }];
        await invoke('ai_chat', { 
            providerConfig: currentProvider, 
            messages: history, 
            eventId 
        });

    } catch (e) {
        console.error(e);
        toast.error(t('editor.inlineWidget.error') + `: ${String(e)}`);
        setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
        handleSubmit();
    } else if (e.key === 'Escape') {
        closeInlineEdit();
    }
  };

  if (!inlineEdit.isVisible) return null;

  return (
    <div 
        className="absolute z-50 bg-[#252526] border border-gray-600 rounded-lg shadow-2xl p-2 w-[400px] flex items-center gap-2"
        style={style}
    >
        <div className="text-blue-400 flex items-center justify-center w-5 h-5">
            {isLoading ? <Loader2 size={18} className="animate-spin" /> : <Sparkles size={16} />}
        </div>
        <input
            ref={inputRef}
            type="text"
            className="flex-1 bg-transparent border-none outline-none text-white text-sm placeholder-gray-500"
            placeholder={t('editor.inlineWidget.placeholder')}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isLoading}
        />
        {isLoading ? null : (
            <button onClick={closeInlineEdit} className="text-gray-400 hover:text-white">
                <X size={14} />
            </button>
        )}
    </div>
  );
};
