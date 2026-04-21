import React, { useState, useRef } from 'react';
import { useShortcutStore } from '../../stores/shortcutStore';
import { useTranslation } from 'react-i18next';
import { Search, RotateCcw, Download, Upload } from 'lucide-react';
import { formatKeybinding } from '../../utils/keyboard';
import { toast } from 'sonner';
import clsx from 'clsx';
import { save } from '@tauri-apps/plugin-dialog';
import { writeTextFile } from '@tauri-apps/plugin-fs';

export const KeyboardShortcuts = () => {
  const { keybindings, updateShortcut, resetShortcuts, hasConflict, activeScheme, setScheme, importKeybindings, exportKeybindings } = useShortcutStore();
  const { t } = useTranslation();
  const [filter, setFilter] = useState('');
  const [recordingId, setRecordingId] = useState<string | null>(null);
  const [currentConflictId, setCurrentConflictId] = useState<string | undefined>(undefined);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const getDisplayParts = (keys: string) => formatKeybinding(keys).split('+');

  const filteredBindings = keybindings.filter(kb => 
    kb.label.toLowerCase().includes(filter.toLowerCase()) || 
    kb.keys.toLowerCase().includes(filter.toLowerCase()) ||
    formatKeybinding(kb.keys).toLowerCase().includes(filter.toLowerCase())
  );

  const handleRecord = (id: string) => {
    setRecordingId(id);
    setCurrentConflictId(undefined); // Clear conflict when starting to record
  };

  const handleKeyDown = (e: React.KeyboardEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation();

    // Ignore modifier-only keydowns
    if (['Meta', 'Control', 'Alt', 'Shift'].includes(e.key)) return;

    const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
    const parts = [];
    
    if (isMac) {
        if (e.metaKey) parts.push('Mod');
        if (e.ctrlKey) parts.push('Ctrl');
        if (e.altKey) parts.push('Alt');
        if (e.shiftKey) parts.push('Shift');
    } else {
        if (e.ctrlKey) parts.push('Mod');
        if (e.altKey) parts.push('Alt');
        if (e.shiftKey) parts.push('Shift');
    }

    parts.push(e.key.toLowerCase());
    
    const newKeys = parts.join('+');
    
    const result = updateShortcut(id, newKeys);
    if (result === true) {
        toast.success(t('shortcuts.updatedSuccessfully'));
        setCurrentConflictId(undefined);
        setRecordingId(null);
    } else if (typeof result === 'string') {
        const conflictingKb = keybindings.find(kb => kb.id === result);
        if (conflictingKb) {
            toast.error(t('shortcuts.conflict', { keys: formatKeybinding(newKeys), command: conflictingKb.label }));
        }
        setCurrentConflictId(result);
        // Do NOT close the recording input on conflict, let user retry
    }
  };

  const handleReset = () => {
    resetShortcuts();
    toast.success(t('shortcuts.resetDefaults'));
    setCurrentConflictId(undefined);
  };

  const handleSchemeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newScheme = e.target.value as 'ifai' | 'vscode' | 'intellij';
    setScheme(newScheme);
    toast.success(t('shortcuts.schemeChanged', { scheme: t(`shortcuts.${newScheme}Scheme`) }));
    setRecordingId(null); // Stop any active recording
    setFilter(''); // Clear filter
  };

  const handleExport = async () => {
    try {
        const data = exportKeybindings();
        const path = await save({
            filters: [{
                name: 'JSON',
                extensions: ['json']
            }],
            defaultPath: 'keybindings.json'
        });

        if (path) {
            await writeTextFile(path, JSON.stringify(data, null, 2));
            toast.success(t('shortcuts.exportSuccess'));
        }
    } catch (e) {
        console.error('Export failed:', e);
        toast.error(t('shortcuts.exportError'));
    }
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
        try {
            const json = JSON.parse(event.target?.result as string);
            const success = importKeybindings(json);
            if (success) {
                toast.success(t('shortcuts.importSuccess'));
            } else {
                toast.error(t('shortcuts.importError'));
            }
        } catch (error) {
            console.error(error);
            toast.error(t('shortcuts.importError'));
        }
        // Reset input
        if (fileInputRef.current) fileInputRef.current.value = '';
    };
    reader.readAsText(file);
  };

  return (
    <div className="theme-panel theme-text flex h-full flex-col p-6">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-xl font-semibold">{t('shortcuts.keyboardShortcuts')}</h2>
        <div className="flex items-center space-x-2">
          <select
            value={activeScheme}
            onChange={handleSchemeChange}
            className="theme-input-surface theme-border theme-text rounded px-2 py-1 text-sm focus:border-[var(--accent-color)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-soft-bg)]"
          >
            <option value="ifai">{t('shortcuts.ifaiScheme')}</option>
            <option value="vscode">{t('shortcuts.vscodeScheme')}</option>
            <option value="intellij">{t('shortcuts.intellijScheme')}</option>
          </select>
          <button 
              onClick={handleImportClick}
              className="theme-hoverable theme-text-subtle flex items-center gap-2 rounded p-2 text-sm"
              title={t('shortcuts.import')}
          >
              <Upload size={16} />
          </button>
          <input 
              type="file" 
              ref={fileInputRef} 
              onChange={handleImportFile} 
              accept=".json" 
              className="hidden" 
          />
          <button 
              onClick={handleExport}
              className="theme-hoverable theme-text-subtle flex items-center gap-2 rounded p-2 text-sm"
              title={t('shortcuts.export')}
          >
              <Download size={16} />
          </button>
          <button 
              onClick={handleReset}
              className="theme-hoverable theme-text-subtle flex items-center gap-2 rounded p-2 text-sm"
              title={t('shortcuts.resetDefaults')}
          >
              <RotateCcw size={16} />
          </button>
        </div>
      </div>

      <div className="relative mb-4">
        <Search className="theme-text-subtle absolute left-3 top-1/2 -translate-y-1/2 transform" size={16} />
        <input 
            type="text" 
            placeholder={t('shortcuts.searchKeybindings')}
            className="theme-input-surface theme-border theme-text w-full rounded py-2 pl-10 pr-4 text-sm focus:border-[var(--accent-color)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-soft-bg)]"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
        />
      </div>

      <div className="flex-1 overflow-y-auto">
        <table className="w-full text-left text-sm">
            <thead className="theme-panel-muted theme-text-subtle sticky top-0">
                <tr>
                    <th className="p-3 font-medium">{t('shortcuts.command')}</th>
                    <th className="p-3 font-medium">{t('shortcuts.keybinding')}</th>
                    <th className="p-3 font-medium">{t('shortcuts.source')}</th>
                </tr>
            </thead>
            <tbody className="theme-border divide-y">
                {filteredBindings.map(kb => (
                    <tr key={kb.id} className="group theme-hoverable">
                        <td className="p-3">
                            <div className="font-medium">{kb.label}</div>
                            <div className="theme-text-subtle text-xs">{kb.commandId}</div>
                        </td>
                        <td className="p-3">
                            {recordingId === kb.id ? (
                                <div className="flex flex-col w-full">
                                    <input 
                                        autoFocus
                                        className={clsx(
                                            'theme-input-surface theme-text w-full rounded border px-2 py-1 outline-none',
                                            currentConflictId ? 'border-[var(--danger-soft-border)]' : 'theme-border focus:border-[var(--accent-color)] focus:ring-2 focus:ring-[var(--accent-soft-bg)]'
                                        )}
                                        placeholder={t('shortcuts.pressKeys')}
                                        onKeyDown={(e) => handleKeyDown(e, kb.id)}
                                        onBlur={() => { setRecordingId(null); setCurrentConflictId(undefined); }}
                                    />
                                    {currentConflictId && (
                                        <div className="mt-1 text-xs animate-pulse text-[var(--danger-color)]">
                                            {(() => {
                                                const conflictCmd = keybindings.find(k => k.id === currentConflictId);
                                                return t('shortcuts.conflict', { 
                                                    keys: conflictCmd ? formatKeybinding(conflictCmd.keys) : '', 
                                                    command: conflictCmd?.label 
                                                });
                                            })()}
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <div 
                                    className={clsx(
                                        "inline-flex items-center gap-1 cursor-pointer rounded px-2 py-1 border transition-colors",
                                        hasConflict(kb.keys, kb.id) ? "border-[var(--danger-soft-border)]" : "theme-border theme-hoverable"
                                    )}
                                    onClick={() => handleRecord(kb.id)}
                                    title={t('shortcuts.clickToEdit')}
                                >
                                    {getDisplayParts(kb.keys).map((part, i) => (
                                        <span key={i} className="theme-input-surface theme-border min-w-[20px] rounded border px-1.5 text-center font-mono text-xs">
                                            {part}
                                        </span>
                                    ))}
                                    <span className="theme-text-subtle ml-2 text-xs opacity-0 group-hover:opacity-100">✎</span>
                                </div>
                            )}
                        </td>
                        <td className="theme-text-subtle p-3">
                            {kb.category || t('shortcuts.user')}
                        </td>
                    </tr>
                ))}
            </tbody>
        </table>
      </div>
    </div>
  );
};
