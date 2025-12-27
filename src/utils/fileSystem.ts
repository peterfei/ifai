import { readDir, readTextFile, writeTextFile, rename, remove } from '@tauri-apps/plugin-fs';
import { open, save } from '@tauri-apps/plugin-dialog';
import { Command } from '@tauri-apps/plugin-shell';
import { FileNode } from '../stores/types';
import { v4 as uuidv4 } from 'uuid';
import { platform, Platform } from '@tauri-apps/plugin-os';
import { invoke } from '@tauri-apps/api/core';
import { getCachedDir, setCachedDir, invalidateCachePath } from './cache';
import { perfMonitor } from './performanceMonitor';

/**
 * Normalize path separators for cross-platform compatibility.
 * Windows uses backslashes, Unix uses forward slashes.
 * We normalize all paths to use forward slashes internally.
 */
export const normalizePath = (path: string): string => {
  if (!path) return path;
  // Convert Windows backslashes to forward slashes
  let normalized = path.replace(/\\/g, '/');
  // Ensure Unix paths start with / (but not Windows paths like C:/)
  if (!normalized.startsWith('/') && !/^[a-zA-Z]:\//.test(normalized)) {
    normalized = '/' + normalized;
  }
  return normalized;
};

/**
 * Join path segments with proper separator for the current platform
 */
export const joinPath = (...segments: string[]): string => {
  // Only strip trailing slashes, preserve leading slashes for absolute paths
  const normalized = segments.map((s, i) => {
    const stripped = s.replace(/[\/\\]+$/g, ''); // Remove trailing slashes
    // For first segment, preserve leading slash (absolute path)
    // For other segments, remove leading slashes to avoid // in the middle
    return i === 0 ? stripped : stripped.replace(/^[\/\\]+/g, '');
  });
  return normalized.join('/');
};

/**
 * Get the parent directory of a path
 */
export const getParentPath = (path: string): string => {
  const normalized = normalizePath(path);
  const lastSlash = normalized.lastIndexOf('/');
  if (lastSlash <= 0) return '/';
  return normalized.substring(0, lastSlash);
};

/**
 * Get the file name from a path (without directory)
 */
export const getFileName = (path: string): string => {
  const normalized = normalizePath(path);
  const lastSlash = normalized.lastIndexOf('/');
  return lastSlash >= 0 ? normalized.substring(lastSlash + 1) : normalized;
};

/**
 * Get file extension from path
 */
export const getFileExtension = (path: string): string => {
  const fileName = getFileName(path);
  const lastDot = fileName.lastIndexOf('.');
  return lastDot >= 0 ? fileName.substring(lastDot + 1) : '';
};

/**
 * Check if a path is an absolute path
 */
export const isAbsolutePath = (path: string): boolean => {
  const normalized = normalizePath(path);
  // Unix absolute: starts with /
  if (normalized.startsWith('/')) return true;
  // Windows absolute: starts with drive letter like C:/ or C:/
  if (/^[a-zA-Z]:\//.test(normalized)) return true;
  return false;
};

/**
 * Convert path to be relative to a base path
 */
export const getRelativePath = (basePath: string, fullPath: string): string => {
  const normalizedBase = normalizePath(basePath).replace(/\/$/, '');
  const normalizedFull = normalizePath(fullPath);

  if (normalizedFull.startsWith(normalizedBase)) {
    let relative = normalizedFull.substring(normalizedBase.length);
    if (relative.startsWith('/')) {
      relative = relative.substring(1);
    }
    return relative;
  }
  return normalizedFull;
};

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
      const normalizedPath = normalizePath(selected);
      return await readDirectoryRecursively(normalizedPath, getFileName(normalizedPath) || 'Project');
    }
    return null;
  } catch (error) {
    console.error('Failed to open directory:', error);
    return null;
  }
};

// Note: Recursive reading might be slow for large projects.
// For MVP, we'll read only one level or use lazy loading (implemented in UI).
// Here we implement a lazy-ready structure helper with caching.
export const readDirectory = async (path: string): Promise<FileNode[]> => {
  const perfId = `readDirectory:${path}`;
  perfMonitor.start(perfId);

  try {
    const normalizedPath = normalizePath(path);

    // Check cache first
    const cached = getCachedDir(normalizedPath);
    if (cached) {
      perfMonitor.end(perfId);
      return cached;
    }

    // Cache miss - read from filesystem
    const entries = await readDir(normalizedPath);
    const nodes: FileNode[] = entries.map(entry => {
        return {
            id: uuidv4(), // Client-side ID
            name: entry.name,
            path: joinPath(normalizedPath, entry.name),
            kind: (entry.isDirectory ? 'directory' : 'file') as 'file' | 'directory',
            children: undefined // Lazy load
        };
    });

    // Sort and cache the result
    const sortedNodes = nodes.sort(sortFiles);
    setCachedDir(normalizedPath, sortedNodes);

    perfMonitor.end(perfId);
    return sortedNodes;
  } catch (error) {
    perfMonitor.end(perfId);
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
        path: normalizePath(path),
        kind: 'directory',
        children: await readDirectory(path)
    };
};

export const readFileContent = async (path: string): Promise<string> => {
  const normalizedPath = normalizePath(path);
  const content = await readTextFile(normalizedPath);
  console.log(`Read file ${normalizedPath}, content length: ${content.length}`);
  return content;
};

export const writeFileContent = async (path: string, content: string): Promise<void> => {
  const normalizedPath = normalizePath(path);
  await writeTextFile(normalizedPath, content);
};

