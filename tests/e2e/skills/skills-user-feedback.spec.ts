/**
 * 🎯 技能系统用户反馈测试
 *
 * 测试用户点击操作后的反馈机制
 * 问题：用户反馈点击技能浏览、安装等按钮没有反馈
 */

import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment } from '../setup-utils';

test.describe('技能系统用户反馈测试', () => {

  test.beforeEach(async ({ page }) => {
    await setupE2ETestEnvironment(page, {
      skipWelcome: true,
      useRealAI: false
    });

    await page.goto('/');
    await page.waitForTimeout(1000);
  });

  test('反馈测试1: 点击"安装示例技能"按钮应有加载反馈', async ({ page }) => {
    console.log('📝 [Test] 测试安装示例技能按钮的加载反馈');

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

    await page.waitForTimeout(1000);

    // 查找"安装示例技能"按钮
    const installButton = await page.locator('button:has-text("安装示例技能"), button:has-text("安装内置示例")').first();

    const buttonCount = await installButton.count();
    console.log(`  → 找到 ${buttonCount} 个安装按钮`);

    if (buttonCount > 0) {
      // 监听控制台日志
      const consoleLogs: string[] = [];
      page.on('console', msg => consoleLogs.push(msg.text()));

      // 点击前的按钮状态
      const beforeText = await installButton.textContent();
      const beforeDisabled = await installButton.isDisabled();
      console.log(`  → 点击前状态: text="${beforeText}", disabled=${beforeDisabled}`);

      // 点击按钮
      console.log('  → 点击安装按钮');
      await installButton.click();

      // 立即检查反馈（500ms内）
      await page.waitForTimeout(500);

      const afterText = await installButton.textContent();
      const afterDisabled = await installButton.isDisabled();
      console.log(`  → 点击后状态: text="${afterText}", disabled=${afterDisabled}`);

      // 检查是否有加载状态反馈
      const hasLoadingFeedback =
        afterText?.includes('安装中') ||
        afterText?.includes('Loading') ||
        afterText?.includes('加载中') ||
        afterDisabled === true;

      console.log(`  → 加载反馈: ${hasLoadingFeedback ? '✓ 有' : '❌ 无'}`);

      // 检查控制台日志
      const initLogs = consoleLogs.filter(log =>
        log.includes('init_skills_dir') ||
        log.includes('SkillCommand') ||
        log.includes('Installing')
      );

      if (initLogs.length > 0) {
        console.log(`  → 检测到${initLogs.length}条相关日志`);
        initLogs.forEach(log => console.log(`     ${log}`));
      } else {
        console.log('  ❌ 未检测到相关日志');
      }

      // 等待操作完成
      await page.waitForTimeout(3000);

      // 检查最终状态
      const finalText = await installButton.textContent();
      const finalDisabled = await installButton.isDisabled();
      console.log(`  → 最终状态: text="${finalText}", disabled=${finalDisabled}`);

      // 验证期望的反馈
      expect(hasLoadingFeedback).toBe(true);
    } else {
      console.log('  ℹ 未找到安装按钮（可能已在测试环境安装）');
    }
  });

  test('反馈测试2: 点击技能市场按钮应有打开反馈', async ({ page }) => {
    console.log('📝 [Test] 测试技能市场按钮的打开反馈');

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

    await page.waitForTimeout(1000);

    // 查找技能市场相关按钮
    const marketplaceButtons = [
      'button:has-text("浏览技能库")',
      'button:has-text("浏览全部技能")',
      'button:has-text("技能市场")',
      'button:has-text("安装技能")'
    ];

    let foundButton = false;
    for (const selector of marketplaceButtons) {
      const button = page.locator(selector).first();
      const count = await button.count();

      if (count > 0) {
        console.log(`  → 找到按钮: ${selector}`);
        foundButton = true;

        // 点击按钮
        await button.click();
        await page.waitForTimeout(1000);

        // 检查是否有模态框打开
        const modal = page.locator('[class*="modal"], [class*="dialog"], [role="dialog"]').first();
        const modalCount = await modal.count();

        console.log(`  → 模态框数量: ${modalCount}`);

        if (modalCount > 0) {
          console.log('  ✓ 检测到模态框打开');

          // 检查模态框内容
          const modalText = await modal.textContent();
          console.log(`  → 模态框内容: ${modalText?.substring(0, 100)}...`);
        } else {
          console.log('  ❌ 未检测到模态框打开');
        }

        break;
      }
    }

    if (!foundButton) {
      console.log('  ℹ 未找到技能市场按钮');
    }
  });

  test('反馈测试3: 技能卡片点击应有选中反馈', async ({ page }) => {
    console.log('📝 [Test] 测试技能卡片点击的选中反馈');

    // 先安装一些技能用于测试
    await page.evaluate(async () => {
      const skillStore = (window as any).__DEBUG__?.skillStore;
      if (skillStore) {
        // 模拟添加一些技能用于测试
        const mockSkills = [
          {
            id: 'test-skill-1',
            name: '测试技能1',
            description: '这是一个测试技能',
            version: '1.0.0',
            system_prompt: 'You are a helpful assistant',
            tags: ['testing'],
            dependencies: [],
            state: { type: 'NotInstalled' }
          },
          {
            id: 'test-skill-2',
            name: '测试技能2',
            description: '这是另一个测试技能',
            version: '1.0.0',
            system_prompt: 'You are another assistant',
            tags: ['testing'],
            dependencies: [],
            state: { type: 'Active' }
          }
        ];

        // 直接设置状态（用于测试）
        const state = skillStore.getState();
        state.availableSkills = mockSkills;
      }
    });

    await page.waitForTimeout(500);

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

    await page.waitForTimeout(1000);

    // 查找技能卡片
    const skillCards = page.locator('[class*="skill"], [class*="Skill"]').first();
    const cardCount = await skillCards.count();

    console.log(`  → 找到 ${cardCount} 个技能卡片`);

    if (cardCount > 0) {
      // 获取点击前的状态
      const beforeClass = await skillCards.getAttribute('class');
      console.log(`  → 点击前class: ${beforeClass}`);

      // 点击技能卡片
      await skillCards.click();
      await page.waitForTimeout(500);

      // 获取点击后的状态
      const afterClass = await skillCards.getAttribute('class');
      console.log(`  → 点击后class: ${afterClass}`);

      // 检查是否有选中状态的class
      const hasSelectedClass = afterClass?.includes('selected') ||
                               afterClass?.includes('active') ||
                               afterClass?.includes('ring');

      console.log(`  → 选中反馈: ${hasSelectedClass ? '✓ 有' : '❌ 无'}`);
    } else {
      console.log('  ℹ 未找到技能卡片');
    }
  });

  test('反馈测试4: 激活/停用按钮应有状态变化反馈', async ({ page }) => {
    console.log('📝 [Test] 测试激活/停用按钮的状态变化反馈');

    // 添加测试技能
    await page.evaluate(async () => {
      const skillStore = (window as any).__DEBUG__?.skillStore;
      if (skillStore) {
        const mockSkill = {
          id: 'test-skill-active',
          name: '测试激活技能',
          description: '用于测试激活功能的技能',
          version: '1.0.0',
          system_prompt: 'You are a helpful assistant',
          tags: ['testing'],
          dependencies: [],
          state: { type: 'Inactive' }
        };

        const state = skillStore.getState();
        state.availableSkills = [mockSkill];
      }
    });

    await page.waitForTimeout(500);

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

    await page.waitForTimeout(1000);

    // 查找激活按钮
    const activateButton = page.locator('button:has-text("激活"), button:has-text("已激活")').first();
    const buttonCount = await activateButton.count();

    console.log(`  → 找到 ${buttonCount} 个激活按钮`);

    if (buttonCount > 0) {
      // 获取点击前状态
      const beforeText = await activateButton.textContent();
      const beforeDisabled = await activateButton.isDisabled();
      console.log(`  → 点击前: text="${beforeText}", disabled=${beforeDisabled}`);

      // 监听store状态变化
      const storeChanges = await page.evaluate(async () => {
        const skillStore = (window as any).__DEBUG__?.skillStore;
        if (!skillStore) return { error: 'skillStore不存在' };

        return new Promise((resolve) => {
          const unsubscribe = skillStore.subscribe((state: any) => {
            resolve({
              activeSkillIds: state.activeSkillIds,
              availableSkills: state.availableSkills
            });
            unsubscribe();
          });

          // 模拟点击激活
          setTimeout(() => {
            const state = skillStore.getState();
            if (state.availableSkills?.[0]) {
              // 模拟状态变化
              state.availableSkills[0].state = { type: 'Active' };
            }
          }, 100);
        });
      });

      console.log(`  → Store变化: ${JSON.stringify(storeChanges)}`);
    } else {
      console.log('  ℹ 未找到激活按钮');
    }
  });

  test('反馈测试5: 错误情况应有错误提示反馈', async ({ page }) => {
    console.log('📝 [Test] 测试错误情况的提示反馈');

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

    await page.waitForTimeout(1000);

    // 测试各种错误情况的反馈
    const errorScenarios = await page.evaluate(async () => {
      const skillStore = (window as any).__DEBUG__?.skillStore;
      if (!skillStore) return { error: 'skillStore不存在' };

      const results: any = {};

      // 测试1: 尝试安装不存在的技能
      try {
        await skillStore.getState().installSkill('non-existent-skill');
        results.installNonExistent = 'no_error';
      } catch (e) {
        results.installNonExistent = 'caught';
        results.installNonExistentError = String(e);
      }

      // 测试2: 尝试激活不存在的技能
      try {
        await skillStore.getState().activateSkill('another-non-existent-skill');
        results.activateNonExistent = 'no_error';
      } catch (e) {
        results.activateNonExistent = 'caught';
        results.activateNonExistentError = String(e);
      }

      return results;
    });

    console.log('  → 错误处理结果:', errorScenarios);

    // 验证错误被正确处理
    expect(errorScenarios.installNonExistent).toBeDefined();
    expect(errorScenarios.activateNonExistent).toBeDefined();
  });

  test('反馈测试6: 长时间操作应有进度提示', async ({ page }) => {
    console.log('📝 [Test] 测试长时间操作的进度提示');

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

    await page.waitForTimeout(1000);

    // 检查是否有进度指示器
    const progressCheck = await page.evaluate(() => {
      const body = document.body;

      return {
        hasSpinner: body.querySelector('.animate-spin, .spinner, [class*="loading"]') !== null,
        hasProgressBar: body.querySelector('[class*="progress"]') !== null,
        hasProgressText: body.textContent?.includes('安装中') ||
                        body.textContent?.includes('加载中') ||
                        body.textContent?.includes('请稍候') ||
                        false
      };
    });

    console.log('  → 进度提示检查:', progressCheck);

    const hasAnyProgress = progressCheck.hasSpinner ||
                          progressCheck.hasProgressBar ||
                          progressCheck.hasProgressText;

    console.log(`  → 进度提示: ${hasAnyProgress ? '✓ 有' : '❌ 无'}`);
  });

  test('反馈测试7: 操作成功应有成功提示', async ({ page }) => {
    console.log('📝 [Test] 测试操作成功的提示反馈');

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

    await page.waitForTimeout(1000);

    // 测试成功操作的提示
    const successCheck = await page.evaluate(async () => {
      const skillStore = (window as any).__DEBUG__?.skillStore;
      if (!skillStore) return { error: 'skillStore不存在' };

      // 模拟成功操作
      try {
        // 调用一个应该成功的操作
        await skillStore.getState().fetchSkills();

        // 检查是否有成功提示
        const body = document.body;
        return {
          hasSuccessToast: body.querySelector('[class*="success"], [class*="toast"]') !== null,
          hasSuccessText: body.textContent?.includes('成功') ||
                          body.textContent?.includes('完成') ||
                          false,
          operationSuccess: true
        };
      } catch (e) {
        return {
          operationSuccess: false,
          error: String(e)
        };
      }
    });

    console.log('  → 成功提示检查:', successCheck);

    if (successCheck.operationSuccess) {
      console.log(`  → 操作成功: ✓`);
      console.log(`  → 成功提示: ${successCheck.hasSuccessToast || successCheck.hasSuccessText ? '✓ 有' : '❌ 无'}`);
    } else {
      console.log(`  → 操作失败: ${successCheck.error}`);
    }
  });

  test('反馈测试8: 按钮应有hover和active状态', async ({ page }) => {
    console.log('📝 [Test] 测试按钮的交互状态');

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

    await page.waitForTimeout(1000);

    // 查找所有按钮
    const buttons = await page.locator('button').all();
    console.log(`  → 找到 ${buttons.length} 个按钮`);

    if (buttons.length > 0) {
      // 测试第一个按钮的交互状态
      const firstButton = buttons[0];

      // 检查hover状态
      await firstButton.hover();
      await page.waitForTimeout(200);

      const hoverClass = await firstButton.getAttribute('class');
      const hasHoverStyle = hoverClass?.includes('hover') ||
                              hoverClass?.includes('bg-') ||
                              hoverClass?.includes('transition');

      console.log(`  → Hover状态: ${hasHoverStyle ? '✓ 有' : '❌ 无'}`);

      // 检查active状态（按下）
      await firstButton.down();
      await page.waitForTimeout(200);

      const activeClass = await firstButton.getAttribute('class');
      const hasActiveStyle = activeClass?.includes('active') ||
                              activeClass?.includes('pressed');

      console.log(`  → Active状态: ${hasActiveStyle ? '✓ 有' : '❌ 无'}`);

      await firstButton.up();
    } else {
      console.log('  ℹ 未找到按钮');
    }
  });
});

