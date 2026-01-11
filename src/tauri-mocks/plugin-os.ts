/**
 * Mock for @tauri-apps/plugin-os
 * Used in E2E test environment where actual Tauri API is not available
 */

export type Platform = 'linux' | 'macos' | 'windows' | 'android' | 'ios';

/**
 * Mock platform function
 * Returns the current platform
 */
export async function platform(): Promise<Platform> {
  // Detect from navigator.userAgent in browser
  const userAgent = navigator.userAgent;

  if (userAgent.includes('Mac OS X') || userAgent.includes('Darwin')) {
    return 'macos';
  }
  if (userAgent.includes('Windows')) {
    return 'windows';
  }
  if (userAgent.includes('Linux') && !userAgent.includes('Android')) {
    return 'linux';
  }
  if (userAgent.includes('Android')) {
    return 'android';
  }
  if (userAgent.includes('iPhone') || userAgent.includes('iPad') || userAgent.includes('iOS')) {
    return 'ios';
  }

  // Default to macOS for E2E tests
  return 'macos';
}

/**
 * Mock version function
 * Returns the OS version
 */
export async function version(): Promise<string> {
  return '1.0.0';
}

/**
 * Mock type function
 * Returns the OS type (same as platform)
 */
export async function type(): Promise<string> {
  return (await platform()) || 'darwin';
}

/**
 * Mock arch function
 * Returns the CPU architecture
 */
export async function arch(): Promise<string> {
  return 'x86_64';
}

/**
 * Mock tempdir function
 * Returns the temp directory path
 */
export async function tempdir(): Promise<string> {
  return '/tmp';
}

/**
 * Mock Platform export (constant value)
 */
export const Platform = {
  Linux: 'linux',
  MacOS: 'macos',
  Windows: 'windows',
  Android: 'android',
  Ios: 'ios',
} as const;
