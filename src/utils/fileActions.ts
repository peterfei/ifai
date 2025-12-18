import { v4 as uuidv4 } from 'uuid';
import { readFileContent } from './fileSystem';
import { useFileStore } from '../stores/fileStore';
import { useLayoutStore } from '../stores/layoutStore';
import { toast } from 'sonner';

export const openFileFromPath = async (path: string) => {
    try {
      const content = await readFileContent(path);
      const { openFile } = useFileStore.getState();
      
      const openedFileId = openFile({
        id: uuidv4(),
        path: path,
        name: path.split('/').pop() || 'Untitled',
        content: content,
        isDirty: false,
        language: 'plaintext', 
        initialLine: 1 
      });
      
      const { activePaneId, assignFileToPane } = useLayoutStore.getState();
      if (activePaneId) {
          assignFileToPane(activePaneId, openedFileId);
      }
      return true;
    } catch (e) {
      console.error('Failed to open file from path:', e);
      toast.error('Failed to open file');
      return false;
    }
  };
