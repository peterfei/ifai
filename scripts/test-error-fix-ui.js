/**
 * v0.2.8 错误修复 UI 测试脚本
 *
 * 在浏览器控制台中运行此脚本来测试错误修复功能
 */

console.log('🧪 错误修复 UI 测试工具\n');

// ============================================================================
// 1. 模拟终端错误输出
// ============================================================================

const mockTerminalErrors = [
    // Rust 错误示例
    `error[E0308]: mismatched types
   --> src-tauri/src/commands/atomic_commands.rs:56:18
    |
56  |     pub created_at: i64,
    |                  ^^^ expected \`chrono::DateTime<chrono::Utc>\`, found \`i64\`
    |
    = note:         expected struct \`chrono::DateTime<chrono::Utc>\`
                    found type \`i64\`
help: consider calling \`Into::into\` on this expression
   --> src-tauri/src/commands/atomic_commands.rs:56:18
    |
56  |     pub created_at: i64,
    |                        ^^^^^^^^^^^^(.into())`,

    // TypeScript 错误示例
    `src/services/errorFixService.ts:120:5 - error TS2322: Type 'string' is not assignable to type 'number'.
    120     const line: number = "123";
            ~~~~
    The expected type comes from property 'line' which is declared here on type 'ParsedError'`,

    // Python 错误示例
    `Traceback (most recent call last):
  File "src/main.py", line 42, in <module>
    result = process_data(data)
TypeError: process_data() argument must be str, not int`
];

// ============================================================================
// 2. 查找并测试错误检测功能
// ============================================================================

/**
 * 测试 1: 检查 AIChat 组件是否暴露了错误处理函数
 */
function testErrorHandlingIntegration() {
    console.log('🔍 测试 1: 检查错误处理集成...\n');

    // 尝试访问全局 store
    if (window.__chatStore) {
        console.log('✅ 找到 __chatStore');
        const store = window.__chatStore.getState();
        console.log('   - messages:', store.messages?.length || 0);
    } else {
        console.log('⚠️  未找到 __chatStore');
    }

    // 检查是否有文件操作相关的状态
    const root = document.querySelector('#root');
    if (root) {
        console.log('✅ 找到 React root');
    } else {
        console.log('❌ 未找到 React root');
    }

    console.log('');
}

/**
 * 测试 2: 手动触发 Composer 面板
 */
function testComposerPanel() {
    console.log('🔍 测试 2: Composer 面板测试...\n');

    // 查找 "查看 Diff" 按钮
    const buttons = Array.from(document.querySelectorAll('button')).filter(btn => {
        const text = btn.textContent;
        return text.includes('查看 Diff') || text.includes('个文件');
    });

    if (buttons.length > 0) {
        console.log(`✅ 找到 ${buttons.length} 个 Composer 按钮`);
        buttons.forEach((btn, idx) => {
            console.log(`   按钮 ${idx + 1}: "${btn.textContent.trim()}"`);
        });
    } else {
        console.log('⚠️  未找到 Composer 按钮');
        console.log('   💡 需要先让 AI 返回包含文件写入的响应');
    }

    console.log('');
}

/**
 * 测试 3: 创建模拟的错误修复按钮
 */
function createErrorFixButton() {
    console.log('🔍 测试 3: 创建错误修复测试按钮...\n');

    // 移除已存在的按钮
    const existing = document.querySelector('#test-error-fix-btn');
    if (existing) {
        existing.remove();
    }

    // 创建浮动测试按钮
    const button = document.createElement('button');
    button.id = 'test-error-fix-btn';
    button.innerHTML = '🧪 测试错误修复';
    button.style.cssText = `
        position: fixed;
        bottom: 20px;
        right: 20px;
        z-index: 99999;
        padding: 12px 20px;
        background: #f44336;
        color: white;
        border: none;
        border-radius: 8px;
        cursor: pointer;
        font-size: 14px;
        font-weight: 600;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    `;

    button.onclick = () => {
        showErrorFixDemo();
    };

    document.body.appendChild(button);
    console.log('✅ 测试按钮已添加到页面右下角');
    console.log('   💡 点击按钮可以查看错误修复演示\n');
}

/**
 * 显示错误修复演示面板
 */
