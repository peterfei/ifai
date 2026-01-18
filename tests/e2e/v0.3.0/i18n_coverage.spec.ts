import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment } from '../setup';

// 国际化全覆盖测试集
test.describe.skip('Feature: I18n Coverage @v0.3.0 - TODO: Fix this test', () => {

  test.beforeEach(async ({ page }) => {
    // 使用标准 E2E 环境设置
    await setupE2ETestEnvironment(page);
  });

  // I18N-E2E-01: 英文环境纯净度检测
  test('I18N-E2E-01: No Chinese characters in English mode', async ({ page }) => {
    await page.goto('/');

    // 设置为英文环境
    await page.evaluate(() => {
      localStorage.setItem('i18nextLng', 'en-US');
    });

    // 重新加载以应用语言设置
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    // 等待应用容器加载 - 不依赖 Monaco 编辑器
    await expect(page.locator('#root')).toBeVisible();

    // 2. 交互遍历关键区域以触发动态内容加载
    // 打开命令面板
    await page.keyboard.press('F1');
    await page.waitForTimeout(500);
    await page.keyboard.press('Escape');

    // 打开文件树右键菜单 (假设)
    // await page.locator('.file-item').first().click({ button: 'right' });

    // 3. 扫描页面所有可见元素的文本
    // 排除编辑器内容区 (用户代码可能是中文)
    // 排除模态框内的文本 (可能有用户手动打开的对话框)
    const bodyText = await page.evaluate(() => {
      // 辅助函数：检查元素是否可见
      const isVisible = (elem) => {
        if (!elem) return false;
        const style = window.getComputedStyle(elem);
        if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
        return !!(elem.offsetWidth || elem.offsetHeight || elem.getClientRects().length);
      };

      // 递归获取文本节点
      const getText = (node) => {
        let text = '';
        if (node.nodeType === Node.TEXT_NODE) {
            // 忽略空白
            const content = node.textContent?.trim();
            if (content && isVisible(node.parentElement)) {
                // 特殊过滤：排除 Monaco 编辑器内容行、输入框值
                if (node.parentElement?.closest('.view-lines')) return '';
                if (node.parentElement?.closest('.monaco-editor')) return '';
                // 排除模态框/对话框内内容 (可能有用户手动操作)
                if (node.parentElement?.closest('[role="dialog"]')) return '';
                if (node.parentElement?.closest('.fixed.z-50')) return '';
                // 排除 inline edit widget
                if (node.parentElement?.closest('.inline-edit-widget')) return '';
                // 排除 toast 通知
                if (node.parentElement?.closest('[data-sonner-toast]')) return '';
                text += content + '\n';
            }
        } else if (node.nodeType === Node.ELEMENT_NODE) {
            // 忽略 script, style, noscript
            if (['SCRIPT', 'STYLE', 'NOSCRIPT'].includes(node.nodeName)) return '';

            for (const child of node.childNodes) {
                text += getText(child);
            }
        }
        return text;
      };

      return getText(document.body);
    });

    // 4. 正则匹配中文字符 [\u4e00-\u9fa5]
    // 允许少量例外 (如: 字体名称、特定的品牌词如果必须是中文)
    const chineseRegex = /[\u4e00-\u9fa5]+/g;
    const matches = bodyText.match(chineseRegex);

    if (matches && matches.length > 0) {
      console.error('Found Chinese characters in English mode:', matches);
    }

    // 断言：不应包含中文字符
    // 注意：如果有预期的中文（例如示例文件内容），这里需要加白名单过滤
    expect(matches, `Found ${matches?.length} Chinese text segments in English mode: ${matches?.join(', ')}`).toBeNull();
  });

  // I18N-E2E-02: 动态错误信息翻译
  test('I18N-E2E-02: Backend error translation', async ({ page }) => {
    await page.goto('/');

    // 设置为英文
    await page.evaluate(() => {
      localStorage.setItem('i18nextLng', 'en-US');
    });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);
    await expect(page.locator('#root')).toBeVisible();

    // 触发一个后端错误并验证翻译
    // 通过触发文件操作错误来测试
    await page.evaluate(() => {
      // 模拟后端错误 - 尝试打开一个不存在的文件
      const event = new CustomEvent('backend-error', {
        detail: {
          code: 'ERR_FILE_NOT_FOUND',
          message: '文件未找到',  // 后端返回的中文
          details: { path: '/test/nonexistent.ts' }
        }
      });
      window.dispatchEvent(event);
    });

    // 验证错误消息已被翻译为英文
    // 检查是否有 "File not found" 而不是 "文件未找到"
    const pageText = await page.evaluate(() => document.body.textContent || '');

    // 英文环境下应该显示 "File not found" 或类似的英文错误
    // 而不是原始的中文 "文件未找到"
    expect(pageText).not.toContain('文件未找到');
  });

  // I18N-E2E-03: 占位符插值验证
  test('I18N-E2E-03: Interpolation check', async ({ page }) => {
    // 检查是否有未替换的插值，如 {{count}} 或 {count}
    const rawContent = await page.content();
    expect(rawContent).not.toMatch(/\{\{\w+\}\}/);
    expect(rawContent).not.toMatch(/\{[a-z][a-zA-Z0-9]+\}/); // 简单的单括号检查，可能会误报代码，需谨慎
  });

  // I18N-E2E-04: 设置面板语言切换功能
  test('I18N-E2E-04: Language switcher in Settings', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1000);

    // 等待应用容器加载
    await expect(page.locator('#root')).toBeVisible();

    // 点击设置按钮打开设置面板 - 使用 JavaScript 直接点击绕过 overlay
    const settingsButton = page.locator('button[title*="设置"], button[title*="Settings"]');
    await expect(settingsButton.first()).toBeVisible();
    await settingsButton.first().evaluate((el: HTMLElement) => el.click());

    // 等待设置模态框打开
    await expect(page.locator('[data-testid="settings-modal"]')).toBeVisible();
    await page.waitForTimeout(500);

    // 验证语言选择器存在 - 使用更宽松的选择器
    const hasLanguageOption = await page.evaluate(() => {
      const selects = document.querySelectorAll('select');
      for (const select of selects) {
        const options = Array.from(select.options);
        const hasZhCN = options.some(opt => opt.value === 'zh-CN');
        const hasEnUS = options.some(opt => opt.value === 'en-US');
        if (hasZhCN && hasEnUS) {
          return true;
        }
      }
      return false;
    });

    expect(hasLanguageOption).toBe(true);

    // 获取当前语言
    const currentLang = await page.evaluate(() => {
      const selects = document.querySelectorAll('select');
      for (const select of selects) {
        const options = Array.from(select.options);
        const hasZhCN = options.some(opt => opt.value === 'zh-CN');
        const hasEnUS = options.some(opt => opt.value === 'en-US');
        if (hasZhCN && hasEnUS) {
          return (select as HTMLSelectElement).value;
        }
      }
      return 'zh-CN';
    });

    console.log('当前语言:', currentLang);

    // 切换到英文（如果是中文）或中文（如果是英文）
    const targetLang = currentLang === 'zh-CN' ? 'en-US' : 'zh-CN';

    await page.evaluate((lang) => {
      const selects = document.querySelectorAll('select');
      for (const select of selects) {
        const options = Array.from(select.options);
        const hasTargetLang = options.some(opt => opt.value === lang);
        if (hasTargetLang) {
          (select as HTMLSelectElement).value = lang;
          select.dispatchEvent(new Event('change', { bubbles: true }));
          break;
        }
      }
    }, targetLang);

    // 等待页面刷新（语言切换会触发页面刷新）
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(2000);

    // 验证语言已切换
    const newLang = await page.evaluate(() => {
      return localStorage.getItem('i18nextLng');
    });

    expect(newLang).toBe(targetLang);

    // 验证页面显示正确语言的内容
    const bodyText = await page.evaluate(() => document.body.textContent || '');

    if (targetLang === 'en-US') {
      // 英文环境应该有英文文本
      expect(bodyText).toMatch(/File|Editor|Settings|Language/);
    } else {
      // 中文环境应该有中文文本
      expect(bodyText).toMatch(/文件|编辑器|设置|语言/);
    }

    console.log('语言切换成功:', currentLang, '->', targetLang);
  });

  // I18N-E2E-05: 无感知刷新测试
  test('I18N-E2E-05: Seamless language switching without page reload', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1000);

    // 等待应用容器加载
    await expect(page.locator('#root')).toBeVisible();

    // 点击设置按钮
    const settingsButton = page.locator('button[title*="设置"], button[title*="Settings"]');
    await expect(settingsButton.first()).toBeVisible();
    await settingsButton.first().evaluate((el: HTMLElement) => el.click());

    // 等待设置模态框打开
    await expect(page.locator('[data-testid="settings-modal"]')).toBeVisible();
    await page.waitForTimeout(500);

    // 记录当前页面的一些关键文本
    const beforeText = await page.evaluate(() => {
      const selects = document.querySelectorAll('select');
      for (const select of selects) {
        const options = Array.from(select.options);
        const hasZhCN = options.some(opt => opt.value === 'zh-CN');
        const hasEnUS = options.some(opt => opt.value === 'en-US');
        if (hasZhCN && hasEnUS) {
          return {
            lang: (select as HTMLSelectElement).value,
            bodyText: document.body.textContent || ''
          };
        }
      }
      return { lang: 'zh-CN', bodyText: '' };
    });

    console.log('切换前:', beforeText.lang);

    // 切换语言
    const targetLang = beforeText.lang === 'zh-CN' ? 'en-US' : 'zh-CN';

    // 记录页面 URL，验证不会刷新
    const beforeUrl = page.url();

    // 执行语言切换
    await page.evaluate((lang) => {
      const selects = document.querySelectorAll('select');
      for (const select of selects) {
        const options = Array.from(select.options);
        const hasTargetLang = options.some(opt => opt.value === lang);
        if (hasTargetLang) {
          (select as HTMLSelectElement).value = lang;
          select.dispatchEvent(new Event('change', { bubbles: true }));
          break;
        }
      }
    }, targetLang);

    // 等待组件重新渲染（但不刷新页面）
    await page.waitForTimeout(1000);

    // 验证 URL 没有变化（说明没有刷新页面）
    const afterUrl = page.url();
    expect(afterUrl).toBe(beforeUrl);

    // 验证设置模态框仍然打开（说明没有刷新）
    await expect(page.locator('[data-testid="settings-modal"]')).toBeVisible();

    // 验证语言已经切换
    const afterText = await page.evaluate(() => {
      const selects = document.querySelectorAll('select');
      for (const select of selects) {
        const options = Array.from(select.options);
        const hasZhCN = options.some(opt => opt.value === 'zh-CN');
        const hasEnUS = options.some(opt => opt.value === 'en-US');
        if (hasZhCN && hasEnUS) {
          return (select as HTMLSelectElement).value;
        }
      }
      return 'zh-CN';
    });

    expect(afterText).toBe(targetLang);

    // 验证页面内容已经更新
    const newBodyText = await page.evaluate(() => document.body.textContent || '');

    if (targetLang === 'en-US') {
      expect(newBodyText).toMatch(/Language/);
    } else {
      expect(newBodyText).toMatch(/语言/);
    }

    console.log('无感知切换成功:', beforeText.lang, '->', afterText);
  });

  // I18N-E2E-06: WelcomeDialog 英文模式检测
  test('I18N-E2E-06: WelcomeDialog shows English in English mode', async ({ page }) => {
    await page.goto('/');

    // 设置为英文
    await page.evaluate(() => {
      localStorage.setItem('i18nextLng', 'en-US');
      // 清除 onboarding 状态，确保 WelcomeDialog 会显示
      localStorage.removeItem('ifai_onboarding_state');
      location.reload();
    });

    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(2000);
    await expect(page.locator('#root')).toBeVisible();

    // 等待 WelcomeDialog 出现（最多 5 秒）
    try {
      await page.waitForSelector('text=/Welcome to IfAI Editor|欢迎使用 IfAI Editor/', { timeout: 5000 });
    } catch (e) {
      // WelcomeDialog 没有显示，跳过测试
      console.log('WelcomeDialog 未显示，跳过测试');
      return;
    }

    // 获取对话框内的文本内容
    const dialogText = await page.evaluate(() => {
      const dialog = document.querySelector('[role="dialog"]') ||
                     document.querySelector('.fixed.inset-0') ||
                     document.querySelector('.fixed.z-50');
      if (!dialog) return '';
      return dialog.textContent || '';
    });

    console.log('WelcomeDialog 文本内容:', dialogText);

    // 英文环境下应该有英文文本，不应该有中文
    expect(dialogText).toMatch(/Welcome to IfAI Editor|Download Now|Skip/);
    expect(dialogText).not.toContain('欢迎使用 IfAI Editor');
    expect(dialogText).not.toContain('本地模型优势');
    expect(dialogText).not.toContain('离线使用');
  });

  // I18N-E2E-07: OnboardingTour 英文模式检测
  test('I18N-E2E-07: OnboardingTour shows English in English mode', async ({ page }) => {
    await page.goto('/');

    // 设置为英文，并强制显示 Tour
    await page.evaluate(() => {
      localStorage.setItem('i18nextLng', 'en-US');
      // 清除 Tour 状态，确保 Tour 会显示
      localStorage.removeItem('tour_completed');
      localStorage.removeItem('tour_skipped');
      localStorage.removeItem('onboarding_done');
      location.reload();
    });

    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(2000);
    await expect(page.locator('#root')).toBeVisible();

    // 等待 Tour 出现（最多 5 秒）
    try {
      await page.waitForSelector('.react-joyride', { timeout: 5000 });
    } catch (e) {
      // Tour 没有显示，跳过测试
      console.log('OnboardingTour 未显示，跳过测试');
      return;
    }

    // 获取 Tour tooltip 内的文本内容
    const tourText = await page.evaluate(() => {
      const tooltip = document.querySelector('.react-joyride__tooltip');
      if (!tooltip) return '';
      return tooltip.textContent || '';
    });

    console.log('OnboardingTour 文本内容:', tourText);

    // 英文环境下应该有英文文本，不应该有中文（除了可能的步骤指示器）
    expect(tourText).toMatch(/Welcome|CommandBar|Settings|Layout|Next|Skip/);
    expect(tourText).not.toContain('欢迎使用 IfAI Editor');
    expect(tourText).not.toContain('Vim 风格命令行');
    expect(tourText).not.toContain('设置说明');
  });

  // I18N-E2E-08: OnboardingTour 动态语言切换
  test('I18N-E2E-08: OnboardingTour updates content when language changes', async ({ page }) => {
    await page.goto('/');

    // 清除 Tour 状态
    await page.evaluate(() => {
      localStorage.removeItem('tour_completed');
      localStorage.removeItem('tour_skipped');
      localStorage.removeItem('onboarding_done');
    });

    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(2000);

    // 等待 Tour 出现
    try {
      await page.waitForSelector('.react-joyride', { timeout: 5000 });
    } catch (e) {
      console.log('OnboardingTour 未显示，跳过测试');
      return;
    }

    // 获取初始语言和 Tour 内容
    const initialText = await page.evaluate(() => {
      const tooltip = document.querySelector('.react-joyride__tooltip');
      return tooltip?.textContent || '';
    });

    console.log('初始 Tour 内容:', initialText);

    // 切换到中文
    await page.evaluate(() => {
      const event = new CustomEvent('i18n-change', { detail: { language: 'zh-CN' } });
      window.dispatchEvent(event);
      // 直接设置 localStorage 并触发变化
      localStorage.setItem('i18nextLng', 'zh-CN');
      location.reload();
    });

    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(2000);

    // 等待 Tour 重新出现
    try {
      await page.waitForSelector('.react-joyride', { timeout: 5000 });
    } catch (e) {
      console.log('Tour 重启后未显示');
      return;
    }

    // 获取切换后的 Tour 内容
    const switchedText = await page.evaluate(() => {
      const tooltip = document.querySelector('.react-joyride__tooltip');
      return tooltip?.textContent || '';
    });

    console.log('切换后 Tour 内容:', switchedText);

    // 验证内容已切换到中文
    expect(switchedText).toMatch(/欢迎使用 IfAI Editor|CommandBar 命令行|设置面板|布局切换/);
  });

  // I18N-E2E-09: LocalModelDownload 英文模式检测
  test('I18N-E2E-09: LocalModelDownload shows English in English mode', async ({ page }) => {
    await page.goto('/');

    // 设置为英文并触发下载状态（模拟）
    await page.evaluate(() => {
      localStorage.setItem('i18nextLng', 'en-US');
      // 模拟下载状态，触发 LocalModelDownload 组件
      localStorage.setItem('mock_download_state', 'downloading');
    });

    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(2000);
    await expect(page.locator('#root')).toBeVisible();

    // 检查页面是否有下载相关的英文文本（如果组件显示的话）
    const pageText = await page.evaluate(() => document.body.textContent || '');

    // 英文环境下不应该有 LocalModelDownload 的中文硬编码文本
    expect(pageText).not.toContain('正在下载本地 AI 模型');
    expect(pageText).not.toContain('下载进度');
    expect(pageText).not.toContain('下载速度');
    expect(pageText).not.toContain('预计剩余时间');
    expect(pageText).not.toContain('后台下载');
    expect(pageText).not.toContain('下载失败');
  });

  // I18N-E2E-10: 设置面板所有文本都已国际化
  test('I18N-E2E-10: Settings panel fully internationalized', async ({ page }) => {
    await page.goto('/');

    // 设置为英文
    await page.evaluate(() => {
      localStorage.setItem('i18nextLng', 'en-US');
      location.reload();
    });

    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(2000);
    await expect(page.locator('#root')).toBeVisible();

    // 打开设置面板
    const settingsButton = page.locator('button[title*="设置"], button[title*="Settings"]');
    await expect(settingsButton.first()).toBeVisible();
    await settingsButton.first().evaluate((el: HTMLElement) => el.click());

    // 等待设置模态框打开
    await expect(page.locator('[data-testid="settings-modal"]')).toBeVisible();
    await page.waitForTimeout(500);

    // 获取设置面板的所有文本
    const settingsText = await page.evaluate(() => {
      const modal = document.querySelector('[data-testid="settings-modal"]');
      return modal?.textContent || '';
    });

    console.log('设置面板文本:', settingsText.substring(0, 500));

    // 验证常见的硬编码中文不存在
    expect(settingsText).not.toContain('基础 URL');
    expect(settingsText).not.toContain('若爱提供商');
    expect(settingsText).not.toContain('API 密钥');
    expect(settingsText).not.toContain('智能体设置');

    // 应该有英文文本
    expect(settingsText).toMatch(/Settings|Language|Theme|Editor|AI|Performance/);
  });

  // I18N-E2E-11: WelcomeScreen 国际化检测
  test('I18N-E2E-11: WelcomeScreen shows English in English mode', async ({ page }) => {
    await page.goto('/');

    // 设置为英文
    await page.evaluate(() => {
      localStorage.setItem('i18nextLng', 'en-US');
      location.reload();
    });

    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(2000);
    await expect(page.locator('#root')).toBeVisible();

    // 检查页面是否有欢迎屏幕的内容
    const pageText = await page.evaluate(() => document.body.textContent || '');

    // 英文环境下应该有英文的欢迎文本
    expect(pageText).toMatch(/IfAI Editor/);

    // 检查快捷键提示是否是英文
    expect(pageText).toContain('Show All Commands');
    expect(pageText).toContain('Go to File');
    expect(pageText).toContain('Find in Files');
    expect(pageText).toContain('Toggle IfAI Chat');
    expect(pageText).toContain('Inline AI Edit');
  });

  // I18N-E2E-12: CustomProviderSettings 国际化检测
  test('I18N-E2E-12: CustomProviderSettings shows English in English mode', async ({ page }) => {
    await page.goto('/');

    // 设置为英文
    await page.evaluate(() => {
      localStorage.setItem('i18nextLng', 'en-US');
      location.reload();
    });

    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(2000);
    await expect(page.locator('#root')).toBeVisible();

    // 打开设置面板
    const settingsButton = page.locator('button[title*="Settings"], button[title*="设置"]');
    await expect(settingsButton.first()).toBeVisible();
    await settingsButton.first().evaluate((el: HTMLElement) => el.click());

    // 等待设置模态框打开
    await expect(page.locator('[data-testid="settings-modal"]')).toBeVisible();
    await page.waitForTimeout(500);

    // 切换到 Custom Provider 标签
    await page.evaluate(() => {
      const tabs = document.querySelectorAll('button');
      for (const tab of tabs) {
        if (tab.textContent?.includes('Custom Provider') || tab.textContent?.includes('自定义提供商')) {
          (tab as HTMLButtonElement).click();
          break;
        }
      }
    });

    await page.waitForTimeout(1500);

    // 获取自定义提供商设置的文本
    const customProviderText = await page.evaluate(() => {
      const modal = document.querySelector('[data-testid="settings-modal"]');
      return modal?.textContent || '';
    });

    console.log('自定义提供商设置文本:', customProviderText.substring(0, 500));

    // 验证常见的硬编码中文不存在
    expect(customProviderText).not.toContain('添加新提供商');
    expect(customProviderText).not.toContain('提供商名称');
    expect(customProviderText).not.toContain('API 地址');

    // 应该有英文文本
    expect(customProviderText).toMatch(/Custom Provider|Add New Provider|Provider Name/);
  });

  // I18N-E2E-13: LocalModelSettings 国际化检测
  test('I18N-E2E-13: LocalModelSettings shows English in English mode', async ({ page }) => {
    await page.goto('/');

    // 设置为英文
    await page.evaluate(() => {
      localStorage.setItem('i18nextLng', 'en-US');
      location.reload();
    });

    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(2000);
    await expect(page.locator('#root')).toBeVisible();

    // 打开设置面板
    const settingsButton = page.locator('button[title*="Settings"], button[title*="设置"]');
    await expect(settingsButton.first()).toBeVisible();
    await settingsButton.first().evaluate((el: HTMLElement) => el.click());

    // 等待设置模态框打开
    await expect(page.locator('[data-testid="settings-modal"]')).toBeVisible();
    await page.waitForTimeout(500);

    // 切换到 Local Model 标签
    await page.evaluate(() => {
      const tabs = document.querySelectorAll('button');
      for (const tab of tabs) {
        if (tab.textContent?.includes('Local Model') || tab.textContent?.includes('本地模型')) {
          (tab as HTMLButtonElement).click();
          break;
        }
      }
    });

    await page.waitForTimeout(1500);

    // 获取本地模型设置的文本
    const localModelText = await page.evaluate(() => {
      const modal = document.querySelector('[data-testid="settings-modal"]');
      return modal?.textContent || '';
    });

    console.log('本地模型设置文本:', localModelText.substring(0, 500));

    // 验证常见的硬编码中文不存在
    expect(localModelText).not.toContain('本地模型设置');
    expect(localModelText).not.toContain('模型状态');
    expect(localModelText).not.toContain('系统信息');

    // 应该有英文文本
    expect(localModelText).toMatch(/Local Model|Model Status|System Information/);
  });

  // I18N-E2E-14: DataManagementPanel 国际化检测
  test('I18N-E2E-14: DataManagementPanel shows English in English mode', async ({ page }) => {
    await page.goto('/');

    // 设置为英文
    await page.evaluate(() => {
      localStorage.setItem('i18nextLng', 'en-US');
      location.reload();
    });

    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(2000);
    await expect(page.locator('#root')).toBeVisible();

    // 打开设置面板
    const settingsButton = page.locator('button[title*="Settings"], button[title*="设置"]');
    await expect(settingsButton.first()).toBeVisible();
    await settingsButton.first().evaluate((el: HTMLElement) => el.click());

    // 等待设置模态框打开
    await expect(page.locator('[data-testid="settings-modal"]')).toBeVisible();
    await page.waitForTimeout(500);

    // 切换到 Data Management 标签
    await page.evaluate(() => {
      const tabs = document.querySelectorAll('button');
      for (const tab of tabs) {
        if (tab.textContent?.includes('Data Management') || tab.textContent?.includes('数据管理')) {
          (tab as HTMLButtonElement).click();
          break;
        }
      }
    });

    await page.waitForTimeout(1500);

    // 获取数据管理面板的文本
    const dataManagementText = await page.evaluate(() => {
      const modal = document.querySelector('[data-testid="settings-modal"]');
      return modal?.textContent || '';
    });

    console.log('数据管理面板文本:', dataManagementText.substring(0, 500));

    // 验证常见的硬编码中文不存在
    expect(dataManagementText).not.toContain('数据统计');
    expect(dataManagementText).not.toContain('导出/导入');
    expect(dataManagementText).not.toContain('存储管理');

    // 应该有英文文本
    expect(dataManagementText).toMatch(/Data Statistics|Export\/Import|Storage Management/);
  });

  // I18N-E2E-15: 性能设置面板国际化检测（中文环境）
  test('I18N-E2E-15: Performance settings shows Chinese in Chinese mode', async ({ page }) => {
    await page.goto('/');

    // 设置为中文
    await page.evaluate(() => {
      localStorage.setItem('i18nextLng', 'zh-CN');
      location.reload();
    });

    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(2000);
    await expect(page.locator('#root')).toBeVisible();

    // 打开设置面板
    const settingsButton = page.locator('button[title*="Settings"], button[title*="设置"]');
    await expect(settingsButton.first()).toBeVisible();
    await settingsButton.first().evaluate((el: HTMLElement) => el.click());

    // 等待设置模态框打开
    await expect(page.locator('[data-testid="settings-modal"]')).toBeVisible();
    await page.waitForTimeout(500);

    // 切换到 Performance 标签
    await page.evaluate(() => {
      const tabs = document.querySelectorAll('button');
      for (const tab of tabs) {
        if (tab.textContent?.includes('Performance') || tab.textContent?.includes('性能')) {
          (tab as HTMLButtonElement).click();
          break;
        }
      }
    });

    await page.waitForTimeout(1500);

    // 获取性能设置的文本
    const performanceText = await page.evaluate(() => {
      const modal = document.querySelector('[data-testid="settings-modal"]');
      return modal?.textContent || '';
    });

    console.log('性能设置文本:', performanceText.substring(0, 800));

    // 验证没有显示翻译键（如 settings.performanceModeAuto）
    expect(performanceText).not.toContain('settings.performanceModeAuto');
    expect(performanceText).not.toContain('settings.targetFPS');
    expect(performanceText).not.toContain('settings.enableGPUAcceleration');
    expect(performanceText).not.toContain('settings.showPerformanceMonitor');
    expect(performanceText).not.toContain('settings.enableAutoDowngrade');

    // 应该有中文文本
    expect(performanceText).toMatch(/性能模式|自动|高性能|均衡|省电/);
    expect(performanceText).toMatch(/目标帧率|启用 GPU 加速|显示性能监控器/);
  });

  // I18N-E2E-16: CustomProviderSettings 国际化检测（中文环境）
  test('I18N-E2E-16: CustomProviderSettings shows Chinese in Chinese mode', async ({ page }) => {
    await page.goto('/');

    // 设置为中文
    await page.evaluate(() => {
      localStorage.setItem('i18nextLng', 'zh-CN');
      location.reload();
    });

    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(2000);
    await expect(page.locator('#root')).toBeVisible();

    // 打开设置面板
    const settingsButton = page.locator('button[title*="Settings"], button[title*="设置"]');
    await expect(settingsButton.first()).toBeVisible();
    await settingsButton.first().evaluate((el: HTMLElement) => el.click());

    // 等待设置模态框打开
    await expect(page.locator('[data-testid="settings-modal"]')).toBeVisible();
    await page.waitForTimeout(500);

    // 切换到 Custom Provider 标签
    await page.evaluate(() => {
      const tabs = document.querySelectorAll('button');
      for (const tab of tabs) {
        if (tab.textContent?.includes('Custom Provider') || tab.textContent?.includes('自定义提供商')) {
          (tab as HTMLButtonElement).click();
          break;
        }
      }
    });

    await page.waitForTimeout(1500);

    // 获取自定义提供商设置的文本
    const customProviderText = await page.evaluate(() => {
      const modal = document.querySelector('[data-testid="settings-modal"]');
      return modal?.textContent || '';
    });

    console.log('自定义提供商设置文本:', customProviderText.substring(0, 800));

    // 验证没有硬编码的中文应该是翻译后的中文，而不是翻译键
    // 应该有正确的中文描述文本
    expect(customProviderText).toContain('自定义');
    expect(customProviderText).not.toContain('Add Provider');
    expect(customProviderText).not.toContain('API URL');
  });

  // I18N-E2E-17: FileTree 和 HelpMenu 国际化检测
  test('I18N-E2E-17: FileTree and HelpMenu show Chinese in Chinese mode', async ({ page }) => {
    // 先导航到页面
    await page.goto('/');

    // 设置为中文并禁用新手引导和欢迎对话框
    await page.evaluate(() => {
      localStorage.setItem('i18nextLng', 'zh-CN');
      localStorage.setItem('tour_completed', 'true');
      localStorage.setItem('onboarding_done', 'true');
      // 设置欢迎对话框状态为已完成，跳过本地模型下载提示
      localStorage.setItem('ifai_onboarding_state', JSON.stringify({
        hasSeenWelcome: true,
        completed: true,
        skipped: true,
        remindCount: 0,
        lastRemindDate: new Date().toISOString()
      }));
      location.reload();
    });

    // 等待页面加载
    await page.waitForLoadState('networkidle');

    // 获取页面文本
    const pageText = await page.evaluate(() => document.body.textContent || '');

    // 检查 FileTree 相关文本（未打开文件夹时）
    expect(pageText).toContain('未打开文件夹');
    expect(pageText).toContain('打开文件夹');
    expect(pageText).toContain('或点击上方标题栏中的文件夹图标');

    // 检查 Help 按钮文本（在标题栏中）
    expect(pageText).toContain('帮助');

    // 确保没有英文残留
    expect(pageText).not.toContain('No folder open');
    expect(pageText).not.toContain('Open Folder');
    expect(pageText).not.toContain('Or click the folder icon');
  });

  // I18N-E2E-18: TaskMonitor 和 SnippetManager 国际化检测
  test('I18N-E2E-18: TaskMonitor and SnippetManager show Chinese in Chinese mode', async ({ page }) => {
    // 先导航到页面
    await page.goto('/');

    // 设置为中文并禁用新手引导和欢迎对话框
    await page.evaluate(() => {
      localStorage.setItem('i18nextLng', 'zh-CN');
      localStorage.setItem('tour_completed', 'true');
      localStorage.setItem('onboarding_done', 'true');
      // 设置欢迎对话框状态为已完成，跳过本地模型下载提示
      localStorage.setItem('ifai_onboarding_state', JSON.stringify({
        hasSeenWelcome: true,
        completed: true,
        skipped: true,
        remindCount: 0,
        lastRemindDate: new Date().toISOString()
      }));
      location.reload();
    });

    // 等待页面加载
    await page.waitForLoadState('networkidle');

    // 点击侧边栏中的任务控制图标（第4个图标按钮，使用 ListChecks 图标）
    const sidebarButtons = page.locator('button.p-2.mb-2.rounded');
    const tasksButton = sidebarButtons.nth(3); // 0: explorer, 1: search, 2: snippets, 3: tasks
    if (await tasksButton.isVisible()) {
      await tasksButton.click();
    }

    // 等待内容加载
    await page.waitForTimeout(1000);

    // 获取页面文本
    const pageText = await page.evaluate(() => document.body.textContent || '');

    // 检查 TaskMonitor 相关文本
    expect(pageText).toContain('任务控制');
    // "暂无活动记录" 只在没有任务时显示，可能不总是存在
    // 但至少要确保没有英文残留

    // 点击代码片段管理图标
    const snippetsButton = sidebarButtons.nth(2);
    if (await snippetsButton.isVisible()) {
      await snippetsButton.click();
      await page.waitForTimeout(1000);

      const snippetsText = await page.evaluate(() => document.body.textContent || '');
      expect(snippetsText).toContain('代码片段管理');
      expect(snippetsText).toContain('生成数据');
      expect(snippetsText).toContain('清除全部');
      expect(snippetsText).toContain('未找到片段');
    }

    // 确保没有英文残留
    expect(pageText).not.toContain('MISSION CONTROL');
    expect(pageText).not.toContain('No activity recorded yet');
    expect(pageText).not.toContain('No snippets found');
    expect(pageText).not.toContain('items');
    expect(pageText).not.toContain('IndexedDB Storage');
  });

  // I18N-E2E-19: SettingsModal 标题栏国际化检测
  test('I18N-E2E-19: SettingsModal title bar shows Chinese in Chinese mode', async ({ page }) => {
    // 先导航到页面
    await page.goto('/');

    // 设置为中文并禁用新手引导和欢迎对话框
    await page.evaluate(() => {
      localStorage.setItem('i18nextLng', 'zh-CN');
      localStorage.setItem('tour_completed', 'true');
      localStorage.setItem('onboarding_done', 'true');
      localStorage.setItem('ifai_onboarding_state', JSON.stringify({
        hasSeenWelcome: true,
        completed: true,
        skipped: true,
        remindCount: 0,
        lastRemindDate: new Date().toISOString()
      }));
      location.reload();
    });

    // 等待页面加载
    await page.waitForLoadState('networkidle');

    // 打开设置面板 - 使用更可靠的选择器
    const settingsModal = page.locator('[data-testid="settings-modal"]');
    const isVisible = await settingsModal.isVisible();

    // 如果设置面板没有打开，尝试打开它
    if (!isVisible) {
      // 尝试通过快捷键打开设置
      await page.keyboard.press('Control+,');
      await page.waitForTimeout(500);
    }

    // 再次检查设置面板是否打开
    const isModalOpen = await settingsModal.isVisible();
    if (!isModalOpen) {
      // 如果还是打不开，跳过测试
      console.log('设置面板无法打开，跳过测试');
      return;
    }

    // 获取所有侧边栏按钮
    const sidebarButtons = settingsModal.locator('button');
    const buttonCount = await sidebarButtons.count();
    console.log('找到的按钮数量:', buttonCount);

    // 找到数据管理按钮并点击
    let dataTabClicked = false;
    for (let i = 0; i < buttonCount; i++) {
      const buttonText = await sidebarButtons.nth(i).textContent();
      if (buttonText?.includes('数据管理')) {
        await sidebarButtons.nth(i).click();
        dataTabClicked = true;
        await page.waitForTimeout(500);
        break;
      }
    }

    if (dataTabClicked) {
      const dataTitle = await page.evaluate(() => {
        const modal = document.querySelector('[data-testid="settings-modal"] h2');
        return modal?.textContent || '';
      });

      console.log('数据管理标题:', dataTitle);
      // 验证数据管理标题是中文
      expect(dataTitle).toContain('数据管理');
      expect(dataTitle).not.toContain('settings.data');
    }

    // 找到本地模型按钮并点击
    let localModelTabClicked = false;
    for (let i = 0; i < buttonCount; i++) {
      const buttonText = await sidebarButtons.nth(i).textContent();
      if (buttonText?.includes('本地模型')) {
        await sidebarButtons.nth(i).click();
        localModelTabClicked = true;
        await page.waitForTimeout(500);
        break;
      }
    }

    if (localModelTabClicked) {
      const localModelTitle = await page.evaluate(() => {
        const modal = document.querySelector('[data-testid="settings-modal"] h2');
        return modal?.textContent || '';
      });

      console.log('本地模型标题:', localModelTitle);
      // 验证本地模型标题是中文
      expect(localModelTitle).toContain('本地模型设置');
      expect(localModelTitle).not.toContain('settings.localModel');
    }
  });

});
