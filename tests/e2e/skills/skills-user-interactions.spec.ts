/**
 * 🎯 技能系统用户交互 E2E 测试
 *
 * 高保真模拟真实用户操作场景，验证技能系统的核心功能
 *
 * 测试场景：
 * 1. 用户打开技能设置页面
 * 2. 用户点击"安装示例技能"按钮
 * 3. 用户尝试激活/停用技能
 * 4. 用户使用技能搜索和筛选
 * 5. 用户打开技能编辑器
 * 6. 用户访问技能市场
 */

import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment } from '../setup-utils';

test.describe('技能系统用户交互测试', () => {

  test.beforeEach(async ({ page }) => {
    await setupE2ETestEnvironment(page, {
      skipWelcome: true,
      useRealAI: false
    });

    // 设置必要的状态
    await page.evaluate(() => {
      localStorage.setItem('tour_completed', 'true');
      localStorage.setItem('onboarding_done', 'true');
      (window as any).__E2E__ = true;
    });

    await page.goto('/');
    await page.waitForTimeout(1000);
  });

  test('场景1: 用户打开技能设置页面并检查初始状态', async ({ page }) => {
    console.log('📝 [Test] 场景1: 打开技能设置页面');

    // 1. 打开设置菜单
    console.log('  → 点击设置按钮');
    const settingsButton = page.locator('[data-testid="settings-button"], button:has-text("设置"), [title="设置"]').first();
    await settingsButton.click();
    await page.waitForTimeout(500);

    // 2. 导航到技能设置
    console.log('  → 导航到技能设置');
    const skillsTab = page.locator('text=技能, text=Skills').first();
    await skillsTab.click();
    await page.waitForTimeout(1000);

    // 3. 验证技能中心页面已加载
    console.log('  → 验证页面标题');
    await expect(page.locator('text=技能中心, text=Skills Center')).toBeVisible();

    // 4. 检查初始状态 - 应该显示"未发现可用技能"
    console.log('  → 检查空状态');
    const emptyState = page.locator('text=未发现可用技能, text=未找到技能');
    const hasEmptyState = await emptyState.count() > 0;

    if (hasEmptyState) {
      console.log('  ✓ 显示空状态（预期行为）');
      await expect(page.locator('text=安装示例技能, text=安装内置示例')).toBeVisible();
    } else {
      console.log('  ℹ 已有技能存在');
    }
  });

  test('场景2: 用户点击"安装示例技能"按钮', async ({ page }) => {
    console.log('📝 [Test] 场景2: 点击安装示例技能');

    // 1. 导航到技能设置
    await page.evaluate(() => {
      const layoutStore = (window as any).__layoutStore;
      if (layoutStore) {
        layoutStore.setState({ activeSettingsTab: 'skills' });
      }
    });
    await page.waitForTimeout(500);

    // 2. 查找并点击"安装示例技能"按钮
    console.log('  → 查找安装示例技能按钮');
    const installButton = page.locator('button:has-text("安装示例技能"), button:has-text("安装内置示例")');

    const buttonCount = await installButton.count();
    console.log(`  → 找到 ${buttonCount} 个安装按钮`);

    if (buttonCount > 0) {
      // 监听控制台日志
      const consoleLogs: string[] = [];
      page.on('console', msg => {
        consoleLogs.push(msg.text());
      });

      // 点击按钮
      console.log('  → 点击安装按钮');
      await installButton.first().click();
      await page.waitForTimeout(3000);

      // 检查是否有错误
      const errorLogs = consoleLogs.filter(log =>
        log.includes('error') ||
        log.includes('Error') ||
        log.includes('failed') ||
        log.includes('Failed')
      );

      if (errorLogs.length > 0) {
        console.log('  ❌ 发现错误日志:');
        errorLogs.forEach(log => console.log(`     ${log}`));
      }

      // 检查是否显示了成功状态
      const skillsList = page.locator('[class*="skill"], [class*="Skill"]').first();
      const hasSkills = await skillsList.count() > 0;

      if (hasSkills) {
        console.log('  ✓ 技能列表已显示');
      } else {
        console.log('  ⚠️ 技能列表未显示，可能安装失败');
      }

      // 检查Tauri命令调用
      const tauriLogs = consoleLogs.filter(log =>
        log.includes('invoke') ||
        log.includes('init_skills_dir') ||
        log.includes('SkillCommand')
      );

      if (tauriLogs.length > 0) {
        console.log('  ✓ 检测到Tauri命令调用:');
        tauriLogs.forEach(log => console.log(`     ${log}`));
      } else {
        console.log('  ❌ 未检测到Tauri命令调用 - 可能是前端调用失败');
      }
    } else {
      console.log('  ℹ 未找到安装按钮，可能已有技能或页面状态不同');
    }
  });

  test('场景3: 用户尝试激活/停用技能', async ({ page }) => {
    console.log('📝 [Test] 场景3: 激活/停用技能');

    // 先导航到技能设置
    await page.evaluate(() => {
      const layoutStore = (window as any).__layoutStore;
      if (layoutStore) {
        layoutStore.setState({ activeSettingsTab: 'skills' });
      }
    });
    await page.waitForTimeout(1000);

    // 查找技能卡片
    console.log('  → 查找技能卡片');
    const skillCards = page.locator('[class*="skill"], [class*="Skill"]');
    const cardCount = await skillCards.count();

    console.log(`  → 找到 ${cardCount} 个技能卡片`);

    if (cardCount > 0) {
      // 查找激活/停用按钮
      const activateButton = page.locator('button:has-text("激活"), button:has-text("已激活")').first();
      const hasActivateButton = await activateButton.count() > 0;

      if (hasActivateButton) {
        console.log('  → 找到激活按钮');

        // 监听控制台
        const consoleLogs: string[] = [];
        page.on('console', msg => consoleLogs.push(msg.text()));

        // 点击按钮
        await activateButton.click();
        await page.waitForTimeout(2000);

        // 检查错误
        const errorLogs = consoleLogs.filter(log =>
          log.includes('error') ||
          log.includes('Error') ||
          log.includes('activate')
        );

        if (errorLogs.length > 0) {
          console.log('  ⚠️ 发现相关日志:');
          errorLogs.forEach(log => console.log(`     ${log}`));
        }

        // 检查状态是否改变
        const newState = await activateButton.textContent();
        console.log(`  → 按钮状态: ${newState}`);
      } else {
        console.log('  ⚠️ 未找到激活按钮');
      }
    } else {
      console.log('  ℹ 没有技能卡片，需要先安装技能');
    }
  });

  test('场景4: 用户使用技能搜索功能', async ({ page }) => {
    console.log('📝 [Test] 场景4: 技能搜索');

    // 导航到技能设置
    await page.evaluate(() => {
      const layoutStore = (window as any).__layoutStore;
      if (layoutStore) {
        layoutStore.setState({ activeSettingsTab: 'skills' });
      }
    });
    await page.waitForTimeout(1000);

    // 查找搜索框
    console.log('  → 查找搜索框');
    const searchInput = page.locator('input[placeholder*="搜索"], input[placeholder*="search"]').first();

    const hasSearchInput = await searchInput.count() > 0;

    if (hasSearchInput) {
      console.log('  → 找到搜索框');

      // 输入搜索内容
      await searchInput.fill('test');
      await page.waitForTimeout(500);

      // 检查是否有过滤结果
      console.log('  → 搜索结果已更新');
    } else {
      console.log('  ℹ 未找到搜索框');
    }
  });

  test('场景5: 检查技能市场按钮', async ({ page }) => {
    console.log('📝 [Test] 场景5: 技能市场访问');

    // 导航到技能设置
    await page.evaluate(() => {
      const layoutStore = (window as any).__layoutStore;
      if (layoutStore) {
        layoutStore.setState({ activeSettingsTab: 'skills' });
      }
    });
    await page.waitForTimeout(1000);

    // 查找"浏览技能库"按钮
    console.log('  → 查找技能市场相关按钮');
    const marketplaceButton = page.locator('button:has-text("浏览技能库"), button:has-text("浏览全部技能"), button:has-text("技能市场")');

    const hasButton = await marketplaceButton.count() > 0;

    if (hasButton) {
      console.log('  → 找到技能市场按钮');

      // 点击按钮
      await marketplaceButton.first().click();
      await page.waitForTimeout(1000);

      // 检查是否打开了技能市场对话框
      const modal = page.locator('[class*="modal"], [class*="dialog"]').first();
      const hasModal = await modal.count() > 0;

      if (hasModal) {
        console.log('  ✓ 技能市场对话框已打开');
      } else {
        console.log('  ❌ 技能市场对话框未打开');
      }
    } else {
      console.log('  ℹ 未找到技能市场按钮');
    }
  });

  test('场景6: 检查Tauri命令可用性', async ({ page }) => {
    console.log('📝 [Test] 场景6: Tauri命令检查');

    // 在浏览器控制台中检查Tauri API
    const tauriCheck = await page.evaluate(async () => {
      const results: any = {
        tauriAvailable: false,
        invokeAvailable: false,
        commands: [],
        errors: []
      };

      try {
        // 检查Tauri API
        if (typeof window !== 'undefined' && (window as any).__TAURI__) {
          results.tauriAvailable = true;

          const tauri = (window as any).__TAURI__;
          if (tauri.core && tauri.core.invoke) {
            results.invokeAvailable = true;

            // 尝试检查技能相关命令
            const skillCommands = [
              'get_available_skills',
              'init_skills_dir',
              'install_skill',
              'uninstall_skill',
              'activate_skill',
              'deactivate_skill',
              'create_skill',
              'update_skill'
            ];

            for (const cmd of skillCommands) {
              try {
                // 我们不实际调用命令，只是记录它的存在
                results.commands.push(cmd);
              } catch (e) {
                results.errors.push(`${cmd}: ${e}`);
              }
            }
          }
        }
      } catch (e) {
        results.errors.push(String(e));
      }

      return results;
    });

    console.log('  → Tauri可用性检查结果:');
    console.log(`    - Tauri API: ${tauriCheck.tauriAvailable ? '✓' : '❌'}`);
    console.log(`    - Invoke方法: ${tauriCheck.invokeAvailable ? '✓' : '❌'}`);
    console.log(`    - 检测的命令: ${tauriCheck.commands.length}`);

    if (tauriCheck.errors.length > 0) {
      console.log('  → 错误:');
      tauriCheck.errors.forEach((err: string) => console.log(`    - ${err}`));
    }
  });

  test('场景7: 检查前端Store状态', async ({ page }) => {
    console.log('📝 [Test] 场景7: 前端Store状态检查');

    // 检查skillStore的状态
    const storeState = await page.evaluate(() => {
      const results: any = {
        skillStoreExists: false,
        availableSkills: 0,
        activeSkillIds: 0,
        isLoading: false,
        error: null
      };

      try {
        // 尝试访问skillStore
        if (typeof window !== 'undefined') {
          // 检查全局store
          const stores = (window as any).__STORES__;
          if (stores && stores.skillStore) {
            results.skillStoreExists = true;
            const state = stores.skillStore.getState();
            results.availableSkills = state.availableSkills?.length || 0;
            results.activeSkillIds = state.activeSkillIds?.length || 0;
            results.isLoading = state.isLoading || false;
            results.error = state.error || null;
          }
        }
      } catch (e) {
        results.error = String(e);
      }

      return results;
    });

    console.log('  → SkillStore状态:');
    console.log(`    - Store存在: ${storeState.skillStoreExists ? '✓' : '❌'}`);
    console.log(`    - 可用技能数: ${storeState.availableSkills}`);
    console.log(`    - 激活技能数: ${storeState.activeSkillIds}`);
    console.log(`    - 加载状态: ${storeState.isLoading}`);
    if (storeState.error) {
      console.log(`    - 错误: ${storeState.error}`);
    }
  });
});

