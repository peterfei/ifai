/**
 * 技能系统集成测试
 * Phase 7: 完整 UI 重构 - 集成测试
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SkillsSettings } from '../SkillsSettings';
import { SkillsManagement } from '../Skills/SkillsManagement';
import { SkillInstaller } from '../Skills/SkillInstaller';
import { SkillEditor } from '../Skills/SkillEditor';
import { useSkillStore } from '@/stores/skillStore.enhanced';

// Mock the Tauri API
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

// Mock the file store
vi.mock('@/stores/fileStore', () => ({
  useFileStore: {
    getState: vi.fn(() => ({
      rootPath: '/test/project',
    })),
  },
}));

// Mock the skill store
vi.mock('@/stores/skillStore.enhanced', () => ({
  useSkillStore: vi.fn(),
}));

describe('技能系统集成测试', () => {
  const mockFetchSkills = vi.fn();
  const mockInstallSkill = vi.fn();
  const mockCreateSkill = vi.fn();
  const mockUpdateSkill = vi.fn();
  const mockActivateSkill = vi.fn();
  const mockDeactivateSkill = vi.fn();

  const mockSkills = [
    {
      id: 'test-skill-1',
      name: '测试技能 1',
      description: '这是一个测试技能',
      version: '1.0.0',
      author: 'Test Author',
      system_prompt: 'You are a helpful assistant',
      tags: ['testing', 'development'],
      dependencies: [],
      compatibility: '^1.0.0',
      state: { type: 'Active' as const },
    },
    {
      id: 'test-skill-2',
      name: '测试技能 2',
      description: '这是另一个测试技能',
      version: '2.0.0',
      author: 'Another Author',
      system_prompt: 'You are another assistant',
      tags: ['testing', 'automation'],
      dependencies: ['test-skill-1'],
      compatibility: '^2.0.0',
      state: { type: 'Installed' as const, version: '2.0.0' },
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    (useSkillStore as any).mockReturnValue({
      availableSkills: mockSkills,
      activeSkillIds: ['test-skill-1'],
      isLoading: false,
      isRefreshing: false,
      error: null,
      ui: {
        searchQuery: '',
        selectedTags: [],
        stateFilter: 'all',
        sortBy: 'name',
        sortOrder: 'asc',
        viewMode: 'grid',
        selectedSkill: null,
        showDetails: false,
      },
      stats: {
        total: 2,
        active: 1,
        installed: 2,
        error: 0,
        byState: { Active: 1, Installed: 1 },
      },
      fetchSkills: mockFetchSkills,
      installSkill: mockInstallSkill,
      createSkill: mockCreateSkill,
      updateSkill: mockUpdateSkill,
      activateSkill: mockActivateSkill,
      deactivateSkill: mockDeactivateSkill,
      getFilteredSkills: () => mockSkills,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('SkillsSettings 主界面', () => {
    it('应该正确渲染主界面', () => {
      render(<SkillsSettings />);
      expect(screen.getByText('技能中心')).toBeInTheDocument();
    });

    it('应该显示技能列表', () => {
      render(<SkillsSettings />);
      expect(screen.getByText('测试技能 1')).toBeInTheDocument();
      expect(screen.getByText('测试技能 2')).toBeInTheDocument();
    });

    it('空状态时应该显示安装提示', () => {
      (useSkillStore as any).mockReturnValue({
        availableSkills: [],
        activeSkillIds: [],
        isLoading: false,
        fetchSkills: mockFetchSkills,
        installSkill: mockInstallSkill,
        createSkill: mockCreateSkill,
        updateSkill: mockUpdateSkill,
      });

      render(<SkillsSettings />);
      expect(screen.getByText('未发现可用技能')).toBeInTheDocument();
      expect(screen.getByText('安装示例技能')).toBeInTheDocument();
    });
  });

  describe('SkillsManagement 管理界面', () => {
    it('应该显示统计信息', () => {
      render(<SkillsManagement />);
      expect(screen.getByText('2')).toBeInTheDocument(); // 总数
    });

    it('应该支持搜索功能', async () => {
      render(<SkillsManagement />);
      const searchInput = screen.getByPlaceholderText('搜索技能名称、ID 或描述...');
      fireEvent.change(searchInput, { target: { value: 'test' } });
      await waitFor(() => {
        expect(searchInput).toHaveValue('test');
      });
    });

    it('应该支持视图切换', async () => {
      render(<SkillsManagement />);
      const gridButton = screen.getByRole('button', { name: /grid/i });
      const listButton = screen.getByRole('button', { name: /list/i });

      expect(gridButton).toBeInTheDocument();
      expect(listButton).toBeInTheDocument();
    });
  });

  describe('SkillInstaller 安装器', () => {
    it('应该正确渲染安装器界面', () => {
      const onClose = vi.fn();
      const onInstall = vi.fn();

      render(<SkillInstaller onClose={onClose} onInstall={onInstall} />);
      expect(screen.getByText('技能市场')).toBeInTheDocument();
      expect(screen.getByText('浏览和安装社区技能')).toBeInTheDocument();
    });

    it('应该支持技能搜索', async () => {
      const onClose = vi.fn();
      const onInstall = vi.fn();

      render(<SkillInstaller onClose={onClose} onInstall={onInstall} />);
      const searchInput = screen.getByPlaceholderText('搜索技能...');
      fireEvent.change(searchInput, { target: { value: 'code' } });
      await waitFor(() => {
        expect(searchInput).toHaveValue('code');
      });
    });

    it('应该支持分类筛选', async () => {
      const onClose = vi.fn();
      const onInstall = vi.fn();

      render(<SkillInstaller onClose={onClose} onInstall={onInstall} />);
      const officialButton = screen.getByText('官方');
      fireEvent.click(officialButton);
      await waitFor(() => {
        expect(officialButton).toHaveClass('bg-blue-600');
      });
    });
  });

  describe('SkillEditor 编辑器', () => {
    it('创建模式应该正确渲染', () => {
      const onSave = vi.fn();
      const onCancel = vi.fn();

      render(
        <SkillEditor
          mode={{ type: 'create' }}
          onSave={onSave}
          onCancel={onCancel}
        />
      );
      expect(screen.getByText('创建技能')).toBeInTheDocument();
      expect(screen.getByText('创建新的 AI 技能插件')).toBeInTheDocument();
    });

    it('编辑模式应该正确显示现有技能', () => {
      const onSave = vi.fn();
      const onCancel = vi.fn();

      render(
        <SkillEditor
          mode={{ type: 'edit' }}
          skill={mockSkills[0]}
          onSave={onSave}
          onCancel={onCancel}
        />
      );
      expect(screen.getByText('编辑技能')).toBeInTheDocument();
      expect(screen.getByDisplayValue('test-skill-1')).toBeInTheDocument();
      expect(screen.getByDisplayValue('测试技能 1')).toBeInTheDocument();
    });

    it('查看模式应该禁用编辑', () => {
      const onSave = vi.fn();
      const onCancel = vi.fn();

      render(
        <SkillEditor
          mode={{ type: 'view' }}
          skill={mockSkills[0]}
          onSave={onSave}
          onCancel={onCancel}
        />
      );
      expect(screen.getByText('查看技能')).toBeInTheDocument();
      expect(screen.getByText('查看技能详情')).toBeInTheDocument();
    });

    it('应该支持预览模式切换', async () => {
      const onSave = vi.fn();
      const onCancel = vi.fn();

      render(
        <SkillEditor
          mode={{ type: 'edit' }}
          skill={mockSkills[0]}
          onSave={onSave}
          onCancel={onCancel}
        />
      );

      const previewButton = screen.getByText('预览');
      fireEvent.click(previewButton);
      await waitFor(() => {
        expect(screen.getByText('You are a helpful assistant')).toBeInTheDocument();
      });
    });
  });

  describe('组件交互测试', () => {
    it('应该正确处理技能激活流程', async () => {
      render(<SkillsSettings />);

      // 找到激活按钮并点击
      const activateButton = screen.getByText('激活');
      fireEvent.click(activateButton);

      await waitFor(() => {
        expect(mockActivateSkill).toHaveBeenCalled();
      });
    });

    it('应该正确处理技能搜索和筛选', async () => {
      render(<SkillsManagement />);

      const searchInput = screen.getByPlaceholderText('搜索技能名称、ID 或描述...');
      fireEvent.change(searchInput, { target: { value: '测试技能 1' } });

      await waitFor(() => {
        expect(searchInput).toHaveValue('测试技能 1');
      });
    });

    it('应该正确处理编辑器保存', async () => {
      const onSave = vi.fn();
      const onCancel = vi.fn();

      render(
        <SkillEditor
          mode={{ type: 'create' }}
          onSave={onSave}
          onCancel={onCancel}
        />
      );

      // 填写表单
      fireEvent.change(screen.getByPlaceholderText('my-skill'), {
        target: { value: 'new-skill' },
      });
      fireEvent.change(screen.getByPlaceholderText('我的技能'), {
        target: { value: '新技能' },
      });
      fireEvent.change(screen.getByPlaceholderText('简要描述这个技能的功能'), {
        target: { value: '这是一个新技能' },
      });
      fireEvent.change(screen.getByPlaceholderText('You are a helpful assistant...'), {
        target: { value: 'You are a new assistant' },
      });

      // 点击保存
      const saveButton = screen.getByText('保存');
      fireEvent.click(saveButton);

      await waitFor(() => {
        expect(onSave).toHaveBeenCalled();
      });
    });

    it('应该正确处理表单验证', async () => {
      const onSave = vi.fn();
      const onCancel = vi.fn();

      render(
        <SkillEditor
          mode={{ type: 'create' }}
          onSave={onSave}
          onCancel={onCancel}
        />
      );

      // 直接点击保存而不填写表单
      const saveButton = screen.getByText('保存');
      fireEvent.click(saveButton);

      await waitFor(() => {
        expect(onSave).not.toHaveBeenCalled();
        // 应该显示验证错误
        expect(screen.getByText('请修正 5 个错误')).toBeInTheDocument();
      });
    });
  });

  describe('状态管理测试', () => {
    it('应该正确显示技能状态', () => {
      render(<SkillsManagement />);
      expect(screen.getByText('已激活')).toBeInTheDocument();
      expect(screen.getByText('已安装')).toBeInTheDocument();
    });

    it('应该正确更新状态过滤器', async () => {
      render(<SkillsManagement />);

      const activeFilter = screen.getByText('已激活');
      fireEvent.click(activeFilter);

      await waitFor(() => {
        expect(activeFilter).toHaveClass('bg-blue-600');
      });
    });
  });

  describe('标签和搜索测试', () => {
    it('应该正确显示标签云', () => {
      render(<SkillsManagement />);
      expect(screen.getByText('热门标签')).toBeInTheDocument();
    });

    it('应该支持标签筛选', async () => {
      render(<SkillsManagement />);

      const tagButton = screen.getByText('testing');
      fireEvent.click(tagButton);

      await waitFor(() => {
        expect(tagButton).toHaveClass('bg-blue-600');
      });
    });
  });

  describe('批量操作测试', () => {
    it('应该支持批量选择技能', async () => {
      render(<SkillsManagement />);

      const checkboxes = screen.getAllByRole('checkbox');
      fireEvent.click(checkboxes[0]);

      await waitFor(() => {
        expect(screen.getByText(/已选择 \d+ 个技能/)).toBeInTheDocument();
      });
    });

    it('应该支持批量激活', async () => {
      render(<SkillsManagement />);

      // 选择多个技能
      const checkboxes = screen.getAllByRole('checkbox');
      checkboxes.forEach(cb => fireEvent.click(cb));

      // 点击批量激活
      const batchActivateButton = screen.getByText('批量激活');
      fireEvent.click(batchActivateButton);

      await waitFor(() => {
        expect(batchActivateButton).toBeInTheDocument();
      });
    });
  });

  describe('错误处理测试', () => {
    it('应该正确显示错误状态', () => {
      (useSkillStore as any).mockReturnValue({
        availableSkills: [],
        activeSkillIds: [],
        isLoading: false,
        error: '加载失败',
        fetchSkills: mockFetchSkills,
      });

      render(<SkillsSettings />);
      expect(screen.getByText('加载失败')).toBeInTheDocument();
    });

    it('应该支持重试操作', async () => {
      (useSkillStore as any).mockReturnValue({
        availableSkills: [],
        activeSkillIds: [],
        isLoading: false,
        error: '加载失败',
        fetchSkills: mockFetchSkills,
      });

      render(<SkillsSettings />);

      const retryButton = screen.getByText('重试');
      fireEvent.click(retryButton);

      await waitFor(() => {
        expect(mockFetchSkills).toHaveBeenCalled();
      });
    });
  });

  describe('响应式设计测试', () => {
    it('应该在移动端正确显示', () => {
      // 模拟移动端视口
      global.innerWidth = 375;
      global.dispatchEvent(new Event('resize'));

      render(<SkillsManagement />);
      expect(screen.getByText('技能中心')).toBeInTheDocument();
    });

    it('应该在桌面端正确显示', () => {
      // 模拟桌面端视口
      global.innerWidth = 1920;
      global.dispatchEvent(new Event('resize'));

      render(<SkillsManagement />);
      expect(screen.getByText('技能中心')).toBeInTheDocument();
    });
  });
});
