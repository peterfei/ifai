/**
 * exploreAdapter 测试
 *
 * EA-1~7: exploreProgress / exploreFindings → ExploreData 映射
 */
import { describe, test, expect, beforeEach } from 'vitest';
import { adaptMessageToCard, MessageAdapterRegistry } from '../MessageAdapterRegistry';
import { exploreAdapter } from '../adapters/exploreAdapter';

/* ===== 辅助函数 ===== */

function makeMessage(overrides: Record<string, any> = {}): any {
  return { id: 'm1', role: 'assistant', content: '', ...overrides };
}

/* ===== 测试 ===== */

describe('exploreAdapter', () => {
  beforeEach(() => {
    MessageAdapterRegistry.clear();
    MessageAdapterRegistry.register('explore', exploreAdapter);
  });

  // EA-1: 匹配 exploreProgress
  test('EA-1: 消息含 exploreProgress 时匹配', () => {
    const msg = makeMessage({
      exploreProgress: {
        phase: 'scanning',
        progress: { total: 10, scanned: 3, byDirectory: {} },
      },
    });
    const result = adaptMessageToCard(msg);
    expect(result).not.toBeNull();
    expect(result?.cardType).toBe('explore');
  });

  // EA-2: 匹配 exploreFindings
  test('EA-2: 消息含 exploreFindings 时匹配', () => {
    const msg = makeMessage({
      exploreFindings: {
        summary: '发现 3 个目录',
        directories: [{ path: 'src', fileCount: 5, keyFiles: ['index.ts'] }],
      },
    });
    const result = adaptMessageToCard(msg);
    expect(result).not.toBeNull();
    expect(result?.cardType).toBe('explore');
  });

  // EA-3: 不匹配（无相关字段）
  test('EA-3: 无 exploreProgress/Findings 时不匹配', () => {
    const msg = makeMessage({ content: 'hello' });
    expect(adaptMessageToCard(msg)).toBeNull();
  });

  // EA-4: exploreProgress → phases 包含 scanning phase
  test('EA-4: exploreProgress 映射为扫描 phase', () => {
    const msg = makeMessage({
      exploreProgress: {
        phase: 'scanning',
        currentPath: 'src/components',
        progress: { total: 10, scanned: 3, byDirectory: {} },
        scannedFiles: ['a.ts', 'b.ts'],
      },
    });
    const result = adaptMessageToCard(msg);
    expect(result?.data.phases).toHaveLength(1);

    const phase = result?.data.phases[0];
    expect(phase.mode).toBe('sequential');
    expect(phase.intent).toContain('src/components');
    expect(phase.progress).toBe(30); // 3/10
    expect(phase.status).toBe('running');
  });

  // EA-5: exploreProgress completed → status done, progress 100
  test('EA-5: exploreProgress phase=completed → done', () => {
    const msg = makeMessage({
      exploreProgress: {
        phase: 'completed',
        progress: { total: 10, scanned: 10, byDirectory: {} },
      },
    });
    const result = adaptMessageToCard(msg);
    const phase = result?.data.phases[0];
    expect(phase.status).toBe('done');
    expect(phase.progress).toBe(100);
  });

  // EA-6: exploreFindings 映射为 findings phase
  test('EA-6: exploreFindings 映射为发现 phase', () => {
    const msg = makeMessage({
      exploreFindings: {
        summary: '发现 3 个目录，包含 15 个文件',
        directories: [
          { path: 'src/components', fileCount: 8, keyFiles: ['Button.tsx'] },
          { path: 'src/utils', fileCount: 7, keyFiles: ['helpers.ts'] },
        ],
        patterns: [
          { type: 'import', description: 'React import pattern found' },
        ],
      },
    });
    const result = adaptMessageToCard(msg);
    expect(result?.data.phases).toHaveLength(1);

    const phase = result?.data.phases[0];
    expect(phase.status).toBe('done');
    expect(phase.progress).toBe(100);
    expect(phase.sub).toHaveLength(3); // 2 dirs + 1 pattern
  });

  // EA-7: 同时有 exploreProgress 和 exploreFindings → 两个 phase
  test('EA-7: 同时有 progress 和 findings 生成两个 phase', () => {
    const msg = makeMessage({
      exploreProgress: {
        phase: 'completed',
        progress: { total: 5, scanned: 5, byDirectory: {} },
      },
      exploreFindings: {
        summary: '分析完成',
        directories: [{ path: 'src', fileCount: 3, keyFiles: ['main.ts'] }],
      },
    });
    const result = adaptMessageToCard(msg);
    expect(result?.data.phases).toHaveLength(2);
    expect(result?.data.phases[0].status).toBe('done'); // progress phase
    expect(result?.data.phases[1].status).toBe('done'); // findings phase
  });

  // EA-8: byDirectory 映射为 sub items
  test('EA-8: byDirectory 目录映射为 sub 子项', () => {
    const msg = makeMessage({
      exploreProgress: {
        phase: 'scanning',
        progress: {
          total: 3,
          scanned: 1,
          byDirectory: {
            'src': { total: 2, scanned: 1, status: 'scanning' },
            'src/utils': { total: 1, scanned: 0, status: 'pending' },
          },
        },
      },
    });
    const result = adaptMessageToCard(msg);
    const sub = result?.data.phases[0].sub;
    expect(sub).toHaveLength(2);
    expect(sub[0].name).toBe('src');
    expect(sub[0].status).toBe('running');
    expect(sub[1].name).toBe('src/utils');
    expect(sub[1].status).toBe('pending');
  });
});
