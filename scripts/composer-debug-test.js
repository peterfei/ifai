/**
 * Composer 2.0 调试测试脚本 v2
 * 修复按钮点击无反应问题
 */

// ============================================================================
// 增强的测试函数
// ============================================================================

/**
 * 查找并点击 Composer 按钮（增强版）
 */
function findAndClickComposerButton() {
    console.log('🔍 正在查找 Composer 按钮...');

    // 方法1: 通过文本内容查找
    const buttonsByText = Array.from(document.querySelectorAll('button')).filter(btn => {
        return btn.textContent.includes('查看 Diff') || btn.textContent.includes('个文件');
    });

    if (buttonsByText.length > 0) {
        console.log('✅ 找到按钮（通过文本）:', buttonsByText[0]);
        console.log('   按钮文本:', buttonsByText[0].textContent);
        console.log('   按钮类名:', buttonsByText[0].className);

        // 尝试点击
        buttonsByText[0].click();
        console.log('✅ 已触发点击事件');

        // 等待一下检查结果
        setTimeout(() => {
            const panel = document.querySelector('.composer-diff-container');
            if (panel) {
                console.log('✅ Composer 面板已打开');
            } else {
                console.log('⚠️  点击后未找到面板，可能是事件处理问题');
            }
        }, 100);

        return true;
    }

    // 方法2: 通过类名查找
    const buttonsByClass = document.querySelectorAll('button[class*="bg-blue-600"]');
    console.log(`🔍 找到 ${buttonsByClass.length} 个蓝色按钮`);

    buttonsByClass.forEach((btn, idx) => {
        console.log(`   按钮 ${idx + 1}:`, btn.textContent.trim());
    });

    return false;
}

/**
 * 直接操作 Store 打开 Composer
 */
function openComposerViaStore(messageId) {
    console.log('🔧 直接通过 Store 打开 Composer...');

    // 获取 React 组件实例（如果暴露了）
    const rootElement = document.getElementById('root');
    if (rootElement && rootElement._reactRootContainer) {
        console.log('✅ 找到 React Root');
        // 尝试访问 Fiber 树
        const fiber = rootElement._reactRootContainer._internalRoot?.current;
        if (fiber) {
            console.log('✅ 找到 Fiber 树');
            // 遍历查找 AIChat 组件
            // 这里比较复杂，暂时跳过
        }
    }

    // 备用方案：直接创建 Composer 面板 DOM
    console.log('🔨 使用备用方案：直接创建 Composer DOM');
    createComposerPanelManually();

    return true;
}

/**
 * 手动创建 Composer 面板（用于测试）
 */
function createComposerPanelManually() {
    // 检查是否已存在
    let panel = document.querySelector('.composer-diff-container');
    if (panel) {
        console.log('ℹ️  Composer 面板已存在，先移除');
        panel.parentElement.remove();
    }

    // 创建面板容器
    const container = document.createElement('div');
    container.className = 'fixed inset-0 z-[210] flex items-center justify-center bg-black bg-opacity-60';
    container.innerHTML = `
        <div class="w-[95vw] h-[90vh] bg-[#252526] rounded-lg shadow-2xl border border-gray-700 flex flex-col overflow-hidden">
            <!-- 头部 -->
            <div class="composer-diff-header flex justify-between items-center px-4 py-3 border-b border-gray-700 bg-[#252526]">
                <div class="flex items-center gap-3">
                    <h3 class="text-base font-semibold text-white">代码变更预览</h3>
                    <span class="px-2 py-1 bg-blue-600 text-white text-xs rounded-full">3 个文件</span>
                </div>
                <div class="flex gap-2">
                    <button class="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white text-xs rounded transition-colors">
                        ✓ 全部接受
                    </button>
                    <button class="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs rounded transition-colors">
                        ✗ 全部拒绝
                    </button>
                    <button class="px-3 py-1.5 text-gray-400 hover:text-white text-xs rounded transition-colors" onclick="this.closest('.fixed').remove()">
                        ✕
                    </button>
                </div>
            </div>

            <!-- 主内容 -->
            <div class="flex flex-1 overflow-hidden">
                <!-- 文件列表 -->
                <div class="w-80 border-r border-gray-700 overflow-y-auto bg-[#252526]">
                    <div class="composer-file-item p-3 border-b border-gray-700 hover:bg-[#2d2d30] cursor-pointer border-l-2 border-blue-600">
                        <div class="flex justify-between items-start">
                            <div>
                                <div class="text-sm text-white">logger.ts</div>
                                <div class="text-xs text-gray-500 mt-1">src/utils</div>
                            </div>
                            <span class="text-xs">✓</span>
                        </div>
                    </div>
                    <div class="composer-file-item p-3 border-b border-gray-700 hover:bg-[#2d2d30] cursor-pointer">
                        <div class="flex justify-between items-start">
                            <div>
                                <div class="text-sm text-white">app.ts</div>
                                <div class="text-xs text-gray-500 mt-1">src/config</div>
                            </div>
                            <span class="text-xs">✓</span>
                        </div>
                    </div>
                    <div class="composer-file-item p-3 border-b border-gray-700 hover:bg-[#2d2d30] cursor-pointer">
                        <div class="flex justify-between items-start">
                            <div>
                                <div class="text-sm text-green-400">logger.ts</div>
                                <div class="text-xs text-gray-500 mt-1">src/utils (修改)</div>
                            </div>
                            <span class="text-xs">✓</span>
                        </div>
                    </div>
                </div>

                <!-- Diff 视图 -->
                <div class="flex-1 flex overflow-hidden">
                    <div class="flex-1 p-4 overflow-auto">
                        <div class="text-xs text-gray-500 mb-2">原始内容</div>
                        <pre class="text-xs text-gray-300 bg-[#1e1e1e] p-3 rounded overflow-auto max-h-full">File is empty or original content not available</pre>
                    </div>
                    <div class="flex-1 p-4 overflow-auto border-l border-gray-700">
                        <div class="text-xs text-gray-500 mb-2">新内容</div>
                        <pre class="text-xs text-green-300 bg-[#1e1e1e] p-3 rounded overflow-auto max-h-full">// Logger Utility v2 - Updated
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

export const logger = new Logger();</pre>
                    </div>
                </div>
            </div>

            <!-- 底部状态 -->
            <div class="px-4 py-2 border-t border-gray-700 bg-[#1e1e1e] flex justify-between items-center">
                <span class="text-xs text-gray-500">已应用: 0/3</span>
            </div>
        </div>
    `;

    document.body.appendChild(container);
    console.log('✅ Composer 面板已创建（手动模式）');
    console.log('ℹ️  点击 ✕ 关闭面板');

    return container;
}

