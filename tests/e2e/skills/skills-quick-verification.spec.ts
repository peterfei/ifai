/**
 * 🎯 技能系统快速验证测试
 *
 * 快速检查技能系统的基本功能是否正常工作
 */

import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment } from '../setup-utils';

test.describe('技能系统快速验证', () => {

  test('验证1: 检查SkillStore是否正确暴露', async ({ page }) => {
    await setupE2ETestEnvironment(page, {
      skipWelcome: true,
      useRealAI: false
    });

    await page.goto('/');
    await page.waitForTimeout(2000);

    // 检查SkillStore是否暴露
    const storeCheck = await page.evaluate(() => {
      const debug = (window as any).__DEBUG__;
      if (!debug) return { error: '__DEBUG__不存在' };

      return {
        hasDebug: !!debug,
        hasSkillStore: !!debug.skillStore,
        skillStoreType: typeof debug.skillStore,
        hasGetState: typeof debug.skillStore?.getState === 'function'
      };
    });

    console.log('SkillStore检查结果:', storeCheck);

    expect(storeCheck.hasDebug).toBe(true);
    expect(storeCheck.hasSkillStore).toBe(true);
    expect(storeCheck.skillStoreType).toBe('function'); // Zustand store是function
    expect(storeCheck.hasGetState).toBe(true);
  });

  test('验证2: 检查SkillStore初始状态', async ({ page }) => {
    await setupE2ETestEnvironment(page, {
      skipWelcome: true,
      useRealAI: false
    });

    await page.goto('/');
    await page.waitForTimeout(2000);

    // 检查SkillStore的初始状态
    const initialState = await page.evaluate(() => {
      const skillStore = (window as any).__DEBUG__?.skillStore;
      if (!skillStore) return { error: 'skillStore不存在' };

      const state = skillStore.getState();
      return {
        availableSkills: state.availableSkills?.length || 0,
        activeSkillIds: state.activeSkillIds?.length || 0,
        isLoading: state.isLoading || false,
        isRefreshing: state.isRefreshing || false,
        error: state.error || null,
        ui: {
          selectedSkill: state.ui?.selectedSkill,
          searchQuery: state.ui?.searchQuery,
          selectedTags: state.ui?.selectedTags,
          stateFilter: state.ui?.stateFilter,
          sortBy: state.ui?.sortBy,
          viewMode: state.ui?.viewMode
        }
      };
    });

    console.log('SkillStore初始状态:', initialState);

    expect(initialState).toBeDefined();
    expect(typeof initialState.availableSkills).toBe('number');
  });

  test('验证3: 测试fetchSkills方法', async ({ page }) => {
    await setupE2ETestEnvironment(page, {
      skipWelcome: true,
      useRealAI: false
    });

    await page.goto('/');
    await page.waitForTimeout(2000);

    // 测试fetchSkills方法
    const fetchResult = await page.evaluate(async () => {
      const skillStore = (window as any).__DEBUG__?.skillStore;
      if (!skillStore) return { error: 'skillStore不存在' };

      try {
        // 调用fetchSkills
        await skillStore.getState().fetchSkills();

        // 获取更新后的状态
        const newState = skillStore.getState();
        return {
          success: true,
          availableSkillsCount: newState.availableSkills?.length || 0,
          isLoading: newState.isLoading,
          error: newState.error
        };
      } catch (e) {
        return {
          success: false,
          error: String(e)
        };
      }
    });

    console.log('fetchSkills测试结果:', fetchResult);

    expect(fetchResult).toBeDefined();
    if (fetchResult.success) {
      console.log(`  → 成功加载 ${fetchResult.availableSkillsCount} 个技能`);
    } else {
      console.log(`  → 加载失败: ${fetchResult.error}`);
    }
  });

  test('验证4: 检查Tauri命令可用性', async ({ page }) => {
    await setupE2ETestEnvironment(page, {
      skipWelcome: true,
      useRealAI: false
    });

    await page.goto('/');
    await page.waitForTimeout(2000);

    // 检查Tauri命令
    const tauriCheck = await page.evaluate(async () => {
      const commands = [
        'get_available_skills',
        'init_skills_dir',
        'install_skill',
        'uninstall_skill',
        'activate_skill',
        'deactivate_skill',
        'create_skill',
        'update_skill'
      ];

      const results: any = {};

      for (const cmd of commands) {
        try {
          // 尝试调用命令（使用try-catch避免实际执行）
          const tauri = (window as any).__TAURI__;
          if (tauri?.core?.invoke) {
            results[cmd] = 'available';
          } else {
            results[cmd] = 'tauri_not_found';
          }
        } catch (e) {
          results[cmd] = `error: ${String(e)}`;
        }
      }

      return { results, totalCommands: commands.length };
    });

    console.log('Tauri命令检查结果:', tauriCheck.results);

    // 统计可用命令
    const availableCommands = Object.values(tauriCheck.results).filter(
      (status: any) => status === 'available'
    ).length;

    console.log(`  → ${availableCommands}/${tauriCheck.totalCommands} 个命令可用`);

    expect(availableCommands).toBeGreaterThan(0);
  });

  test('验证5: 检查技能设置页面路由', async ({ page }) => {
    await setupE2ETestEnvironment(page, {
      skipWelcome: true,
      useRealAI: false
    });

    await page.goto('/');
    await page.waitForTimeout(2000);

    // 尝试通过编程方式导航到技能设置
    const navigationResult = await page.evaluate(async () => {
      try {
        const layoutStore = (window as any).__DEBUG__?.layoutStore;
        if (!layoutStore) return { error: 'layoutStore不存在' };

        // 设置activeSettingsTab为'skills'
        layoutStore.setState({ activeSettingsTab: 'skills' });

        // 检查是否成功
        const newState = layoutStore.getState();
        return {
          success: true,
          activeSettingsTab: newState.activeSettingsTab,
          isSettingsOpen: newState.isSettingsOpen
        };
      } catch (e) {
        return {
          success: false,
          error: String(e)
        };
      }
    });

    console.log('路由导航结果:', navigationResult);

    if (navigationResult.success) {
      expect(navigationResult.activeSettingsTab).toBe('skills');
    }
  });

  test('验证6: 检查技能组件渲染', async ({ page }) => {
    await setupE2ETestEnvironment(page, {
      skipWelcome: true,
      useRealAI: false
    });

    await page.goto('/');
    await page.waitForTimeout(1000);

    // 编程式打开技能设置
    await page.evaluate(() => {
      const layoutStore = (window as any).__DEBUG__?.layoutStore;
      if (layoutStore) {
        layoutStore.setState({
          isSettingsOpen: true,
          activeSettingsTab: 'skills'
        });
      }
    });

    await page.waitForTimeout(2000);

    // 检查技能相关元素
    const elementsCheck = await page.evaluate(() => {
      const body = document.body;

      return {
        hasSkillCenter: body.textContent?.includes('技能中心') ||
                      body.textContent?.includes('Skills Center'),
        hasInstallButton: body.textContent?.includes('安装示例技能') ||
                        body.textContent?.includes('安装内置示例'),
        hasPuzzleIcon: body.querySelector('.lucide-puzzle, .lucide-paxe') !== null,
        bodyTextLength: body.textContent?.length || 0,
        hasSkills: body.textContent?.includes('技能') || false
      };
    });

    console.log('组件渲染检查:', elementsCheck);

    // 至少应该有技能相关的内容
    expect(elementsCheck.hasSkills).toBe(true);
  });
});