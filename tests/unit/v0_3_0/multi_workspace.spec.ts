/**
 * 多目录/工作区功能 - 单元测试
 *
 * TDD 原则: 先写测试，后写实现
 *
 * 功能定义:
 * - WorkspaceRoot: 工作区根目录定义
 * - addWorkspaceRoot(): 添加目录到工作区
 * - removeWorkspaceRoot(): 从工作区移除目录
 * - getActiveRoot(): 获取当前活动根目录
 * - setActiveRoot(): 切换活动根目录
 */

import { describe, it, expect, beforeEach } from 'vitest';

// ============================================================================
// 类型定义 (先定义接口)
// ============================================================================

export interface WorkspaceRoot {
  id: string;
  path: string;
  name: string;
  fileTree: FileNode | null;
  isActive: boolean;
  indexedAt: Date | null;
}

export interface FileNode {
  id: string;
  name: string;
  path: string;
  kind: 'file' | 'directory';
  children?: FileNode[];
}

export interface MultiWorkspaceState {
  roots: WorkspaceRoot[];
  activeRootId: string | null;
}

// ============================================================================
// WorkspaceStore 接口
// ============================================================================

export interface IMultiWorkspaceStore {
  // 状态
  roots: WorkspaceRoot[];
  activeRootId: string | null;

  // 操作
  addWorkspaceRoot(path: string): Promise<WorkspaceRoot>;
  removeWorkspaceRoot(rootId: string): void;
  setActiveRoot(rootId: string): void;
  getActiveRoot(): WorkspaceRoot | null;
  refreshRoot(rootId: string): Promise<void>;

  // 查询
  getRootByPath(path: string): WorkspaceRoot | null;
  getAllPaths(): string[];
}

// ============================================================================
// Mock 实现 (用于社区版测试)
// ============================================================================

export class MockMultiWorkspaceStore implements IMultiWorkspaceStore {
  roots: WorkspaceRoot[] = [];
  activeRootId: string | null = null;

  async addWorkspaceRoot(path: string): Promise<WorkspaceRoot> {
    // 检查路径是否已存在
    const existing = this.roots.find(r => r.path === path);
    if (existing) {
      throw new Error(`Path already exists: ${path}`);
    }

    // 提取目录名
    const name = path.split('/').filter(Boolean).pop() || 'Project';

    const root: WorkspaceRoot = {
      id: `root-${Date.now()}-${Math.random()}`,
      path,
      name,
      fileTree: null,
      isActive: this.roots.length === 0, // 第一个根目录自动设为活动
      indexedAt: null,
    };

    this.roots.push(root);

    // 如果是第一个根目录，设为活动
    if (this.roots.length === 1) {
      this.activeRootId = root.id;
    }

    return root;
  }

  removeWorkspaceRoot(rootId: string): void {
    const index = this.roots.findIndex(r => r.id === rootId);
    if (index === -1) {
      throw new Error(`Root not found: ${rootId}`);
    }

    this.roots.splice(index, 1);

    // 如果移除的是活动根目录，切换到另一个
    if (this.activeRootId === rootId) {
      this.activeRootId = this.roots.length > 0 ? this.roots[0].id : null;
    }
  }

  setActiveRoot(rootId: string): void {
    const root = this.roots.find(r => r.id === rootId);
    if (!root) {
      throw new Error(`Root not found: ${rootId}`);
    }

    this.activeRootId = rootId;
  }

  getActiveRoot(): WorkspaceRoot | null {
    if (!this.activeRootId) return null;
    return this.roots.find(r => r.id === this.activeRootId) || null;
  }

  async refreshRoot(rootId: string): Promise<void> {
    const root = this.roots.find(r => r.id === rootId);
    if (!root) {
      throw new Error(`Root not found: ${rootId}`);
    }

    // 模拟刷新
    root.indexedAt = new Date();
  }

  getRootByPath(path: string): WorkspaceRoot | null {
    return this.roots.find(r => r.path === path) || null;
  }

  getAllPaths(): string[] {
    return this.roots.map(r => r.path);
  }
}

// ============================================================================
// 测试套件
// ============================================================================

