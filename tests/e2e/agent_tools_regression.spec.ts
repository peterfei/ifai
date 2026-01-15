import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment } from './setup-utils';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

// ESM 模块兼容：获取 __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Agent Tools Regression Test Suite
 *
 * Tests all agent tools with DeepSeek streaming simulation to ensure
 * the fix for id: null parameter chunks works correctly across all tools.
 */

// Helper to load env config
function loadEnvConfig(configPath: string): Record<string, string> {
  try {
    const content = fs.readFileSync(configPath, 'utf-8');
    const config: Record<string, string> = {};
    content.split('\n').forEach(line => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) return;
        const match = trimmed.match(/^([^=]+)=(.*)$/);
        if (match) {
            config[match[1].trim()] = match[2].trim().replace(/^['"]|['"]$/g, '');
        }
    });
    return config;
  } catch (e) {
    console.warn(`[Agent Tools Test] Failed to load config from ${configPath}`);
    return {};
  }
}

test.describe('Agent Tools Regression Tests', () => {
    test.setTimeout(60000);

    // Load configuration once for all tests
    let envConfig: Record<string, string>;

    test.beforeAll(async () => {
        const envPath = path.resolve(__dirname, '.env.e2e.local');
        envConfig = loadEnvConfig(envPath);
    });

    // Helper function to setup test environment
    async function setupToolTest(page: any, toolName: string, mockFiles?: Record<string, string>) {
        const apiKey = envConfig.E2E_AI_API_KEY || envConfig.DEEPSEEK_API_KEY;
        const baseUrl = envConfig.E2E_AI_BASE_URL || envConfig.DEEPSEEK_BASE_URL || 'https://api.deepseek.com';
        const model = envConfig.E2E_AI_MODEL || envConfig.DEEPSEEK_MODEL || 'deepseek-chat';

        if (!apiKey) {
            test.skip(true, `Skipping ${toolName} test: No API Key found`);
            throw new Error('No API key');
        }

        // Setup with DeepSeek streaming simulation enabled
        await setupE2ETestEnvironment(page, {
            useRealAI: true,
            realAIApiKey: apiKey,
            realAIBaseUrl: baseUrl,
            realAIModel: model,
            simulateDeepSeekStreaming: true
        });

        // Create mock files if provided
        if (mockFiles) {
            await page.evaluate((files: Record<string, string>) => {
                const mockFS = (window as any).__E2E_MOCK_FILE_SYSTEM__;
                if (mockFS) {
                    Object.entries(files).forEach(([filePath, content]) => {
                        mockFS.set(filePath, content);
                    });
                }
            }, mockFiles);
        }

        await page.goto('/');
        await page.reload();
        await page.waitForTimeout(3000);

        // Re-create mock files after app load
        if (mockFiles) {
            await page.evaluate((files: Record<string, string>) => {
                const mockFS = (window as any).__E2E_MOCK_FILE_SYSTEM__;
                if (mockFS) {
                    Object.entries(files).forEach(([filePath, content]) => {
                        mockFS.set(filePath, content);
                    });
                }
            }, mockFiles);
        }

        await page.waitForFunction(() => (window as any).__chatStore !== undefined, { timeout: 15000 });
        await page.waitForTimeout(2000);

        // Open chat
        await page.evaluate(() => {
            const layoutStore = (window as any).__layoutStore;
            if (layoutStore) {
                const store = layoutStore.useLayoutStore || layoutStore;
                if (store && store.getState && !store.getState().isChatOpen) {
                    store.getState().toggleChat();
                }
            }
        });
        await page.waitForTimeout(1000);
    }

    // Helper to verify tool call result
    async function verifyToolCall(page: any, expectedToolName: string, expectedArgs?: Record<string, any>) {
        const toolCalls = await page.evaluate(() => {
            const chatStore = (window as any).__chatStore;
            const msgs = chatStore ? chatStore.getState().messages : [];
            return msgs.flatMap((m: any) => m.toolCalls || []);
        });

        console.log(`[Agent Tools Test] Found ${toolCalls.length} tool calls`);
        toolCalls.forEach((tc: any) => {
            console.log(`[Agent Tools Test]   - Tool: ${tc.tool}, Status: ${tc.status}, Args:`, JSON.stringify(tc.args));
        });

        const targetCall = toolCalls.find((tc: any) => tc.tool === expectedToolName);
        expect(targetCall, `Expected tool call "${expectedToolName}" not found`).toBeDefined();

        if (expectedArgs) {
            Object.entries(expectedArgs).forEach(([key, value]) => {
                const actualValue = targetCall.args?.[key];
                expect(actualValue, `Expected ${key} to be ${value}, got ${actualValue}`).toBe(value);
            });
        }

        return targetCall;
    }

    test('agent_read_file with DeepSeek streaming', async ({ page }) => {
        const mockFiles = {
            '/Users/mac/mock-project/test.txt': 'Test file content for agent_read_file'
        };

        await setupToolTest(page, 'agent_read_file', mockFiles);

        const prompt = 'Read test.txt';
        await page.evaluate(async (text) => {
            const chatStore = (window as any).__chatStore;
            if (chatStore) {
                await chatStore.getState().sendMessage(text);
            }
        }, prompt);

        await page.waitForTimeout(30000);

        await verifyToolCall(page, 'agent_read_file', { relPath: 'test.txt' });

        // Verify content was displayed
        const messages = await page.evaluate(() => {
            const chatStore = (window as any).__chatStore;
            return chatStore ? chatStore.getState().messages : [];
        });

        const assistantMessages = messages.filter((m: any) => m.role === 'assistant');
        const contentFound = assistantMessages.some((m: any) =>
            (m.content || '').includes('Test file content')
        );

        expect(contentFound, 'Expected file content to be displayed').toBe(true);
    });

    test('agent_write_file with DeepSeek streaming', async ({ page }) => {
        await setupToolTest(page, 'agent_write_file');

        const prompt = 'Write "Hello World" to hello.txt';
        await page.evaluate(async (text) => {
            const chatStore = (window as any).__chatStore;
            if (chatStore) {
                await chatStore.getState().sendMessage(text);
            }
        }, prompt);

        await page.waitForTimeout(30000);

        await verifyToolCall(page, 'agent_write_file', {
            relPath: 'hello.txt',
            content: 'Hello World'
        });
    });

    test('agent_list_dir with DeepSeek streaming', async ({ page }) => {
        await setupToolTest(page, 'agent_list_dir');

        const prompt = 'List files in the current directory';
        await page.evaluate(async (text) => {
            const chatStore = (window as any).__chatStore;
            if (chatStore) {
                await chatStore.getState().sendMessage(text);
            }
        }, prompt);

        await page.waitForTimeout(30000);

        await verifyToolCall(page, 'agent_list_dir');

        // Verify directory listing was displayed
        const messages = await page.evaluate(() => {
            const chatStore = (window as any).__chatStore;
            return chatStore ? chatStore.getState().messages : [];
        });

        const assistantMessages = messages.filter((m: any) => m.role === 'assistant');
        const listingFound = assistantMessages.some((m: any) =>
            (m.content || '').includes('src/') || (m.content || '').includes('tests/')
        );

        expect(listingFound, 'Expected directory listing to be displayed').toBe(true);
    });

    test('agent_delete_file with DeepSeek streaming', async ({ page }) => {
        const mockFiles = {
            '/Users/mac/mock-project/to_delete.txt': 'This file will be deleted'
        };

        await setupToolTest(page, 'agent_delete_file', mockFiles);

        const prompt = 'Delete to_delete.txt';
        await page.evaluate(async (text) => {
            const chatStore = (window as any).__chatStore;
            if (chatStore) {
                await chatStore.getState().sendMessage(text);
            }
        }, prompt);

        await page.waitForTimeout(30000);

        await verifyToolCall(page, 'agent_delete_file', { relPath: 'to_delete.txt' });
    });

    test('agent_list_functions with DeepSeek streaming', async ({ page }) => {
        const mockFiles = {
            '/Users/mac/mock-project/code.ts': 'function test1() {}\nfunction test2() {}'
        };

        await setupToolTest(page, 'agent_list_functions', mockFiles);

        const prompt = 'List functions in code.ts';
        await page.evaluate(async (text) => {
            const chatStore = (window as any).__chatStore;
            if (chatStore) {
                await chatStore.getState().sendMessage(text);
            }
        }, prompt);

        await page.waitForTimeout(30000);

        await verifyToolCall(page, 'agent_list_functions', { relPath: 'code.ts' });
    });

    test('agent_read_file_range with DeepSeek streaming', async ({ page }) => {
        const mockFiles = {
            '/Users/mac/mock-project/multiline.txt': 'Line 1\nLine 2\nLine 3\nLine 4\nLine 5'
        };

        await setupToolTest(page, 'agent_read_file_range', mockFiles);

        const prompt = 'Read lines 2-4 from multiline.txt';
        await page.evaluate(async (text) => {
            const chatStore = (window as any).__chatStore;
            if (chatStore) {
                await chatStore.getState().sendMessage(text);
            }
        }, prompt);

        await page.waitForTimeout(30000);

        // Verify tool call with range parameters
        const targetCall = await verifyToolCall(page, 'agent_read_file_range', { relPath: 'multiline.txt' });

        // Check that startLine and endLine are present
        expect(targetCall.args?.startLine, 'Expected startLine to be defined').toBeDefined();
        expect(targetCall.args?.endLine, 'Expected endLine to be defined').toBeDefined();
    });

    test('multiple tool calls in sequence with DeepSeek streaming', async ({ page }) => {
        const mockFiles = {
            '/Users/mac/mock-project/file1.txt': 'Content 1',
            '/Users/mac/mock-project/file2.txt': 'Content 2'
        };

        await setupToolTest(page, 'multiple tools', mockFiles);

        const prompt = 'Read file1.txt and then write "new content" to file2.txt';
        await page.evaluate(async (text) => {
            const chatStore = (window as any).__chatStore;
            if (chatStore) {
                await chatStore.getState().sendMessage(text);
            }
        }, prompt);

        await page.waitForTimeout(40000);

        const toolCalls = await page.evaluate(() => {
            const chatStore = (window as any).__chatStore;
            const msgs = chatStore ? chatStore.getState().messages : [];
            return msgs.flatMap((m: any) => m.toolCalls || []);
        });

        console.log(`[Agent Tools Test] Found ${toolCalls.length} tool calls in sequence test`);

        // Should have at least 2 tool calls
        expect(toolCalls.length, 'Expected at least 2 tool calls').toBeGreaterThanOrEqual(2);

        // Verify we have both read and write operations
        const hasRead = toolCalls.some((tc: any) => tc.tool === 'agent_read_file');
        const hasWrite = toolCalls.some((tc: any) => tc.tool === 'agent_write_file');

        expect(hasRead, 'Expected agent_read_file to be called').toBe(true);
        expect(hasWrite, 'Expected agent_write_file to be called').toBe(true);
    });
});
