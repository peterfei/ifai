import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useSnippetStore } from '../../src/stores/snippetStore';
import { TestDataGenerator } from '../../src/utils/testDataGenerator';

describe('Virtual Scroll Stress Test', () => {
  beforeEach(async () => {
    await useSnippetStore.getState().clearAll();
  });

  it('should handle 10,000 snippets without crashing and maintain list stability', async () => {
    const store = useSnippetStore.getState();
    
    // 1. Generate 10,000 snippets
    const heavyLoad = TestDataGenerator.generateSnippets({ count: 10000 });
    
    const startTime = performance.now();
    await store.bulkAddSnippets(heavyLoad);
    const endTime = performance.now();

    console.log(`[Performance] Time to bulk insert 10,000 snippets: ${(endTime - startTime).toFixed(2)}ms`);
    
    // Assert load success
    expect(useSnippetStore.getState().snippets).toHaveLength(10000);
    
    // 2. Test search performance on heavy load
    const searchStartTime = performance.now();
    store.setFilter({ search: heavyLoad[5000].title });
    await store.fetchSnippets();
    const searchEndTime = performance.now();

    console.log(`[Performance] Time to search in 10,000 items: ${(searchEndTime - searchStartTime).toFixed(2)}ms`);
    
    // Expect search to be fast (adjusted for test environment with 10k items)
    // Setting threshold to 1500ms to accommodate variable test conditions
    expect(searchEndTime - searchStartTime).toBeLessThan(1500);
  });
});
