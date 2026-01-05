import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useSnippetStore } from '../../src/stores/snippetStore';
import { useFileStore } from '../../src/stores/fileStore';
import { useEditorStore } from '../../src/stores/editorStore';
import { useLayoutStore } from '../../src/stores/layoutStore';
import { TestDataGenerator } from '../../src/utils/testDataGenerator';

// Mock dependencies
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(async (cmd) => {
    if (cmd === 'estimate_tokens_cmd') return 100;
    return undefined;
  })
}));

vi.mock('@tauri-apps/plugin-fs', () => ({
  writeTextFile: vi.fn(),
  readTextFile: vi.fn()
}));

describe('Snippet Manager Workflow Integration', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    // Reset stores
    await useSnippetStore.getState().clearAll();
    useFileStore.getState().syncState({ openedFiles: [], activeFileId: null });
    useLayoutStore.getState().syncState({ activePaneId: 'pane-1', panes: [{ id: 'pane-1', size: 100, position: {x:0, y:0} }] });
  });

  it('should handle full workflow: bulk generate -> search -> open -> edit -> save', async () => {
    const snippetStore = useSnippetStore.getState();
    const fileStore = useFileStore.getState();

    // 1. Bulk Generate 1000 Snippets
    console.log('[Integration] Generating 1000 snippets...');
    const mockData = TestDataGenerator.generateSnippets({ count: 1000 });
    await useSnippetStore.getState().bulkAddSnippets(mockData);
    
    expect(useSnippetStore.getState().snippets).toHaveLength(1000);

    // 2. Search for a specific one
    const targetSnippet = mockData[500];
    useSnippetStore.getState().setFilter({ search: targetSnippet.title });
    await useSnippetStore.getState().fetchSnippets();
    
    expect(useSnippetStore.getState().snippets.length).toBeGreaterThan(0);
    expect(useSnippetStore.getState().snippets[0].title).toBe(targetSnippet.title);

    // 3. Open Snippet in Editor
    console.log('[Integration] Opening snippet in editor...');
    useSnippetStore.getState().openSnippetAsFile(targetSnippet);

    const activeFileId = useFileStore.getState().activeFileId;
    const activeFile = useFileStore.getState().openedFiles.find(f => f.id === activeFileId);
    
    expect(activeFile).toBeDefined();
    expect(activeFile?.path).toBe(`snippet://${targetSnippet.id}`);
    expect(useLayoutStore.getState().panes[0].fileId).toBe(targetSnippet.id);

    // 4. Simulate Editing
    console.log('[Integration] Simulating edit...');
    const newContent = '// Edited Content';
    useFileStore.getState().updateFileContent(activeFileId!, newContent);
    
    const updatedFile = useFileStore.getState().openedFiles.find(f => f.id === activeFileId);
    expect(updatedFile?.content).toBe(newContent);
    expect(updatedFile?.isDirty).toBe(true);

    // 5. Save back to Database
    console.log('[Integration] Saving back to DB...');
    // Simulate App.tsx save logic
    if (updatedFile?.path.startsWith('snippet://')) {
        await useSnippetStore.getState().updateSnippet(targetSnippet.id, { code: updatedFile.content });
        useFileStore.getState().setFileDirty(activeFileId!, false);
    }

    // 6. Verify Persistence
    const finalSnippets = useSnippetStore.getState().snippets;
    const savedSnippet = finalSnippets.find(s => s.id === targetSnippet.id);
    expect(savedSnippet?.code).toBe(newContent);
    expect(useFileStore.getState().openedFiles[0].isDirty).toBe(false);
    
    console.log('[Integration] Full workflow test passed!');
  });
});
