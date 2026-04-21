import { readDir, readTextFile, writeTextFile, rename, remove, open as openFsFile } from '@tauri-apps/plugin-fs';
import { open as openDialog, save } from '@tauri-apps/plugin-dialog';
import { Command } from '@tauri-apps/plugin-shell';
import { FileNode } from '../stores/types';
import { v4 as uuidv4 } from 'uuid';
import { platform } from '@tauri-apps/plugin-os';
import { invoke } from '@tauri-apps/api/core';
import { getCachedDir, setCachedDir, invalidateCachePath } from './cache';
import { perfMonitor } from './performanceMonitor';
import i18n from '../i18n/config';

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

export type ProtectedEditorFileCategory = 'binary' | 'archive' | 'media';

const PROTECTED_EDITOR_FILE_EXTENSIONS: Record<ProtectedEditorFileCategory, Set<string>> = {
  binary: new Set([
    'bin', 'dat', 'db', 'sqlite', 'sqlite3', 'pdf', 'psd', 'ai', 'eps', 'sketch',
    'exe', 'dll', 'so', 'dylib', 'app', 'msi', 'pkg', 'deb', 'rpm',
    'iso', 'dmg', 'img', 'class', 'pyc', 'pyo', 'o', 'obj', 'a', 'lib',
    'woff', 'woff2', 'ttf', 'otf', 'eot', 'wasm',
  ]),
  archive: new Set([
    'zip', '7z', 'rar', 'tar', 'gz', 'tgz', 'bz2', 'xz', 'lz', 'lz4', 'zst',
    'cab', 'jar', 'war', 'ear', 'apk', 'ipa',
  ]),
  media: new Set([
    'png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'ico', 'icns', 'tif', 'tiff',
    'avif', 'heic', 'heif', 'mp3', 'wav', 'flac', 'aac', 'm4a', 'ogg', 'oga',
    'mp4', 'm4v', 'mov', 'avi', 'mkv', 'webm', 'wmv', 'flv', 'mpeg', 'mpg',
  ]),
};

const PROTECTED_EDITOR_FILE_BASENAMES = new Set([
  '.ds_store',
  'thumbs.db',
  'desktop.ini',
]);

const PROTECTED_EDITOR_CATEGORY_LABEL_KEYS: Record<ProtectedEditorFileCategory, string> = {
  binary: 'common.protectedFileCategories.binary',
  archive: 'common.protectedFileCategories.archive',
  media: 'common.protectedFileCategories.media',
};

const EDITOR_FILE_PROBE_SIZE = 4096;
const SUSPICIOUS_BINARY_BYTE_RATIO = 0.3;

const isSuspiciousBinaryByte = (byte: number): boolean =>
  byte === 0x00 || byte === 0xff || byte <= 0x08 || (byte >= 0x0e && byte <= 0x1f) || byte === 0x7f;

const isProtectedEditorSystemMetadataFile = (path: string): boolean => {
  const fileName = getFileName(path).toLowerCase();
  return PROTECTED_EDITOR_FILE_BASENAMES.has(fileName) || fileName.startsWith('._');
};

const getProtectedEditorFileCategoryByExtension = (path: string): ProtectedEditorFileCategory | null => {
  const extension = getFileExtension(path).toLowerCase();

  if (!extension) {
    return null;
  }

  for (const [category, extensions] of Object.entries(PROTECTED_EDITOR_FILE_EXTENSIONS) as Array<[ProtectedEditorFileCategory, Set<string>]>) {
    if (extensions.has(extension)) {
      return category;
    }
  }

  return null;
};

const getProtectedEditorFileCategoryByBytes = (sampleBytes: Uint8Array): ProtectedEditorFileCategory | null => {
  if (sampleBytes.length === 0) {
    return null;
  }

  let suspiciousBytes = 0;

  for (const byte of sampleBytes) {
    if (isSuspiciousBinaryByte(byte)) {
      suspiciousBytes += 1;
    }
  }

  if (suspiciousBytes === 0) {
    return null;
  }

  return suspiciousBytes / sampleBytes.length >= SUSPICIOUS_BINARY_BYTE_RATIO ? 'binary' : null;
};

