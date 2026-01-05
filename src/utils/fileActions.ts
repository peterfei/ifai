import { v4 as uuidv4 } from 'uuid';
import { readFileContent } from './fileSystem';
import { useFileStore } from '../stores/fileStore';
import { useLayoutStore } from '../stores/layoutStore';
import { toast } from 'sonner';

/**
 * 根据文件扩展名获取语言类型
 */
function getLanguageFromPath(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase();

  const languageMap: Record<string, string> = {
    // Markdown
    'md': 'markdown',
    'markdown': 'markdown',

    // JavaScript/TypeScript
    'js': 'javascript',
    'jsx': 'javascript',
    'ts': 'typescript',
    'tsx': 'typescript',

    // Rust
    'rs': 'rust',

    // Python
    'py': 'python',

    // Shell
    'sh': 'shell',
    'bash': 'shell',

    // Config files
    'json': 'json',
    'yaml': 'yaml',
    'yml': 'yaml',
    'toml': 'toml',
    'xml': 'xml',

    // Styles
    'css': 'css',
    'scss': 'scss',
    'less': 'less',

    // Web
    'html': 'html',
    'htm': 'html',

    // Other common
    'txt': 'plaintext',
    'text': 'plaintext',
  };

  return languageMap[ext || ''] || 'plaintext';
}

export const openFileFromPath = async (path: string) => {
    try {
      const content = await readFileContent(path);
      const { openFile } = useFileStore.getState();

      // 根据文件扩展名自动识别语言
      const language = getLanguageFromPath(path);

      const openedFileId = openFile({
        id: uuidv4(),
        path: path,
        name: path.split('/').pop() || 'Untitled',
        content: content,
        isDirty: false,
        language: language,
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
