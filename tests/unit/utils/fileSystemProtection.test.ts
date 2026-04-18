import { describe, expect, it, vi } from 'vitest';

const mockI18nT = vi.fn((key: string, options?: Record<string, unknown>) => {
  switch (key) {
    case 'common.thisFile':
      return 'localized-this-file';
    case 'common.protectedFileCategories.binary':
      return 'localized-binary';
    case 'common.protectedFileCategories.archive':
      return 'localized-archive';
    case 'common.protectedFileCategories.media':
      return 'localized-media';
    case 'common.protectedFileOpenMessage':
      return `localized-protected-open:${options?.fileName}:${options?.categoryLabel}`;
    case 'common.fileOpenFailed':
      return 'localized-open-file-failed';
    case 'common.fileOpenFailedWithName':
      return `localized-open-failed:${options?.fileName}`;
    default:
      return key;
  }
});

vi.mock('@tauri-apps/plugin-fs', () => ({
  readDir: vi.fn(),
  readTextFile: vi.fn(),
  writeTextFile: vi.fn(),
  rename: vi.fn(),
  remove: vi.fn(),
  open: vi.fn(),
}));

vi.mock('@tauri-apps/plugin-dialog', () => ({
  open: vi.fn(),
  save: vi.fn(),
}));

vi.mock('@tauri-apps/plugin-shell', () => ({
  Command: {
    create: vi.fn(),
  },
}));

vi.mock('@tauri-apps/plugin-os', () => ({
  platform: vi.fn(() => 'linux'),
}));

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

vi.mock('../../../src/utils/cache', () => ({
  getCachedDir: vi.fn(),
  setCachedDir: vi.fn(),
  invalidateCachePath: vi.fn(),
}));

vi.mock('../../../src/utils/performanceMonitor', () => ({
  perfMonitor: {
    start: vi.fn(),
    end: vi.fn(),
  },
}));

vi.mock('uuid', () => ({
  v4: vi.fn(() => 'uuid'),
}));

vi.mock('../../../src/i18n/config', () => ({
  default: {
    t: (...args: unknown[]) => mockI18nT(...args),
  },
}));

import {
  detectProtectedEditorFileCategory,
  getFileOpenErrorMessage,
  getProtectedEditorFileMessage,
} from '../../../src/utils/fileSystem';

describe('fileSystem editor protection', () => {
  it('classifies known media and archive extensions without reading bytes', () => {
    expect(detectProtectedEditorFileCategory('/tmp/photo.png')).toBe('media');
    expect(detectProtectedEditorFileCategory('/tmp/bundle.zip')).toBe('archive');
  });

  it('detects unknown binary content from sampled bytes', () => {
    const sample = new Uint8Array([0x00, 0xff, 0x01, 0x02, 0x03, 0x04]);

    expect(detectProtectedEditorFileCategory('/tmp/mystery.asset', sample)).toBe('binary');
  });

  it('allows ordinary text content with no blocked extension', () => {
    const sample = new TextEncoder().encode('hello\nworld\nconst value = 1;\n');

    expect(detectProtectedEditorFileCategory('/tmp/README', sample)).toBeNull();
  });

  it('builds the user-facing protection message from the blocked category', () => {
    expect(getProtectedEditorFileMessage('/tmp/image.png', 'media')).toBe(
      'localized-protected-open:image.png:localized-media'
    );
  });

  it('builds the generic file-open failure message through i18n', () => {
    expect(getFileOpenErrorMessage(new Error('nope'), '/tmp/demo.txt')).toBe(
      'localized-open-failed:demo.txt'
    );
    expect(getFileOpenErrorMessage(new Error('nope'))).toBe('localized-open-file-failed');
  });
});
