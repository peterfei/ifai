import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { databaseManager, db } from '../databaseManager';

// 定义测试数据接口
interface TestSnippet {
  id: string;
  title: string;
  language: string;
  code: string;
  createdAt: string;
}

describe('DatabaseManager', () => {
  const storeName = 'snippets';

  // 每个测试前清理数据库
  beforeEach(async () => {
    await databaseManager.clear(storeName);
  });
  
  // 测试完成后关闭连接（可选，视环境而定）
  // afterAll(async () => {
  //   db.close();
  // });

  it('should create and read a snippet', async () => {
    const snippet: TestSnippet = {
      id: '1',
      title: 'Hello World',
      language: 'typescript',
      code: 'console.log("Hello")',
      createdAt: new Date().toISOString()
    };

    await databaseManager.create(storeName, snippet);
    const result = await databaseManager.read<TestSnippet>(storeName, '1');

    expect(result).toBeDefined();
    expect(result?.title).toBe('Hello World');
  });

  it('should update a snippet', async () => {
    const snippet: TestSnippet = {
      id: '2',
      title: 'Original Title',
      language: 'rust',
      code: 'fn main() {}',
      createdAt: new Date().toISOString()
    };

    await databaseManager.create(storeName, snippet);
    await databaseManager.update(storeName, '2', { title: 'Updated Title' });
    
    const result = await databaseManager.read<TestSnippet>(storeName, '2');
    expect(result?.title).toBe('Updated Title');
    expect(result?.language).toBe('rust'); // 其它字段保持不变
  });

  it('should delete a snippet', async () => {
    const snippet: TestSnippet = {
      id: '3',
      title: 'To Be Deleted',
      language: 'go',
      code: 'package main',
      createdAt: new Date().toISOString()
    };

    await databaseManager.create(storeName, snippet);
    await databaseManager.delete(storeName, '3');
    
    const result = await databaseManager.read(storeName, '3');
    expect(result).toBeUndefined();
  });

  it('should bulk create and read snippets', async () => {
    const snippets: TestSnippet[] = Array.from({ length: 10 }).map((_, i) => ({
      id: `bulk-${i}`,
      title: `Bulk Snippet ${i}`,
      language: 'python',
      code: `print(${i})`,
      createdAt: new Date().toISOString()
    }));

    await databaseManager.bulkCreate(storeName, snippets);
    
    const readBack = await databaseManager.bulkRead(storeName, ['bulk-0', 'bulk-9']);
    expect(readBack).toHaveLength(2);
    expect(readBack[0]).toMatchObject({ id: 'bulk-0' });
    expect(readBack[1]).toMatchObject({ id: 'bulk-9' });
  });

  it('should search snippets', async () => {
    const s1: TestSnippet = { id: 's1', title: 'React Hooks', language: 'ts', code: 'useState', createdAt: '' };
    const s2: TestSnippet = { id: 's2', title: 'Vue Composition', language: 'ts', code: 'ref', createdAt: '' };
    
    await databaseManager.bulkCreate(storeName, [s1, s2]);

    const results = await databaseManager.search<TestSnippet>(storeName, 'Hooks');
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('s1');
  });
});