export const saveFileAs = async (content: string): Promise<string | null> => {
  const path = await save();
  if (path) {
    const normalizedPath = normalizePath(path);
    await writeTextFile(normalizedPath, content);
    return normalizedPath;
  }
  return null;
};

export const renameFile = async (oldPath: string, newPath: string): Promise<void> => {
    const normalizedOld = normalizePath(oldPath);
    const normalizedNew = normalizePath(newPath);
    console.log('[fileSystem] rename:', normalizedOld, '->', normalizedNew);
    try {
        await rename(normalizedOld, normalizedNew);
        console.log('[fileSystem] rename successful');

        // Invalidate cache for both old and new parent directories
        const oldParent = normalizedOld.substring(0, normalizedOld.lastIndexOf('/'));
        const newParent = normalizedNew.substring(0, normalizedNew.lastIndexOf('/'));

        if (oldParent) invalidateCachePath(oldParent);
        if (newParent && newParent !== oldParent) invalidateCachePath(newParent);
    } catch (error) {
        console.error('[fileSystem] rename failed:', error);
        throw error;
    }
};

export const deleteFile = async (path: string): Promise<void> => {
    const normalizedPath = normalizePath(path);
    console.log('[fileSystem] delete:', normalizedPath);
    try {
        // recursive true for directories, false for files (though remove handles both if recursive is true)
        await remove(normalizedPath, { recursive: true });
        console.log('[fileSystem] delete successful');

        // Invalidate parent directory cache since its contents changed
        const parentPath = normalizedPath.substring(0, normalizedPath.lastIndexOf('/'));
        if (parentPath) {
            invalidateCachePath(parentPath);
        }
    } catch (error) {
        console.error('[fileSystem] delete failed:', error);
        throw error;
    }
};

/**
 * Open in system terminal at the specified directory
 */
export const openInTerminal = async (path: string): Promise<void> => {
  const normalizedPath = normalizePath(path);
  const currentPlatform = platform();

  try {
    if (currentPlatform === 'windows') {
      // Try Windows Terminal first, then PowerShell, then cmd
      await Command.create('cmd', ['/c', 'start', 'cmd', '/k', `cd /d "${normalizedPath.replace(/\//g, '\\')}"`]).execute();
    } else if (currentPlatform === 'macos') {
      await Command.create('sh', ['-c', `open -a Terminal "${normalizedPath}"`]).execute();
    } else {
      // Linux - try common terminals
      const terminals = ['gnome-terminal', 'konsole', 'xterm', 'xfce4-terminal'];
      for (const term of terminals) {
        try {
          await Command.create('sh', ['-c', `${term} --working-directory="${normalizedPath}"`]).execute();
          return;
        } catch {
          continue;
        }
      }
      throw new Error('No terminal found');
    }
  } catch (error) {
    console.error('Failed to open terminal:', error);
    throw error;
  }
};

/**
 * Reveal file in system file manager
 */
export const revealInFileManager = async (path: string): Promise<void> => {
  const normalizedPath = normalizePath(path);
  const currentPlatform = platform();

  try {
    if (currentPlatform === 'windows') {
      // Use explorer /select to highlight the file
      await Command.create('cmd', ['/c', 'explorer', '/select,', normalizedPath.replace(/\//g, '\\')]).execute();
    } else if (currentPlatform === 'macos') {
      await Command.create('sh', ['-c', `open -R "${normalizedPath}"`]).execute();
    } else {
      // Linux - use dbus for file managers that support it, fallback to xdg-open
      await Command.create('sh', ['-c', `xdg-open "${getParentPath(normalizedPath)}"`]).execute();
    }
  } catch (error) {
    console.error('Failed to reveal in file manager:', error);
    throw error;
  }
};

/**
 * Copy text to clipboard
 */
export const copyToClipboard = async (text: string): Promise<void> => {
  try {
    await navigator.clipboard.writeText(text);
  } catch (error) {
    console.error('Failed to copy to clipboard:', error);
    throw error;
  }
};

/**
 * Create a new empty file
 */
export const createFile = async (path: string): Promise<void> => {
  const normalizedPath = normalizePath(path);
  await writeTextFile(normalizedPath, '');
  // Invalidate parent directory cache since its contents changed
  const parentPath = normalizedPath.substring(0, normalizedPath.lastIndexOf('/'));
  if (parentPath) {
    invalidateCachePath(parentPath);
  }
};

/**
 * Create a new directory
 */
export const createDirectory = async (path: string): Promise<void> => {
  const normalizedPath = normalizePath(path);
  await invoke('plugin:fs|mkdir', {
    path: normalizedPath,
    recursive: true
  });
  // Invalidate parent directory cache since its contents changed
  const parentPath = normalizedPath.substring(0, normalizedPath.lastIndexOf('/'));
  if (parentPath) {
    invalidateCachePath(parentPath);
  }
};

/**
 * Get file metadata (size, modified time, etc.)
 */
export const getFileMetadata = async (path: string): Promise<{ size: number; modified: number; isFile: boolean; isDir: boolean }> => {
  const normalizedPath = normalizePath(path);
  const metadata = await invoke<{ size: number; modified: number; is_file: boolean; is_dir: boolean }>(
    'plugin:fs|metadata',
    { path: normalizedPath }
  );
  return {
    size: metadata.size,
    modified: metadata.modified,
    isFile: metadata.is_file,
    isDir: metadata.is_dir
  };
};

/**
 * Check if a file or directory exists
 */
export const pathExists = async (path: string): Promise<boolean> => {
  try {
    await getFileMetadata(path);
    return true;
  } catch {
    return false;
  }
};
