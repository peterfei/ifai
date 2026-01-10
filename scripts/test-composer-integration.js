/**
 * Composer 2.0 集成测试脚本
 *
 * 使用方法：
 * 1. 启动开发服务器: APP_EDITION=commercial npm run dev
 * 2. 打开浏览器: http://localhost:1420
 * 3. 打开开发者工具 (F12)
 * 4. 在 Console 中粘贴此脚本并运行
 */

// ============================================================================
// 测试辅助函数
// ============================================================================

/**
 * 模拟 AI 响应，包含文件写入操作
 */
function injectMockAIResponse() {
    const chatStore = window.__chatStore;

    if (!chatStore) {
        console.error('❌ chatStore 未找到，请确保应用已加载');
        return;
    }

    // 创建模拟的 AI 响应消息
    const mockMessage = {
        id: 'test-composer-' + Date.now(),
        role: 'assistant',
        content: '我已为您创建了以下文件：\n\n1. `src/utils/logger.ts` - 日志工具类\n2. `src/config/app.ts` - 应用配置\n3. `tests/logger.test.ts` - 日志测试',
        timestamp: Date.now(),
        toolCalls: [
            {
                id: 'tool-1',
                tool: 'agent_write_file',
                function: {
                    name: 'agent_write_file',
                    arguments: JSON.stringify({
                        rel_path: 'src/utils/logger.ts',
                        content: `// Logger Utility
export class Logger {
    private level: string;

    constructor(level: string = 'info') {
        this.level = level;
    }

    info(message: string) {
        console.log(\`[INFO] \${message}\`);
    }

    error(message: string) {
        console.error(\`[ERROR] \${message}\`);
    }
}

export const logger = new Logger();`
                    })
                },
                result: {
                    success: true,
                    message: 'File created successfully',
                    originalContent: '',  // 空表示新建文件
                    newContent: '// Logger Utility...',
                    filePath: '/project/src/utils/logger.ts',
                    timestamp: Date.now()
                },
                status: 'completed'
            },
            {
                id: 'tool-2',
                tool: 'agent_write_file',
                function: {
                    name: 'agent_write_file',
                    arguments: JSON.stringify({
                        rel_path: 'src/config/app.ts',
                        content: `// App Configuration
export const config = {
    appName: 'My App',
    version: '1.0.0',
    debug: true
};`
                    })
                },
                result: {
                    success: true,
                    message: 'File created successfully',
                    originalContent: '',
                    newContent: '// App Configuration...',
                    filePath: '/project/src/config/app.ts',
                    timestamp: Date.now()
                },
                status: 'completed'
            },
            {
                id: 'tool-3',
                tool: 'agent_write_file',
                function: {
                    name: 'agent_write_file',
                    arguments: JSON.stringify({
                        rel_path: 'src/utils/logger.ts',
                        content: `// Logger Utility v2 - Updated
export class Logger {
    private level: string;

    constructor(level: string = 'info') {
        this.level = level;
    }

    info(message: string, data?: any) {
        if (this.level === 'info' || this.level === 'debug') {
            console.log(\`[INFO] \${message}\`, data || '');
        }
    }

    error(message: string) {
        console.error(\`[ERROR] \${message}\`);
    }

    debug(message: string) {
        if (this.level === 'debug') {
            console.log(\`[DEBUG] \${message}\`);
        }
    }
}

export const logger = new Logger();`
                    })
                },
                result: {
                    success: true,
                    message: 'File updated successfully',
                    originalContent: '// Logger Utility...',  // 原始内容
                    newContent: '// Logger Utility v2...',  // 新内容
                    filePath: '/project/src/utils/logger.ts',
                    timestamp: Date.now()
                },
                status: 'completed'
            }
        ]
    };

    // 添加消息到 store
    const currentState = chatStore.getState();
    currentState.addMessage(mockMessage);

    console.log('✅ 模拟 AI 响应已注入');
    console.log('📁 包含 3 个文件操作：');
    console.log('   1. src/utils/logger.ts (新建)');
    console.log('   2. src/config/app.ts (新建)');
    console.log('   3. src/utils/logger.ts (修改)');
    console.log('\n👀 现在应该可以看到"查看 Diff (3 个文件)"按钮');
}