describe('MultiWorkspaceStore - TDD 测试', () => {
  let store: MockMultiWorkspaceStore;

  beforeEach(() => {
    store = new MockMultiWorkspaceStore();
  });

  /**
   * WS-UNIT-01: 添加第一个工作区根目录
   */
  describe('添加工作区根目录', () => {
    it('应该成功添加第一个根目录并自动设为活动', async () => {
      const root = await store.addWorkspaceRoot('/Users/test/my-app');

      expect(root.path).toBe('/Users/test/my-app');
      expect(root.name).toBe('my-app');
      expect(root.isActive).toBe(true);
      expect(store.activeRootId).toBe(root.id);
      expect(store.roots).toHaveLength(1);
    });

    it('应该成功添加多个根目录', async () => {
      const root1 = await store.addWorkspaceRoot('/Users/test/my-app');
      const root2 = await store.addWorkspaceRoot('/Users/test/shared-lib');

      expect(store.roots).toHaveLength(2);
      expect(root1.isActive).toBe(true);
      expect(root2.isActive).toBe(false); // 第二个不自动设为活动
    });

    it('应该拒绝重复添加相同路径', async () => {
      await store.addWorkspaceRoot('/Users/test/my-app');

      await expect(store.addWorkspaceRoot('/Users/test/my-app'))
        .rejects.toThrow('Path already exists');
    });

    it('应该从路径提取目录名作为根名称', async () => {
      const root = await store.addWorkspaceRoot('/Users/test/my-awesome-app');

      expect(root.name).toBe('my-awesome-app');
    });

    it('应该处理没有路径分隔符的路径', async () => {
      const root = await store.addWorkspaceRoot('single-folder');

      expect(root.name).toBe('single-folder');
    });
  });

  /**
   * WS-UNIT-02: 移除工作区根目录
   */
  describe('移除工作区根目录', () => {
    it('应该成功移除根目录', async () => {
      const root1 = await store.addWorkspaceRoot('/Users/test/my-app');
      const root2 = await store.addWorkspaceRoot('/Users/test/shared-lib');

      store.removeWorkspaceRoot(root1.id);

      expect(store.roots).toHaveLength(1);
      expect(store.roots[0].id).toBe(root2.id);
    });

    it('移除活动根目录时应切换到其他根目录', async () => {
      const root1 = await store.addWorkspaceRoot('/Users/test/my-app');
      const root2 = await store.addWorkspaceRoot('/Users/test/shared-lib');

      expect(store.activeRootId).toBe(root1.id);

      store.removeWorkspaceRoot(root1.id);

      expect(store.activeRootId).toBe(root2.id);
    });

    it('移除最后一个根目录时应清空活动根目录', async () => {
      const root1 = await store.addWorkspaceRoot('/Users/test/my-app');

      store.removeWorkspaceRoot(root1.id);

      expect(store.activeRootId).toBeNull();
      expect(store.roots).toHaveLength(0);
    });

    it('应该拒绝移除不存在的根目录', () => {
      expect(() => store.removeWorkspaceRoot('non-existent'))
        .toThrow('Root not found');
    });
  });

  /**
   * WS-UNIT-03: 切换活动根目录
   */
  describe('切换活动根目录', () => {
    it('应该成功切换活动根目录', async () => {
      const root1 = await store.addWorkspaceRoot('/Users/test/my-app');
      const root2 = await store.addWorkspaceRoot('/Users/test/shared-lib');

      store.setActiveRoot(root2.id);

      expect(store.activeRootId).toBe(root2.id);
    });

    it('getActiveRoot 应返回当前活动根目录', async () => {
      const root1 = await store.addWorkspaceRoot('/Users/test/my-app');
      const root2 = await store.addWorkspaceRoot('/Users/test/shared-lib');

      let active = store.getActiveRoot();
      expect(active?.id).toBe(root1.id);

      store.setActiveRoot(root2.id);

      active = store.getActiveRoot();
      expect(active?.id).toBe(root2.id);
    });

    it('应该拒绝切换到不存在的根目录', async () => {
      await store.addWorkspaceRoot('/Users/test/my-app');

      expect(() => store.setActiveRoot('non-existent'))
        .toThrow('Root not found');
    });
  });

  /**
   * WS-UNIT-04: 查询功能
   */
  describe('查询功能', () => {
    it('getRootByPath 应找到匹配的根目录', async () => {
      await store.addWorkspaceRoot('/Users/test/my-app');
      await store.addWorkspaceRoot('/Users/test/shared-lib');

      const found = store.getRootByPath('/Users/test/shared-lib');

      expect(found).toBeDefined();
      expect(found?.name).toBe('shared-lib');
    });

    it('getRootByPath 找不到时应返回 null', async () => {
      await store.addWorkspaceRoot('/Users/test/my-app');

      const found = store.getRootByPath('/nonexistent/path');

      expect(found).toBeNull();
    });

    it('getAllPaths 应返回所有根目录路径', async () => {
      await store.addWorkspaceRoot('/Users/test/my-app');
      await store.addWorkspaceRoot('/Users/test/shared-lib');

      const paths = store.getAllPaths();

      expect(paths).toEqual([
        '/Users/test/my-app',
        '/Users/test/shared-lib'
      ]);
    });
  });

  /**
   * WS-UNIT-05: 刷新根目录
   */
  describe('刷新根目录', () => {
    it('应该成功刷新存在的根目录', async () => {
      const root = await store.addWorkspaceRoot('/Users/test/my-app');

      expect(root.indexedAt).toBeNull();

      await store.refreshRoot(root.id);

      const refreshed = store.roots.find(r => r.id === root.id);
      expect(refreshed?.indexedAt).toBeInstanceOf(Date);
    });

    it('应该拒绝刷新不存在的根目录', async () => {
      await expect(store.refreshRoot('non-existent'))
        .rejects.toThrow('Root not found');
    });
  });
});

/**
 * 场景测试: 跨仓库依赖工作流
 */
describe('MultiWorkspaceStore - 跨仓库场景', () => {
  let store: MockMultiWorkspaceStore;

  beforeEach(() => {
    store = new MockMultiWorkspaceStore();
  });

  it('应该支持主项目 + 共享库的工作区配置', async () => {
    // 场景: 用户打开 my-app 和 shared-lib 两个目录
    const appRoot = await store.addWorkspaceRoot('/Users/test/my-app');
    const sharedRoot = await store.addWorkspaceRoot('/Users/test/shared-lib');

    // 验证: 两个目录都在工作区中
    expect(store.roots).toHaveLength(2);

    // 验证: 第一个目录是活动目录
    expect(store.getActiveRoot()?.id).toBe(appRoot.id);

    // 场景: 用户需要查看 shared-lib 的代码
    store.setActiveRoot(sharedRoot.id);
    expect(store.getActiveRoot()?.name).toBe('shared-lib');
  });

  it('应该支持动态添加和移除根目录', async () => {
    // 初始: 只有一个项目
    const root1 = await store.addWorkspaceRoot('/Users/test/my-app');
    expect(store.roots).toHaveLength(1);

    // 添加: 共享库
    const root2 = await store.addWorkspaceRoot('/Users/test/shared-lib');
    expect(store.roots).toHaveLength(2);

    // 移除: 共享库
    store.removeWorkspaceRoot(root2.id);
    expect(store.roots).toHaveLength(1);
    expect(store.roots[0].id).toBe(root1.id);
  });
});
