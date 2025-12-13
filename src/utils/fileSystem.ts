import { readDir, readTextFile, writeTextFile, rename, remove } from '@tauri-apps/plugin-fs';
import { open, save } from '@tauri-apps/plugin-dialog';
import { FileNode } from '../stores/types';
import { v4 as uuidv4 } from 'uuid';

// Helper to sort files: directories first, then files, alphabetically
const sortFiles = (a: FileNode, b: FileNode) => {
  if (a.kind === b.kind) {
    return a.name.localeCompare(b.name);
  }
  return a.kind === 'directory' ? -1 : 1;
};

export const openDirectory = async (): Promise<FileNode | null> => {
  try {
    const selected = await open({
      directory: true,
      multiple: false,
    });

    if (selected && typeof selected === 'string') {
      return await readDirectoryRecursively(selected, selected.split('/').pop() || 'Project');
    }
    return null;
  } catch (error) {
    console.error('Failed to open directory:', error);
    return null;
  }
};

// Note: Recursive reading might be slow for large projects. 
// For MVP, we'll read only one level or use lazy loading (implemented in UI).
// Here we implement a lazy-ready structure helper.
export const readDirectory = async (path: string): Promise<FileNode[]> => {
  try {
    console.log(`Reading directory: ${path}`);
    const entries = await readDir(path);
    const nodes: FileNode[] = entries.map(entry => {
        // Normalize path joining
        const cleanPath = path.endsWith('/') ? path.slice(0, -1) : path;
        return {
            id: uuidv4(), // Client-side ID
            name: entry.name,
            path: `${cleanPath}/${entry.name}`, 
            kind: (entry.isDirectory ? 'directory' : 'file') as 'file' | 'directory',
            children: undefined // Lazy load
        };
    });
    return nodes.sort(sortFiles);
  } catch (error) {
    console.error(`Failed to read directory ${path}:`, error);
    throw error; // Re-throw to let caller handle/toast
  }
};

// Recursive implementation (use with caution)
const readDirectoryRecursively = async (path: string, name: string): Promise<FileNode> => {
    // This is just a placeholder. For real large projects, avoid full recursion on load.
    // For this MVP, we will return the root node, and let the UI fetch children.
    return {
        id: uuidv4(),
        name,
        path,
        kind: 'directory',
        children: await readDirectory(path)
    };
};

export const readFileContent = async (path: string): Promise<string> => {
  return await readTextFile(path);
};

export const writeFileContent = async (path: string, content: string): Promise<void> => {
  await writeTextFile(path, content);
};

export const saveFileAs = async (content: string): Promise<string | null> => {
  const path = await save();
  if (path) {
    await writeTextFile(path, content);
    return path;
  }
  return null;
};

export const renameFile = async (oldPath: string, newPath: string): Promise<void> => {
    await rename(oldPath, newPath);
};

export const deleteFile = async (path: string): Promise<void> => {
    // recursive true for directories, false for files (though remove handles both if recursive is true)
    // But remove api signature might differ slightly based on version.
    // In tauri v2 plugin-fs, remove options object: { recursive?: boolean }
    await remove(path, { recursive: true }); 
};