/**
 * 检查当前消息状态
 */
function checkCurrentState() {
    const chatStore = window.__chatStore;

    if (!chatStore) {
        console.error('❌ chatStore 未找到');
        return;
    }

    const state = chatStore.getState();
    const messages = state.messages;

    console.log('📊 当前状态：');
    console.log(`   消息数量: ${messages.length}`);
    console.log(`   加载中: ${state.isLoading}`);

    // 查找包含文件写入的消息
    const fileWriteMessages = messages.filter(msg => {
        if (!msg.toolCalls) return false;
        return msg.toolCalls.some(tc =>
            (tc.tool === 'agent_write_file' ||
             tc.function?.name === 'agent_write_file') &&
            tc.result?.success
        );
    });

    console.log(`   包含文件写入的消息: ${fileWriteMessages.length}`);

    fileWriteMessages.forEach((msg, idx) => {
        const fileOps = msg.toolCalls.filter(tc =>
            tc.tool === 'agent_write_file' ||
            tc.function?.name === 'agent_write_file'
        );
        console.log(`\n   消息 ${idx + 1}: ${fileOps.length} 个文件操作`);
        fileOps.forEach(tc => {
            const args = JSON.parse(tc.function?.arguments || '{}');
            console.log(`      - ${args.rel_path || tc.function?.name}`);
        });
    });
}

/**
 * 打开 Composer（如果有文件变更）
 */
function openComposerManually() {
    const chatStore = window.__chatStore;

    if (!chatStore) {
        console.error('❌ chatStore 未找到');
        return;
    }

    const state = chatStore.getState();
    const messages = state.messages;

    // 查找最后一个包含文件写入的消息
    for (let i = messages.length - 1; i >= 0; i--) {
        const msg = messages[i];
        if (msg.toolCalls && msg.toolCalls.some(tc =>
            (tc.tool === 'agent_write_file' ||
             tc.function?.name === 'agent_write_file') &&
            tc.result?.success
        )) {
            // 找到消息了，现在尝试打开 Composer
            console.log(`📝 找到文件变更消息: ${msg.id}`);
            console.log('💡 请点击消息下方的"查看 Diff"按钮');
            console.log('   或直接调用：');

            // 尝试从 DOM 中找到按钮
            const buttons = document.querySelectorAll('[class*="composer"]');
            if (buttons.length > 0) {
                console.log('✅ 找到 Composer 按钮');
                buttons[0].click();
            } else {
                console.log('⚠️  未找到 Composer 按钮，请等待 UI 更新');
            }

            return;
        }
    }

    console.log('❌ 未找到包含文件变更的消息');
    console.log('💡 请先运行 injectMockAIResponse()');
}

/**
 * 清理测试数据
 */
function cleanupTestData() {
    // 这里可以添加清理逻辑
    console.log('🧹 测试数据清理功能待实现');
}

// ============================================================================
// 测试菜单
// ============================================================================

function showTestMenu() {
    console.log(`
╔════════════════════════════════════════════════════════════╗
║           Composer 2.0 集成测试菜单                          ║
╠════════════════════════════════════════════════════════════╣
║  1. 注入模拟 AI 响应                                        ║
║     testComposer.inject()                                    ║
║                                                            ║
║  2. 检查当前状态                                           ║
║     testComposer.check()                                     ║
║                                                            ║
║  3. 打开 Composer 面板                                     ║
║     testComposer.open()                                     ║
║                                                            ║
║  4. 清理测试数据                                           ║
║     testComposer.cleanup()                                  ║
╚════════════════════════════════════════════════════════════╝
    `);
}

// ============================================================================
// 导出测试 API
// ============================================================================

window.testComposer = {
    inject: injectMockAIResponse,
    check: checkCurrentState,
    open: openComposerManually,
    cleanup: cleanupTestData,
    menu: showTestMenu
};

// 显示欢迎信息
console.log(`
✅ Composer 2.0 测试工具已加载！
📖 使用 testComposer.menu() 查看所有可用命令
🚀 快速开始: testComposer.inject()
`);

// 自动显示菜单
showTestMenu();