function showErrorFixDemo() {
    console.log('🎨 显示错误修复演示面板...\n');

    // 移除已存在的面板
    const existing = document.querySelector('#error-fix-demo-panel');
    if (existing) {
        existing.remove();
    }

    const panel = document.createElement('div');
    panel.id = 'error-fix-demo-panel';
    panel.innerHTML = `
        <div style="
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            width: 600px;
            max-height: 80vh;
            background: #252526;
            border-radius: 12px;
            border: 1px solid #3c3c3c;
            box-shadow: 0 20px 60px rgba(0,0,0,0.5);
            z-index: 99998;
            display: flex;
            flex-direction: column;
            overflow: hidden;
        ">
            <!-- 头部 -->
            <div style="
                padding: 16px 20px;
                border-bottom: 1px solid #3c3c3c;
                background: #1e1e1e;
                display: flex;
                justify-content: space-between;
                align-items: center;
            ">
                <div style="display: flex; align-items: center; gap: 10px;">
                    <span style="font-size: 20px;">🐛</span>
                    <div>
                        <h3 style="margin: 0; font-size: 16px; color: #fff;">错误修复演示</h3>
                        <span style="font-size: 12px; color: #888;">检测到 3 个可修复错误</span>
                    </div>
                </div>
                <button onclick="document.querySelector('#error-fix-demo-panel').remove()" style="
                    background: transparent;
                    border: none;
                    color: #888;
                    font-size: 18px;
                    cursor: pointer;
                    padding: 4px;
                ">✕</button>
            </div>

            <!-- 错误列表 -->
            <div style="flex: 1; overflow-y: auto; padding: 16px;">
                ${mockTerminalErrors.map((error, idx) => `
                    <div style="
                        margin-bottom: 12px;
                        padding: 12px;
                        background: #1e1e1e;
                        border: 1px solid #3c3c3c;
                        border-radius: 8px;
                        border-left: 3px solid #f44336;
                    ">
                        <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 8px;">
                            <div style="flex: 1;">
                                <div style="font-size: 12px; color: #f44336; font-weight: 600; margin-bottom: 4px;">
                                    ${error.split('\n')[0]}
                                </div>
                                <div style="font-size: 11px; color: #888; font-family: monospace;">
                                    ${error.split('\n')[1] || ''}
                                </div>
                            </div>
                            <button class="fix-btn" data-error="${idx}" style="
                                padding: 6px 12px;
                                background: #4caf50;
                                color: white;
                                border: none;
                                border-radius: 4px;
                                font-size: 12px;
                                cursor: pointer;
                                white-space: nowrap;
                            ">修复</button>
                        </div>
                        <pre style="
                            margin: 8px 0 0 0;
                            font-size: 11px;
                            color: #d4d4d4;
                            background: #2d2d2d;
                            padding: 8px;
                            border-radius: 4px;
                            overflow-x: auto;
                            max-height: 100px;
                        ">${error.substring(0, 200)}...</pre>
                    </div>
                `).join('')}
            </div>

            <!-- 底部操作 -->
            <div style="
                padding: 12px 16px;
                border-top: 1px solid #3c3c3c;
                background: #1e1e1e;
                display: flex;
                justify-content: space-between;
                align-items: center;
            ">
                <span style="font-size: 12px; color: #888;">
                    💡 点击"修复"将错误发送给 AI 助手
                </span>
                <button onclick="document.querySelector('#error-fix-demo-panel').remove()" style="
                    padding: 8px 16px;
                    background: transparent;
                    color: #888;
                    border: 1px solid #444;
                    border-radius: 4px;
                    cursor: pointer;
                    font-size: 12px;
                ">关闭</button>
            </div>
        </div>
    `;

    // 添加事件监听
    setTimeout(() => {
        panel.querySelectorAll('.fix-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const errorIdx = parseInt(e.target.dataset.error);
                console.log('✅ 修复按钮被点击，错误索引:', errorIdx);
                alert(`模拟：已将错误 ${errorIdx + 1} 发送给 AI 助手\n\n实际功能中，这会在聊天框中填入修复请求。`);
            });
        });
    }, 0);

    document.body.appendChild(panel);
}

/**
 * 测试 4: 模拟 AI 返回文件写入操作
 */
function simulateAIFileWrite() {
    console.log('🔍 测试 4: 模拟 AI 文件写入...\n');
    console.log('⚠️  此测试需要完整的 AI 对话流程');
    console.log('   💡 请直接在聊天中输入："创建一个名为 test.txt 的文件，内容是 Hello World"\n');
}

// ============================================================================
// 运行测试
// ============================================================================

console.log('开始运行测试...\n');

testErrorHandlingIntegration();
testComposerPanel();
createErrorFixButton();
simulateAIFileWrite();

console.log('╔════════════════════════════════════════════════════════════╗');
console.log('║           错误修复 UI 测试工具已加载                       ║');
console.log('╠════════════════════════════════════════════════════════════╣');
console.log('║  可用操作:                                                 ║');
console.log('║  - 点击右下角"🧪 测试错误修复"按钮查看演示               ║');
console.log('║  - 在聊天中让 AI 修改文件以测试 Composer                  ║');
console.log('║  - 运行以下命令进行更多测试:                              ║');
console.log('║                                                            ║');
console.log('║    testErrorFix.integration()  - 检查集成状态            ║');
console.log('║    testErrorFix.composer()      - 测试 Composer           ║');
console.log('║    testErrorFix.demo()          - 显示演示面板            ║');
console.log('╚════════════════════════════════════════════════════════════╝');

// 导出 API
window.testErrorFix = {
    integration: testErrorHandlingIntegration,
    composer: testComposerPanel,
    demo: showErrorFixDemo,
    simulateWrite: simulateAIFileWrite,
};

console.log('\n✅ 测试工具已就绪！');
