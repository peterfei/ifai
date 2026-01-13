import React from 'react';
import { useTranslation } from 'react-i18next';
import { useFileStore } from '../../stores/fileStore';
import { useLayoutStore } from '../../stores/layoutStore';
import { FilePlus, FolderOpen, MessageSquare } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { openDirectory, readFileContent } from '../../utils/fileSystem';
import { open } from '@tauri-apps/plugin-dialog';
import ifaiLogo from '../../../imgs/ifai.png';

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
                const content = await readFileContent(selected);
                const newFileId = uuidv4();
                openFile({
                    id: newFileId,
                    path: selected,
                    name: selected.split('/').pop() || 'Untitled',
                    content: content,
                    isDirty: false,
                    language: 'plaintext', // Simplification, ideally detect language
                });
                if (activePaneId) {
                    assignFileToPane(activePaneId, newFileId);
                }
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
        <div className="flex flex-col items-center justify-center h-full text-gray-400 bg-[#1e1e1e] select-none">
            <div className="mb-8 flex flex-col items-center">
                <img src={ifaiLogo} alt="IfAI Logo" className="w-24 h-24 mb-4 opacity-80" />
                <div className="text-2xl font-light text-gray-300">{t('editor.welcome')}</div>
            </div>

            <div className="flex flex-col space-y-2 w-64">
                <button onClick={handleNewFile} className="flex items-center text-left text-sm hover:text-blue-400 group transition-colors">
                    <FilePlus size={18} className="mr-3 text-gray-500 group-hover:text-blue-400" />
                    {t('common.newFile') || 'New File'}
                </button>
                <button onClick={handleOpenFile} className="flex items-center text-left text-sm hover:text-blue-400 group transition-colors">
                    <FolderOpen size={18} className="mr-3 text-gray-500 group-hover:text-blue-400" />
                    {t('common.openFile') || 'Open File...'}
                </button>
                <button onClick={handleOpenFolder} className="flex items-center text-left text-sm hover:text-blue-400 group transition-colors">
                    <FolderOpen size={18} className="mr-3 text-gray-500 group-hover:text-blue-400" />
                    {t('common.openFolder') || 'Open Folder...'}
                </button>
                <button onClick={toggleChat} className="flex items-center text-left text-sm hover:text-blue-400 group transition-colors">
                    <MessageSquare size={18} className="mr-3 text-gray-500 group-hover:text-blue-400" />
                    {t('common.toggleChat') || 'Toggle AI Chat'}
                </button>
            </div>

            <div className="mt-8 text-xs text-gray-600">
                <div className="grid grid-cols-2 gap-x-8 gap-y-2 max-w-md">
                    <span>{t('editor.shortcuts.showCommands')}</span> <span>Cmd+Shift+P</span>
                    <span>{t('editor.shortcuts.goToFile')}</span> <span>Cmd+P</span>
                    <span>{t('editor.shortcuts.findInFiles')}</span> <span>Cmd+Shift+F</span>
                    <span>{t('editor.shortcuts.toggleChat')}</span> <span>Cmd+L</span>
                    <span>{t('editor.shortcuts.inlineEdit')}</span> <span>Cmd+K</span>
                </div>
            </div>
        </div>
    );
};