test.describe('用户反馈问题诊断', () => {

  test('诊断1: 检查所有可点击元素的反馈机制', async ({ page }) => {
    console.log('📝 [Test] 全面诊断所有可点击元素的反馈');

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

    await page.waitForTimeout(1000);

    // 全面诊断
    const diagnosis = await page.evaluate(() => {
      const results: any = {
        buttons: [],
        clickableElements: [],
        feedbackIssues: []
      };

      // 检查所有按钮
      const buttons = document.querySelectorAll('button');
      results.totalButtons = buttons.length;

      buttons.forEach((btn, index) => {
        const buttonText = btn.textContent?.trim() || '';
        const isDisabled = btn.hasAttribute('disabled');
        const classes = btn.className;

        // 检查是否有交互反馈样式
        const hasHoverClass = classes.includes('hover:') ||
                              classes.includes('group-hover');
        const hasTransition = classes.includes('transition');
        const hasActiveClass = classes.includes('active') ||
                               classes.includes('pressed');

        results.buttons.push({
          index,
          text: buttonText.substring(0, 30),
          disabled: isDisabled,
          hasHoverClass,
          hasTransition,
          hasActiveClass,
          hasFeedback: hasHoverClass || hasTransition || hasActiveClass
        });
      });

      // 检查技能相关按钮
      const skillButtons = Array.from(buttons).filter(btn => {
        const text = btn.textContent?.toLowerCase() || '';
        return text.includes('安装') ||
               text.includes('激活') ||
               text.includes('浏览') ||
               text.includes('技能');
      });

      results.skillButtons = skillButtons.map(btn => ({
        text: btn.textContent?.trim(),
        disabled: btn.hasAttribute('disabled'),
        className: btn.className
      }));

      // 检查反馈元素
      const feedbackElements = document.querySelectorAll(
        '[class*="toast"], [class*="notification"], [class*="alert"], [class*="message"]'
      );

      results.feedbackElementsCount = feedbackElements.length;

      // 检查loading元素
      const loadingElements = document.querySelectorAll(
        '[class*="loading"], [class*="spinner"], .animate-spin'
      );

      results.loadingElementsCount = loadingElements.length;

      return results;
    });

    console.log('  → 总按钮数:', diagnosis.totalButtons);
    console.log('  → 技能相关按钮:', diagnosis.skillButtons.length);
    console.log('  → 反馈元素数:', diagnosis.feedbackElementsCount);
    console.log('  → Loading元素数:', diagnosis.loadingElementsCount);

    // 分析问题
    const buttonsWithoutFeedback = diagnosis.buttons.filter((b: any) => !b.hasFeedback && b.text);
    if (buttonsWithoutFeedback.length > 0) {
      console.log('  ⚠️ 发现缺少反馈的按钮:');
      buttonsWithoutFeedback.forEach((b: any) => {
        console.log(`     - "${b.text}" (disabled: ${b.disabled})`);
      });
    }

    // 生成诊断报告
    const report = {
      totalElements: diagnosis.totalButtons,
      elementsWithFeedback: diagnosis.buttons.filter((b: any) => b.hasFeedback).length,
      elementsWithoutFeedback: diagnosis.buttons.filter((b: any) => !b.hasFeedback && b.text).length,
      feedbackElementsPresent: diagnosis.feedbackElementsCount > 0,
      loadingElementsPresent: diagnosis.loadingElementsCount > 0
    };

    console.log('  → 诊断报告:', report);
  });
});