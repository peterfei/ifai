/**
 * Mock for @tauri-apps/api/app
 * Used in E2E test environment where actual Tauri API is not available
 */

export async function getName(): Promise<string> {
  return 'IfAI';
}

export async function getVersion(): Promise<string> {
  return '0.2.6';
}

export async function getTauriVersion(): Promise<string> {
  return '1.5.0';
}