const readFileProbe = async (path: string): Promise<Uint8Array> => {
  const handle = await openFsFile(path, { read: true });

  try {
    const buffer = new Uint8Array(EDITOR_FILE_PROBE_SIZE);
    const bytesRead = await handle.read(buffer);

    return bytesRead === null ? new Uint8Array() : buffer.slice(0, bytesRead);
  } finally {
    await handle.close();
  }
};

const tryReadFileProbe = async (path: string): Promise<Uint8Array | null> => {
  try {
    return await readFileProbe(path);
  } catch (error) {
    console.warn('[fileSystem] Skipping binary probe and falling back to text read:', path, error);
    return null;
  }
};

export const detectProtectedEditorFileCategory = (
  path: string,
  sampleBytes?: Uint8Array
): ProtectedEditorFileCategory | null => {
  const normalizedPath = normalizePath(path);

  return (
    (isProtectedEditorSystemMetadataFile(normalizedPath) ? 'binary' : null) ??
    getProtectedEditorFileCategoryByExtension(normalizedPath) ??
    (sampleBytes ? getProtectedEditorFileCategoryByBytes(sampleBytes) : null)
  );
};

export const getProtectedEditorFileMessage = (
  path: string,
  category: ProtectedEditorFileCategory
): string => {
  const fileName = getFileName(path) || String(i18n.t('common.thisFile'));
  const categoryLabel = String(i18n.t(PROTECTED_EDITOR_CATEGORY_LABEL_KEYS[category]));

  return String(i18n.t('common.protectedFileOpenMessage', { fileName, categoryLabel }));
};

export class ProtectedEditorFileOpenError extends Error {
  readonly path: string;
  readonly category: ProtectedEditorFileCategory;

  constructor(path: string, category: ProtectedEditorFileCategory) {
    super(getProtectedEditorFileMessage(path, category));
    this.name = 'ProtectedEditorFileOpenError';
    this.path = normalizePath(path);
    this.category = category;
  }
}

export const getFileOpenErrorMessage = (error: unknown, path?: string): string => {
  if (error instanceof ProtectedEditorFileOpenError) {
    return error.message;
  }

  const fileName = path ? getFileName(path) : '';
  return fileName
    ? String(i18n.t('common.fileOpenFailedWithName', { fileName }))
    : String(i18n.t('common.fileOpenFailed'));
};

export const assertCanOpenFileAsText = async (path: string): Promise<void> => {
  const normalizedPath = normalizePath(path);
  const knownCategory = detectProtectedEditorFileCategory(normalizedPath);

  if (knownCategory) {
    throw new ProtectedEditorFileOpenError(normalizedPath, knownCategory);
  }

  const sampleBytes = await tryReadFileProbe(normalizedPath);
  if (!sampleBytes) {
    return;
  }

  const sampledCategory = detectProtectedEditorFileCategory(normalizedPath, sampleBytes);

  if (sampledCategory) {
    throw new ProtectedEditorFileOpenError(normalizedPath, sampledCategory);
  }
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
    const selected = await openDialog({
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

    // 🔥 修复：检查 entries 是否为数组，Tauri API 可能返回非数组格式
    if (!entries || !Array.isArray(entries)) {
      console.warn(`[readDirectory] entries is not an array:`, typeof entries, entries);
      perfMonitor.end(perfId);
      return [];
    }

    const nodes: FileNode[] = entries
      .filter((entry: any) => {
        const entryName = entry?.name;
        return !entryName || !isProtectedEditorSystemMetadataFile(entryName);
      })
      .map((entry: any) => {
        return {
            id: uuidv4(), // Client-side ID
            name: entry.name || 'unknown',
            path: joinPath(normalizedPath, entry.name || 'unknown'),
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
    return []; // 🔥 修复：返回空数组而不是抛出错误，避免应用崩溃
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
  await assertCanOpenFileAsText(normalizedPath);
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