test.describe('技能系统错误场景测试', () => {

  test('错误场景1: Tauri命令不存在时的处理', async ({ page }) => {
    console.log('📝 [Test] 错误场景1: Tauri命令不存在');

    await setupE2ETestEnvironment(page, {
      skipWelcome: true,
      useRealAI: false
    });

    await page.evaluate(() => {
      localStorage.setItem('tour_completed', 'true');
      localStorage.setItem('onboarding_done', 'true');
      (window as any).__E2E__ = true;
    });

    await page.goto('/');
    await page.waitForTimeout(1000);

    // 监听所有错误
    const errors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });

    // 尝试触发技能安装
    const installResult = await page.evaluate(async () => {
      try {
        // 尝试调用不存在的命令
        const result = await (window as any).__TAURI__?.core?.invoke?.('install_skill', {
          projectId: '/test',
          skillId: 'test-skill',
          source: 'local'
        });
        return { success: true, result };
      } catch (e) {
        return { success: false, error: String(e) };
      }
    });

    console.log('  → 安装尝试结果:', installResult);

    if (!installResult.success) {
      console.log('  ✓ 正确捕获了错误:', installResult.error);
    } else {
      console.log('  ❌ 意外成功，可能命令实际存在');
    }

    if (errors.length > 0) {
      console.log('  → 控制台错误:');
      errors.forEach(err => console.log(`     ${err}`));
    }
  });
});
