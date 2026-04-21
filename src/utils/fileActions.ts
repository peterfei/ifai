import { v4 as uuidv4 } from 'uuid';
import {
  assertCanOpenFileAsText,
  getFileName,
  getFileOpenErrorMessage,
  normalizePath,
  readFileContent,
} from './fileSystem';
import { useFileStore } from '../stores/fileStore';
import { useLayoutStore } from '../stores/layoutStore';
import { toast } from 'sonner';
import { detectLanguageFromPath } from './languageDetection';

interface OpenFileFromPathOptions {
  id?: string;
  name?: string;
  initialLine?: number;
  language?: string;
}

export const openFileFromPath = async (path: string, options: OpenFileFromPathOptions = {}) => {
    try {
      const normalizedPath = normalizePath(path);
      const { openFile, openedFiles } = useFileStore.getState();
      const existingFile = openedFiles.find(file => file.path === normalizedPath);
      const content = existingFile?.isDirty
        ? (await assertCanOpenFileAsText(normalizedPath), existingFile.content)
        : await readFileContent(normalizedPath);

      const openedFileId = openFile({
        id: existingFile?.id || options.id || uuidv4(),
        path: normalizedPath,
        name: options.name || getFileName(normalizedPath) || 'Untitled',
        content,
        isDirty: existingFile?.isDirty ?? false,
        language: options.language || existingFile?.language || detectLanguageFromPath(normalizedPath),
        initialLine: options.initialLine ?? 1
      });

      const { activePaneId, assignFileToPane } = useLayoutStore.getState();
      if (activePaneId) {
          assignFileToPane(activePaneId, openedFileId);
      }
      return true;
    } catch (e) {
      console.error('Failed to open file from path:', e);
      toast.error(getFileOpenErrorMessage(e, path));
      return false;
    }
  };
