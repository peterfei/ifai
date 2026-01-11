/**
 * Mock for @tauri-apps/plugin-fs
 * Used in E2E test environment where actual Tauri API is not available
 */

import { invoke } from '@tauri-apps/api/core';

export interface DirEntry {
  name: string;
  isDirectory: boolean;
  isFile: boolean;
  isSymlink?: boolean;
}

/**
 * Mock readDir function
 * Reads a directory and returns its entries
 */
export async function readDir(dir: string): Promise<DirEntry[]> {
  console.log('[Mock FS] readDir called:', dir);

  try {
    // Try to use the E2E mock file system if available
    const mockFS = (window as any).__E2E_MOCK_FILE_SYSTEM__;
    if (mockFS) {
      const entries: DirEntry[] = [];

      // Collect all files that are children of this directory
      const normalizedDir = dir.endsWith('/') ? dir : dir + '/';
      for (const [filePath, _] of mockFS.entries()) {
        if (filePath.startsWith(normalizedDir)) {
          const relativePath = filePath.substring(normalizedDir.length);
          // Only include direct children (not grandchildren)
          if (!relativePath.includes('/')) {
            entries.push({
              name: relativePath,
              isDirectory: false, // Files only in mock FS
              isFile: true,
            });
          }
        }
      }

      // If no files found, return some default entries for the mock project
      if (entries.length === 0 && dir.includes('mock-project')) {
        return [
          { name: 'App.tsx', isDirectory: false, isFile: true },
          { name: 'main.tsx', isDirectory: false, isFile: true },
          { name: 'src', isDirectory: true, isFile: false },
        ];
      }

      return entries;
    }

    // Fallback to invoke-based mock
    return await invoke<DirEntry[]>('plugin:fs|read_dir', { path: dir });
  } catch (error) {
    console.error('[Mock FS] readDir error:', error);

    // Return default entries on error
    if (dir.includes('mock-project')) {
      return [
        { name: 'App.tsx', isDirectory: false, isFile: true },
        { name: 'main.tsx', isDirectory: false, isFile: true },
        { name: 'src', isDirectory: true, isFile: false },
      ];
    }

    return [];
  }
}

/**
 * Mock readTextFile function
 * Reads a text file and returns its content
 */
export async function readTextFile(filePath: string): Promise<string> {
  console.log('[Mock FS] readTextFile called:', filePath);

  try {
    const mockFS = (window as any).__E2E_MOCK_FILE_SYSTEM__;
    if (mockFS) {
      const content = mockFS.get(filePath);
      if (content !== undefined) {
        return content;
      }
    }

    // Fallback to invoke-based mock
    return await invoke<string>('plugin:fs|read_text_file', { path: filePath });
  } catch (error) {
    console.error('[Mock FS] readTextFile error:', error);
    return '// Mock file content';
  }
}

/**
 * Mock writeTextFile function
 * Writes text content to a file
 */
export async function writeTextFile(filePath: string, contents: string): Promise<void> {
  console.log('[Mock FS] writeTextFile called:', filePath);

  try {
    const mockFS = (window as any).__E2E_MOCK_FILE_SYSTEM__;
    if (mockFS) {
      mockFS.set(filePath, contents);
      return;
    }

    // Fallback to invoke-based mock
    await invoke('plugin:fs|write_text_file', { path: filePath, contents });
  } catch (error) {
    console.error('[Mock FS] writeTextFile error:', error);
  }
}

/**
 * Mock rename function
 * Renames a file or directory
 */
export async function rename(oldPath: string, newPath: string): Promise<void> {
  console.log('[Mock FS] rename called:', oldPath, '->', newPath);

  try {
    const mockFS = (window as any).__E2E_MOCK_FILE_SYSTEM__;
    if (mockFS) {
      const content = mockFS.get(oldPath);
      if (content !== undefined) {
        mockFS.set(newPath, content);
        mockFS.delete(oldPath);
      }
      return;
    }

    await invoke('plugin:fs|rename', { oldPath, newPath });
  } catch (error) {
    console.error('[Mock FS] rename error:', error);
  }
}

/**
 * Mock remove function
 * Removes a file or directory
 */
export async function remove(filePath: string): Promise<void> {
  console.log('[Mock FS] remove called:', filePath);

  try {
    const mockFS = (window as any).__E2E_MOCK_FILE_SYSTEM__;
    if (mockFS) {
      mockFS.delete(filePath);
      return;
    }

    await invoke('plugin:fs|remove', { path: filePath });
  } catch (error) {
    console.error('[Mock FS] remove error:', error);
  }
}
