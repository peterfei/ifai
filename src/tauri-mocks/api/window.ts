/**
 * Mock for @tauri-apps/api/window
 * Used in E2E test environment where actual Tauri API is not available
 */

export const getCurrentWindow = () => ({
  label: 'main',
  show: async () => console.log('[Mock] Window shown'),
  hide: async () => console.log('[Mock] Window hidden'),
  close: async () => console.log('[Mock] Window closed'),
  minimize: async () => console.log('[Mock] Window minimized'),
  maximize: async () => console.log('[Mock] Window maximized'),
  unmaximize: async () => console.log('[Mock] Window unmaximized'),
  isFocused: async () => true,
  isMaximized: async () => false,
  isMinimized: async () => false,
  scaleFactor: async () => 1,
  innerPosition: async () => ({ x: 0, y: 0 }),
  innerSize: async () => ({ width: 1920, height: 1080 }),
  outerPosition: async () => ({ x: 0, y: 0 }),
  outerSize: async () => ({ width: 1920, height: 1080 }),
  setAlwaysOnTop: async () => {},
  setAlwaysOnBottom: async () => {},
  setDecorations: async () => {},
  setIgnoreCursorEvents: async () => {},
  setSize: async () => {},
  setMinSize: async () => {},
  setMaxSize: async () => {},
  setPosition: async () => {},
  setTitle: async () => {},
  setResizable: async () => {},
  setSkipTaskbar: async () => {},
  onFocusChanged: () => {},
  onResizeRequested: () => {},
  onCloseRequested: () => {},
  onScaleChanged: () => {},
});

export function getAllWindows() {
  return [getCurrentWindow()];
}

export const appWindow = getCurrentWindow();
