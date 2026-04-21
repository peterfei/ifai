import React from 'react';
import { useTranslation } from 'react-i18next';
import { useFileStore } from '../../stores/fileStore';
import { useLayoutStore } from '../../stores/layoutStore';
import { FilePlus, FolderOpen, MessageSquare } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { openDirectory } from '../../utils/fileSystem';
import { openFileFromPath } from '../../utils/fileActions';
import { open } from '@tauri-apps/plugin-dialog';
import ifaiLogo from '../../../imgs/ifai.png';
import { formatKeybinding } from '../../utils/keyboard';

export const WelcomeScreen: React.FC = () => {
    const { t } = useTranslation();
    const { openFile, setFileTree } = useFileStore();
    const { toggleChat, assignFileToPane, activePaneId } = useLayoutStore();

    const handleNewFile = () => {
        const newFileId = uuidv4();
        openFile({
            id: newFileId,
            name: 'Untitled',
            path: '',
            content: '',
            isDirty: true,
            language: 'plaintext',
        });
        if (activePaneId) {
            assignFileToPane(activePaneId, newFileId);
        }
    };

    const handleOpenFile = async () => {
        try {
            const selected = await open({
                multiple: false,
            });
            if (selected && typeof selected === 'string') {
                await openFileFromPath(selected, {
                    id: uuidv4(),
                    name: selected.split('/').pop() || 'Untitled',
                });
            }
        } catch (e) {
            console.error(e);
        }
    };

    const handleOpenFolder = async () => {
        const tree = await openDirectory();
        if (tree) setFileTree(tree);
    };

    return (
        <div className="theme-panel theme-text-subtle flex h-full select-none flex-col items-center justify-center transition-colors" data-testid="welcome-screen">
            <div className="mb-8 flex flex-col items-center">
                <img src={ifaiLogo} alt="IfAI Logo" className="w-24 h-24 mb-4 opacity-80" />
                <div className="theme-text text-2xl font-light">{t('editor.welcome')}</div>
            </div>

            <div className="flex flex-col space-y-2 w-64">
                <button onClick={handleNewFile} className="theme-button-ghost flex items-center rounded px-2 py-1 text-left text-sm group transition-colors">
                    <FilePlus size={18} className="theme-text-subtle mr-3 transition-colors group-hover:text-[var(--accent-color)]" />
                    {t('common.newFile') || 'New File'}
                </button>
                <button onClick={handleOpenFile} className="theme-button-ghost flex items-center rounded px-2 py-1 text-left text-sm group transition-colors">
                    <FolderOpen size={18} className="theme-text-subtle mr-3 transition-colors group-hover:text-[var(--accent-color)]" />
                    {t('common.openFile') || 'Open File...'}
                </button>
                <button onClick={handleOpenFolder} className="theme-button-ghost flex items-center rounded px-2 py-1 text-left text-sm group transition-colors">
                    <FolderOpen size={18} className="theme-text-subtle mr-3 transition-colors group-hover:text-[var(--accent-color)]" />
                    {t('common.openFolder') || 'Open Folder...'}
                </button>
                <button onClick={toggleChat} className="theme-button-ghost flex items-center rounded px-2 py-1 text-left text-sm group transition-colors">
                    <MessageSquare size={18} className="theme-text-subtle mr-3 transition-colors group-hover:text-[var(--accent-color)]" />
                    {t('common.toggleChat') || 'Toggle AI Chat'}
                </button>
            </div>

            <div className="theme-text-subtle mt-8 text-xs">
                <div className="grid grid-cols-2 gap-x-8 gap-y-2 max-w-md">
                    <span>{t('editor.shortcuts.showCommands')}</span> <span>{formatKeybinding('Mod+Shift+p')}</span>
                    <span>{t('editor.shortcuts.goToFile')}</span> <span>{formatKeybinding('Mod+p')}</span>
                    <span>{t('editor.shortcuts.findInFiles')}</span> <span>{formatKeybinding('Mod+Shift+f')}</span>
                    <span>{t('editor.shortcuts.toggleChat')}</span> <span>{formatKeybinding('Mod+l')}</span>
                    <span>{t('editor.shortcuts.inlineEdit')}</span> <span>{formatKeybinding('Mod+k')}</span>
                </div>
            </div>
        </div>
    );
};
