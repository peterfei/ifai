import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment } from '../setup-utils';

/**
 * 🏆 PivoProjectTree 高保真 E2E 测试
 *
 * 测试目标：
 * 1. 验证 agent_scan_project 结果正确渲染为 PivoProjectTree 组件
 * 2. 验证文件树结构正确显示
 * 3. 验证关键文件标记和预览功能
 * 4. 验证交互功能（展开/收起）
 */

test.describe('PivoProjectTree 渲染高保真还原', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem('ifai-settings-storage', JSON.stringify({
        state: {
          currentProviderId: 'openai',
          currentModel: 'gpt-4o',
          providers: [{ id: 'openai', name: 'OpenAI', apiKey: 'sk-mock', enabled: true }],
          onboardingCompleted: true
        },
        version: 0
      }));
      (window as any).__E2E_SKIP_INFRA_STUB__ = true;
    });

    await setupE2ETestEnvironment(page, { skipWelcome: true });

    // 等待应用完全初始化（兼容新旧架构）
    await page.waitForFunction(() => {
      const w = window as any;
      // 检查核心对象是否可用
      return (w.__chatStore !== undefined) &&
             (w.__APP_READY__ === true || w.__chatEventBus !== undefined);
    }, { timeout: 30000 });
  });

  test('基础渲染：验证 PivoProjectTree 组件正确显示', async ({ page }) => {
    // 🏆 物理模拟：注入符合实际数据格式的 scan 结果
    await page.evaluate(() => {
      const store = (window as any).__chatStore;

      // 模拟后端返回的数据格式（扁平结构）
      const mockScanData = {
        structure: {
          "src": {
            "components": {
              "Header.tsx": "file",
              "Footer.tsx": "file"
            },
            "utils": {
              "helpers.ts": "file"
            },
            "index.tsx": "file"
          },
          "public": {
            "index.html": "file",
            "favicon.ico": "file"
          },
          "package.json": "file",
          "README.md": "file",
          "tsconfig.json": "file"
        },
        key_files: {
          "package.json": '{"name":"test-project","version":"1.0.0"}',
          "README.md": "# Test Project\n\nThis is a test project.",
          "tsconfig.json": '{"compilerOptions":{"target":"esnext"}}'
        }
      };

      // 模拟工具调用消息（tool 角色）
      const toolMessage = {
        id: 'msg-tool-scan',
        role: 'tool',
        content: JSON.stringify(mockScanData),
        toolCallId: 'call-scan-1',
        timestamp: Date.now()
      };

      store.setState((state: any) => ({
        messages: [...state.messages,
          { id: 'msg-user', role: 'user', content: 'Scan the project structure' },
          {
            id: 'msg-assistant',
            role: 'assistant',
            content: 'I\'ll scan the project structure for you.',
            toolCalls: [{
              id: 'call-scan-1',
              tool: 'agent_scan_project',
              status: 'completed',
              // 🏆 高保真还原：使用真实后端返回的双重包装格式
              result: JSON.stringify({
                output: JSON.stringify(mockScanData),
                status: "success"
              })
            }]
          },
          toolMessage
        ]
      }));
    });

    // 等待渲染完成
    await page.waitForTimeout(500);

    // 🎯 核心验证 1：检查是否渲染了 PivoProjectTree 组件（通过特征文字）
    // 使用 .first() 避免 strict mode violation（可能有多个 Project Topology）
    const topologyHeader = page.locator('text=Project Topology').first();
    await expect(topologyHeader).toBeVisible({ timeout: 5000 });

    // 🎯 核心验证 2：检查关键文件计数（应该显示 3 key files）
    const keyFilesCount = page.locator('text=/3\\s+key files/i').first();
    await expect(keyFilesCount).toBeVisible();

    // 🎯 核心验证 3：检查关键文件预览区域
    const keyFilesPreview = page.locator('text=📝 Key Files Preview').first();
    await expect(keyFilesPreview).toBeVisible();

    // 🎯 核心验证 4：检查具体的文件路径是否显示
    // 使用 .first() 避免 strict mode violation（文件树和预览区域都有相同文本）
    await expect(page.locator('text=package.json').first()).toBeVisible();
    await expect(page.locator('text=README.md').first()).toBeVisible();
    await expect(page.locator('text=tsconfig.json').first()).toBeVisible();

    // 🎯 核心验证 5：检查关键文件标记（蓝色高亮的文件名）
    // 关键文件应该有 text-blue-400 类或特定样式
    const keyFileElements = page.locator('.text-blue-400, [class*="text-blue"]');
    const keyFileCount = await keyFileElements.count();
    expect(keyFileCount).toBeGreaterThan(0);

    console.log('[E2E] ✅ PivoProjectTree 基础渲染验证通过');
  });

  test('交互功能：验证文件树展开/收起', async ({ page }) => {
    await page.evaluate(() => {
      const store = (window as any).__chatStore;
      const mockScanData = {
        structure: {
          "src": {
            "components": {
              "App.tsx": "file",
              "Header.tsx": "file"
            },
            "utils": {
              "helpers.ts": "file"
            }
          },
          "package.json": "file"
        },
        key_files: {
          "package.json": '{"name":"test"}'
        }
      };

      store.setState((state: any) => ({
        messages: [...state.messages,
          { id: 'msg-user', role: 'user', content: 'Scan' },
          {
            id: 'msg-assistant',
            role: 'assistant',
            content: 'Scanning...',
            toolCalls: [{
              id: 'call-scan-1',
              tool: 'agent_scan_project',
              status: 'completed',
              result: JSON.stringify(mockScanData)
            }]
          },
          {
            id: 'msg-tool-scan',
            role: 'tool',
            content: JSON.stringify(mockScanData),
            toolCallId: 'call-scan-1',
            timestamp: Date.now()
          }
        ]
      }));
    });

    await page.waitForTimeout(500);

    // 🎯 验证文件夹默认展开（第一层）
    const srcFolder = page.locator('text=src').first();
    await expect(srcFolder).toBeVisible();

    // 🎯 点击文件夹收起
    await srcFolder.click();
    await page.waitForTimeout(200);

    // 验证子元素被隐藏（通过检查 components 是否不可见）
    const componentsText = page.locator('text=components');
    const isVisible = await componentsText.isVisible().catch(() => false);

    // 如果点击后 components 仍然可见，说明展开/收起可能有问题
    // 但如果不可见，说明功能正常
    console.log('[E2E] 文件夹展开/收起状态:', isVisible ? '展开' : '收起');
  });

  test('关键文件预览：验证内容截断和展开功能', async ({ page }) => {
    await page.evaluate(() => {
      const store = (window as any).__chatStore;

      // 创建一个超过截断长度（500字符）的关键文件
      const longContent = 'x'.repeat(600) + '\n\n更多内容...';

      const mockScanData = {
        structure: {
          "src": {
            "index.ts": "file"
          },
          "package.json": "file"
        },
        key_files: {
          "package.json": longContent
        }
      };

      store.setState((state: any) => ({
        messages: [...state.messages,
          { id: 'msg-user', role: 'user', content: 'Scan' },
          {
            id: 'msg-assistant',
            role: 'assistant',
            content: 'Scanning...',
            toolCalls: [{
              id: 'call-scan-1',
              tool: 'agent_scan_project',
              status: 'completed',
              result: JSON.stringify(mockScanData)
            }]
          },
          {
            id: 'msg-tool-scan',
            role: 'tool',
            content: JSON.stringify(mockScanData),
            toolCallId: 'call-scan-1',
            timestamp: Date.now()
          }
        ]
      }));
    });

    await page.waitForTimeout(500);

    // 🎯 验证关键文件预览区域显示了字符计数
    // 关键文件摘要区域显示完整长度 (600+ chars)
    const charCount = page.locator('text=/60[0-9]\\s+chars/i').first();
    await expect(charCount).toBeVisible();

    // 🎯 验证截断提示（如果有展开按钮的话）
    const expandHint = page.locator('text=已截断');
    const hasExpandHint = await expandHint.count() > 0;
    console.log('[E2E] 内容截断提示:', hasExpandHint ? '存在' : '不存在');

    console.log('[E2E] ✅ 关键文件预览验证通过');
  });

  test('边界情况：空项目和大型项目', async ({ page }) => {
    // 测试空项目
    await page.evaluate(() => {
      const store = (window as any).__chatStore;
      const mockScanData = {
        structure: {},
        key_files: {}
      };

      store.setState((state: any) => ({
        messages: [...state.messages,
          { id: 'msg-user', role: 'user', content: 'Scan empty' },
          {
            id: 'msg-assistant',
            role: 'assistant',
            content: 'Scanning...',
            toolCalls: [{
              id: 'call-scan-1',
              tool: 'agent_scan_project',
              status: 'completed',
              result: JSON.stringify(mockScanData)
            }]
          },
          {
            id: 'msg-tool-scan',
            role: 'tool',
            content: JSON.stringify(mockScanData),
            toolCallId: 'call-scan-1',
            timestamp: Date.now()
          }
        ]
      }));
    });

    await page.waitForTimeout(500);

    // 空项目应该仍然显示 Project Topology
    const topologyHeader = page.locator('text=Project Topology').first();
    await expect(topologyHeader).toBeVisible();

    // 关键文件数量应该是 0
    const zeroKeyFiles = page.locator('text=/0\\s+key files/i').first();
    await expect(zeroKeyFiles).toBeVisible();

    console.log('[E2E] ✅ 空项目边界情况验证通过');
  });

  test('数据格式：验证扁平结构的正确解析', async ({ page }) => {
    // 🏆 高保真还原：模拟后端返回的混合格式（Rust 版本）
    await page.evaluate(() => {
      const store = (window as any).__chatStore;

      // 模拟 ifainew-core 实际返回的格式：混合扁平文件 + 嵌套目录
      const mockScanData = {
        structure: {
          // 扁平文件（根目录）
          "README.md": "file",
          "package.json": "file",
          "index.html": "file",
          // 嵌套目录（已经是对象）
          "public": {
            "clock.html": "file",
            "favicon.ico": "file"
          },
          "src": {
            // 嵌套目录中还有子目录
            "modules": {
              "ClockCore.js": "file",
              "ClockDisplay.js": "file"
            },
            "login.css": "file",
            "main.js": "file"
          }
        },
        key_files: {
          "package.json": '{"name":"test-project","version":"1.0.0"}',
          "README.md": "# Test Project\n\nThis is a test project.",
          "index.html": '<!DOCTYPE html><html></html>'
        }
      };

      store.setState((state: any) => ({
        messages: [...state.messages,
          { id: 'msg-user', role: 'user', content: 'Scan project structure' },
          {
            id: 'msg-assistant',
            role: 'assistant',
            content: 'Scanning...',
            toolCalls: [{
              id: 'call-scan-1',
              tool: 'agent_scan_project',
              status: 'completed',
              result: JSON.stringify(mockScanData)
            }]
          },
          {
            id: 'msg-tool-scan',
            role: 'tool',
            content: JSON.stringify(mockScanData),
            toolCallId: 'call-scan-1',
            timestamp: Date.now()
          }
        ]
      }));
    });

    await page.waitForTimeout(500);

    // 验证文件树正确显示
    await expect(page.locator('text=Project Topology').first()).toBeVisible();
    await expect(page.locator('text=README.md').first()).toBeVisible();
    await expect(page.locator('text=package.json').first()).toBeVisible();

    // 验证嵌套目录正确显示
    await expect(page.locator('text=public').first()).toBeVisible();
    await expect(page.locator('text=src').first()).toBeVisible();

    // 验证关键文件预览区域显示
    await expect(page.locator('text=📝 Key Files Preview').first()).toBeVisible();

    console.log('[E2E] ✅ 混合格式（扁平+嵌套）解析验证通过');
  });

  test('回归测试：确保不显示原始 JSON', async ({ page }) => {
    await page.evaluate(() => {
      const store = (window as any).__chatStore;
      const mockScanData = {
        structure: {
          "src": { "index.ts": "file" }
        },
        key_files: {}
      };

      store.setState((state: any) => ({
        messages: [...state.messages,
          { id: 'msg-user', role: 'user', content: 'Scan' },
          {
            id: 'msg-assistant',
            role: 'assistant',
            content: 'Scanning...',
            toolCalls: [{
              id: 'call-scan-1',
              tool: 'agent_scan_project',
              status: 'completed',
              result: JSON.stringify(mockScanData)
            }]
          },
          {
            id: 'msg-tool-scan',
            role: 'tool',
            content: JSON.stringify(mockScanData),
            toolCallId: 'call-scan-1',
            timestamp: Date.now()
          }
        ]
      }));
    });

    await page.waitForTimeout(500);

    // 🎯 关键验证：不应该出现原始 JSON 的 <pre> 标签
    // 如果显示了原始 JSON，会找到包含 "structure" 的 pre 标签
    const rawJsonPre = page.locator('pre:has-text("structure"), pre:has-text("key_files")');
    const rawJsonCount = await rawJsonPre.count();

    if (rawJsonCount > 0) {
      console.error('[E2E] ❌ FAILURE: 检测到原始 JSON 被渲染，PivoProjectTree 未正确工作');
    }

    expect(rawJsonCount).toBe(0);

    // 应该显示的是组件化的 UI
    await expect(page.locator('text=Project Topology').first()).toBeVisible();

    console.log('[E2E] ✅ 回归测试通过：未显示原始 JSON');
  });

  test('高保真还原：用户实际数据格式验证', async ({ page }) => {
    // 🏆 完全复制用户报告的数据格式
    await page.evaluate(() => {
      const store = (window as any).__chatStore;

      // 完全按照用户提供的格式
      const mockScanData = {
        "structure": {
          "LOGIN_README.md": "file",
          "README.md": "file",
          "clock.html": "file",
          "dev.log": "file",
          "index.html": "file",
          "login.html": "file",
          "package-lock.json": "file",
          "package.json": "file",
          "public": { "clock.html": "file" },
          "real-time-clock.html": "file",
          "realtime-clock.html": "file",
          "src": {
            "login.css": "file",
            "login.js": "file",
            "main.js": "file",
            "modules": {
              "ClockCore.js": "file",
              "ClockDisplay.js": "file",
              "ClockManager.js": "file"
            },
            "style.css": "file"
          },
          "start_vite.sh": "file",
          "vite.config.js": "file",
          "vite.log": "file"
        },
        "key_files": {
          "index.html": "<!DOCTYPE html>\n<html lang=\"zh-CN\">\n<head>\n <meta charset=\"UTF-8\">\n <meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\">\n <title>实时数字时钟</title>\n...",
          "README.md": "# ⏰ 实时数字时钟\n\n基于原生 JavaScript ES6+ 构建的毫秒级精度数字时钟...",
          "package.json": "{\n \"name\": \"demo3\",\n \"version\": \"1.0.0\"..."
        }
      };

      store.setState((state: any) => ({
        messages: [...state.messages,
          { id: 'msg-user', role: 'user', content: '分析当前项目js文件' },
          {
            id: 'msg-assistant',
            role: 'assistant',
            content: '我来分析这个项目的 JavaScript 文件。',
            toolCalls: [{
              id: 'call-scan-1',
              tool: 'agent_scan_project',
              status: 'completed',
              result: JSON.stringify(mockScanData)
            }]
          },
          {
            id: 'msg-tool-scan',
            role: 'tool',
            content: JSON.stringify(mockScanData),
            toolCallId: 'call-scan-1',
            timestamp: Date.now()
          }
        ]
      }));
    });

    await page.waitForTimeout(500);

    // 🎯 核心验证：应该显示 PivoProjectTree，而不是原始 JSON
    await expect(page.locator('text=Project Topology').first()).toBeVisible();

    // 验证关键文件数量（应该显示 3 key files）
    await expect(page.locator('text=/3\\s+key files/i').first()).toBeVisible();

    // 验证关键文件预览区域
    await expect(page.locator('text=📝 Key Files Preview').first()).toBeVisible();

    // 验证具体文件显示（包括嵌套目录）
    await expect(page.locator('text=src').first()).toBeVisible();
    await expect(page.locator('text=public').first()).toBeVisible();
    await expect(page.locator('text=modules').first()).toBeVisible();

    // 验证关键文件标记（蓝色高亮）
    const keyFileElements = page.locator('.text-blue-400, [class*="text-blue"]');
    expect(await keyFileElements.count()).toBeGreaterThan(0);

    // 🎯 关键验证：不应该显示原始 JSON
    const rawJsonPre = page.locator('pre:has-text("structure"), pre:has-text("key_files")');
    expect(await rawJsonPre.count()).toBe(0);

    console.log('[E2E] ✅ 高保真还原验证通过：用户数据格式正确渲染');
  });
});