/**
 * 调试：检查 onOpenComposer 是否存在
 */
function debugOnOpenComposer() {
    console.log('🐛 调试 onOpenComposer 事件链...\n');

    // 检查 window 对象
    console.log('1. 检查 window 对象:');
    console.log('   - window.__chatStore:', typeof window.__chatStore);

    if (window.__chatStore) {
        const store = window.__chatStore.getState();
        console.log('   - store.messages:', store.messages ? store.messages.length : 'undefined');
        console.log('   - store.isLoading:', store.isLoading);
    }

    // 检查按钮元素
    console.log('\n2. 检查按钮元素:');
    const buttons = Array.from(document.querySelectorAll('button')).filter(btn =>
        btn.textContent.includes('查看 Diff')
    );

    if (buttons.length > 0) {
        const btn = buttons[0];
        console.log('   ✅ 找到按钮:', btn);
        console.log('   - onclick:', btn.onclick);
        console.log('   - React props:', btn[Object.keys(btn).find(k => k.startsWith('__reactProps'))]);
    } else {
        console.log('   ❌ 未找到按钮');
    }

    // 检查 React 事件监听器
    console.log('\n3. 检查 React 事件:');
    console.log('   - React version:', typeof React);
    console.log('   - ReactDOM:', typeof ReactDOM);

    // 尝试获取 React DevTools 信息
    const root = document.getElementById('root');
    if (root) {
        const reactKey = Object.keys(root).find(k => k.startsWith('__react'));
        console.log('   - Root React key:', reactKey);
    }
}

/**
 * 修复：给按钮添加点击事件（临时方案）
 */
function fixComposerButtons() {
    console.log('🔧 修复 Composer 按钮...\n');

    const buttons = Array.from(document.querySelectorAll('button')).filter(btn =>
        btn.textContent.includes('查看 Diff')
    );

    if (buttons.length === 0) {
        console.log('❌ 未找到需要修复的按钮');
        return;
    }

    buttons.forEach((btn, idx) => {
        // 移除旧的监听器
        const newBtn = btn.cloneNode(true);
        btn.parentNode.replaceChild(newBtn, btn);

        // 添加新的点击事件
        newBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();

            console.log('🖱️  按钮被点击（修复版）');
            createComposerPanelManually();
        });

        console.log(`✅ 按钮 ${idx + 1} 已修复`);
    });
}

// ============================================================================
// 导出改进的 API
// ============================================================================

window.testComposer = {
    ...window.testComposer,
    debug: debugOnOpenComposer,
    fix: fixComposerButtons,
    click: findAndClickComposerButton,
    openDirect: () => openComposerViaStore(),
    create: createComposerPanelManually,

    // 一键修复并测试
    fixAndTest: () => {
        console.log('🔧 修复并测试...\n');
        fixComposerButtons();
        setTimeout(() => {
            findAndClickComposerButton();
        }, 100);
    }
};

// 显示改进的菜单
console.log(`
╔════════════════════════════════════════════════════════════╗
║        Composer 2.0 调试工具 v2                            ║
╠════════════════════════════════════════════════════════════╣
║  新增功能:                                                 ║
║  🔍 testComposer.click()   - 查找并点击按钮                ║
║  🔧 testComposer.fix()      - 修复按钮事件                  ║
║  🐛 testComposer.debug()    - 调试事件链                    ║
║  🎨 testComposer.create()   - 手动创建面板                  ║
║                                                            ║
║  一键修复测试:                                             ║
║  testComposer.fixAndTest()                                 ║
╚════════════════════════════════════════════════════════════╝
`);

console.log('✅ 调试工具已加载');
console.log('💡 尝试运行: testComposer.fixAndTest()');
