import { Page } from '@playwright/test';

/**
 * v0.2.8 专用的 Fixtures
 */

export const MOCK_COMPOSER_RESPONSE = {
    role: 'assistant',
    content: 'I will refactor the project across multiple files.',
    tool_calls: [
        {
            name: 'composer_edit',
            arguments: {
                changes: [
                    {
                        path: 'src/services/auth.rs',
                        content: '// Refactored Auth Service\nuse crate::traits::Logger;\n...' // Corrected: \n to actual newline
                    },
                    {
                        path: 'src/traits/mod.rs',
                        content: 'pub trait Logger { fn info(&self, msg: &str); }'
                    }
                ]
            }
        }
    ]
};

/**
 * 注入一个模拟的 Composer 响应到前端 Store
 */
export async function injectComposerResponse(page: Page) {
    await page.evaluate((response) => {
        const chatStore = (window as any).__chatStore?.getState();
        if (chatStore) {
            chatStore.messages.push({
                id: `mock-composer-${Date.now()}`,
                role: response.role,
                content: { Text: response.content },
                tool_calls: response.tool_calls.map(tc => ({
                    id: `call-${Math.random()}`,
                    function: tc
                })),
                timestamp: Date.now(),
                status: 'completed'
            });
        }
    }, MOCK_COMPOSER_RESPONSE);
}

/**
 * 模拟一个终端错误输出
 */
export const MOCK_RUST_ERROR = `
error[E0433]: failed to resolve: use of undeclared type 
  --> src/main.rs:10:15
   |
10 |     let u = User::new();
   |               ^^^^ not found in this scope
`;
