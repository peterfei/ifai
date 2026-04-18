import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockAssertCanOpenFileAsText = vi.fn();
const mockGetFileName = vi.fn();
const mockGetFileOpenErrorMessage = vi.fn();
const mockNormalizePath = vi.fn();
const mockReadFileContent = vi.fn();
const mockDetectLanguageFromPath = vi.fn();
const mockOpenFile = vi.fn();
const mockAssignFileToPane = vi.fn();
const mockToastError = vi.fn();
const mockFileStoreGetState = vi.fn();
const mockLayoutStoreGetState = vi.fn();

vi.mock('../../../src/utils/fileSystem', () => ({
  assertCanOpenFileAsText: (...args: unknown[]) => mockAssertCanOpenFileAsText(...args),
  getFileName: (...args: unknown[]) => mockGetFileName(...args),
  getFileOpenErrorMessage: (...args: unknown[]) => mockGetFileOpenErrorMessage(...args),
  normalizePath: (...args: unknown[]) => mockNormalizePath(...args),
  readFileContent: (...args: unknown[]) => mockReadFileContent(...args),
}));

vi.mock('../../../src/utils/languageDetection', () => ({
  detectLanguageFromPath: (...args: unknown[]) => mockDetectLanguageFromPath(...args),
}));

vi.mock('../../../src/stores/fileStore', () => ({
  useFileStore: {
    getState: () => mockFileStoreGetState(),
  },
}));

vi.mock('../../../src/stores/layoutStore', () => ({
  useLayoutStore: {
    getState: () => mockLayoutStoreGetState(),
  },
}));

vi.mock('sonner', () => ({
  toast: {
    error: (...args: unknown[]) => mockToastError(...args),
  },
}));

import { openFileFromPath } from '../../../src/utils/fileActions';

describe('openFileFromPath', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockNormalizePath.mockImplementation((path: string) => path.replace(/\\/g, '/'));
    mockGetFileName.mockImplementation((path: string) => path.split('/').pop() || path);
    mockGetFileOpenErrorMessage.mockImplementation((_error: unknown, path?: string) =>
      path ? `localized-open-failed:${path.split('/').pop()}` : 'localized-open-file-failed'
    );
    mockAssertCanOpenFileAsText.mockResolvedValue(undefined);
    mockReadFileContent.mockResolvedValue('fresh content');
    mockDetectLanguageFromPath.mockReturnValue('typescript');
    mockOpenFile.mockReturnValue('opened-file-id');
    mockFileStoreGetState.mockReturnValue({
      openFile: mockOpenFile,
      openedFiles: [],
    });
    mockLayoutStoreGetState.mockReturnValue({
      activePaneId: 'pane-1',
      assignFileToPane: mockAssignFileToPane,
    });

    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('preserves dirty content when reopening an already-open file', async () => {
    mockFileStoreGetState.mockReturnValue({
      openFile: mockOpenFile,
      openedFiles: [
        {
          id: 'existing-id',
          path: '/workspace/app.ts',
          name: 'app.ts',
          content: 'dirty content',
          isDirty: true,
          language: 'typescript',
        },
      ],
    });

    const result = await openFileFromPath('/workspace/app.ts', {
      initialLine: 17,
    });

    expect(result).toBe(true);
    expect(mockAssertCanOpenFileAsText).toHaveBeenCalledWith('/workspace/app.ts');
    expect(mockReadFileContent).not.toHaveBeenCalled();
    expect(mockOpenFile).toHaveBeenCalledWith({
      id: 'existing-id',
      path: '/workspace/app.ts',
      name: 'app.ts',
      content: 'dirty content',
      isDirty: true,
      language: 'typescript',
      initialLine: 17,
    });
    expect(mockAssignFileToPane).toHaveBeenCalledWith('pane-1', 'opened-file-id');
    expect(mockToastError).not.toHaveBeenCalled();
  });

  it('shows the centralized protection message when a file is blocked', async () => {
    const protectedError = new Error('blocked');
    mockReadFileContent.mockRejectedValue(protectedError);
    mockGetFileOpenErrorMessage.mockReturnValue('localized-protected-open:image.png:media');

    const result = await openFileFromPath('/workspace/image.png');

    expect(result).toBe(false);
    expect(mockReadFileContent).toHaveBeenCalledWith('/workspace/image.png');
    expect(mockOpenFile).not.toHaveBeenCalled();
    expect(mockToastError).toHaveBeenCalledWith('localized-protected-open:image.png:media');
  });
});
