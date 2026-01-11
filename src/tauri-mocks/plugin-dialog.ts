/**
 * Mock for @tauri-apps/plugin-dialog
 * Used in E2E test environment where actual Tauri API is not available
 */

export interface OpenDialogOptions {
  directory?: boolean;
  multiple?: boolean;
  filters?: Array<{ name: string; extensions: string[] }>;
}

export interface SaveDialogOptions {
  filters?: Array<{ name: string; extensions: string[] }>;
  defaultPath?: string;
}

/**
 * Mock open function
 * Opens a file/directory picker dialog
 */
export async function open(options?: OpenDialogOptions): Promise<string | string[] | null> {
  console.log('[Mock Dialog] open called:', options);

  // In E2E tests, return mock path
  if (options?.directory) {
    return '/Users/mac/mock-project';
  }

  return '/Users/mac/mock-project/App.tsx';
}

/**
 * Mock save function
 * Opens a save file dialog
 */
export async function save(options?: SaveDialogOptions): Promise<string | null> {
  console.log('[Mock Dialog] save called:', options);
  return '/Users/mac/mock-project/saved-file.txt';
}

/**
 * Mock ask function
 * Shows a yes/no dialog
 */
export async function ask(message: string, title?: string): Promise<boolean> {
  console.log('[Mock Dialog] ask called:', message, title);
  return true; // Always return true in E2E tests
}
