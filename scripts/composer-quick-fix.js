/**
 * Composer 2.0 快速修复方案
 *
 * 在浏览器控制台中运行此脚本，立即修复按钮点击问题
 */

console.log('🔧 Composer 按钮修复工具\n');

// 方案1: 手动给按钮添加事件
function fixButtons() {
    const buttons = Array.from(document.querySelectorAll('button')).filter(btn => {
        const text = btn.textContent;
        return text.includes('查看 Diff') && text.includes('个文件');
    });

    console.log(`🔍 找到 ${buttons.length} 个 Composer 按钮`);

    buttons.forEach((btn, idx) => {
        // 移除旧的事件监听器
        const newBtn = btn.cloneNode(true);
        btn.parentNode.replaceChild(newBtn, btn);

        // 添加点击事件
        newBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            console.log('✅ Composer 按钮被点击！');

            // 创建 Composer 面板
            createComposerPanel();
        });

        // 添加视觉反馈
        newBtn.style.cursor = 'pointer';
        newBtn.title = '点击打开 Composer 面板';

        console.log(`   ✅ 按钮 ${idx + 1} 已修复`);
    });

    return buttons.length > 0;
}

// 创建 Composer 面板
function createComposerPanel() {
    // 移除已存在的面板
    const existing = document.querySelector('.composer-diff-container');
    if (existing) {
        existing.parentElement.parentElement.remove();
    }

    // 创建遮罩和面板
    const overlay = document.createElement('div');
    overlay.className = 'fixed inset-0 z-[9999] flex items-center justify-center';
    overlay.style.backgroundColor = 'rgba(0, 0, 0, 0.6)';
    overlay.style.backdropFilter = 'blur(2px)';

    overlay.innerHTML = `
        <div style="width: 95vw; height: 90vh; background: #252526; border-radius: 8px; border: 1px solid #3c3c3c; display: flex; flex-direction: column; overflow: hidden; box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);">
            <!-- 头部 -->
            <div style="display: flex; justify-content: space-between; align-items: center; padding: 16px; border-bottom: 1px solid #3c3c3c; background: #252526;">
                <div style="display: flex; align-items: center; gap: 12px;">
                    <h3 style="margin: 0; font-size: 16px; font-weight: 600; color: #fff;">🎨 Composer 2.0</h3>
                    <span style="padding: 4px 12px; background: #007acc; color: white; border-radius: 12px; font-size: 12px;">测试模式</span>
                    <span style="padding: 4px 12px; background: #4caf50; color: white; border-radius: 12px; font-size: 12px;">3 个文件</span>
                </div>
                <div style="display: flex; gap: 8px;">
                    <button class="accept-all-btn" style="padding: 8px 16px; background: #4caf50; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 13px;">✓ 全部接受</button>
                    <button class="reject-all-btn" style="padding: 8px 16px; background: #f44336; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 13px;">✗ 全部拒绝</button>
                    <button class="close-btn" style="padding: 8px 12px; background: transparent; color: #888; border: none; border-radius: 4px; cursor: pointer; font-size: 16px;" title="关闭">✕</button>
                </div>
            </div>

            <!-- 主内容 -->
            <div style="display: flex; flex: 1; overflow: hidden;">
                <!-- 文件列表 -->
                <div style="width: 300px; border-right: 1px solid #3c3c3c; overflow-y: auto; background: #252526;">
                    ${createFileItem('logger.ts', 'src/utils', '📝', '修改')}
                    ${createFileItem('app.ts', 'src/config', '➕', '新建')}
                    ${createFileItem('config.ts', 'src', '➕', '新建')}
                </div>

                <!-- Diff 视图 -->
                <div style="flex: 1; display: flex; overflow: hidden;">
                    <div style="flex: 1; padding: 16px; overflow: auto; background: #1e1e1e;">
                        <div style="font-size: 11px; color: #888; margin-bottom: 8px;">原始内容</div>
                        <pre style="margin: 0; font-family: 'Monaco', 'Menlo', monospace; font-size: 12px; color: #d4d4d4; background: #2d2d2d; padding: 12px; border-radius: 4px;">// 原始 Logger 类
export class Logger {
    info(msg) { console.log(msg); }
}</pre>
                    </div>
                    <div style="flex: 1; padding: 16px; overflow: auto; background: #1e1e1e; border-left: 1px solid #3c3c3c;">
                        <div style="font-size: 11px; color: #888; margin-bottom: 8px;">新内容</div>
                        <pre style="margin: 0; font-family: 'Monaco', 'Menlo', monospace; font-size: 12px; color: #4ec9b0; background: #2d2d2d; padding: 12px; border-radius: 4px;">// Logger v2.0 - Enhanced
export class Logger {
    private level: string;

    constructor(level = 'info') {
        this.level = level;
    }

    info(message, data?) {
        if (this.level === 'info') {
            console.log(\`[INFO] \${message}\`, data);
        }
    }

    error(message) {
        console.error(\`[ERROR] \${message}\`);
    }

    debug(message) {
        if (this.level === 'debug') {
            console.log(\`[DEBUG] \${message}\`);
        }
    }
}</pre>
                    </div>
                </div>
            </div>

            <!-- 底部 -->
            <div style="padding: 12px 16px; border-top: 1px solid #3c3c3c; background: #1e1e1e; display: flex; justify-content: space-between; align-items: center;">
                <span style="font-size: 12px; color: #888;">已应用: 0/3</span>
                <span style="font-size: 11px; color: #666;">按 ESC 或点击 ✕ 关闭</span>
            </div>
        </div>
    `;

    // 添加事件监听
    setTimeout(() => {
        overlay.querySelector('.close-btn')?.addEventListener('click', () => {
            overlay.remove();
            console.log('✅ Composer 面板已关闭');
        });

        overlay.querySelector('.accept-all-btn')?.addEventListener('click', () => {
            console.log('✅ 已接受所有文件变更');
            overlay.remove();
            alert('✅ 已接受所有文件变更');
        });

        overlay.querySelector('.reject-all-btn')?.addEventListener('click', () => {
            console.log('✅ 已拒绝所有文件变更');
            overlay.remove();
            alert('ℹ️  已拒绝所有文件变更');
        });

        // ESC 键关闭
        const escHandler = (e) => {
            if (e.key === 'Escape') {
                overlay.remove();
                document.removeEventListener('keydown', escHandler);
            }
        };
        document.addEventListener('keydown', escHandler);

        // 点击遮罩关闭
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                overlay.remove();
                document.removeEventListener('keydown', escHandler);
            }
        });
    }, 0);

    document.body.appendChild(overlay);
    console.log('✅ Composer 面板已打开');

    return overlay;
}

function createFileItem(name, path, icon, type) {
    return `
        <div style="padding: 12px; border-bottom: 1px solid #3c3c3c; cursor: pointer; display: flex; justify-content: space-between; align-items: center; transition: background 0.15s;" onmouseover="this.style.background='#2d2d30'" onmouseout="this.style.background='transparent'">
            <div style="display: flex; align-items: center; gap: 10px;">
                <span style="font-size: 14px;">${icon}</span>
                <div>
                    <div style="font-size: 13px; color: #fff; font-weight: 500;">${name}</div>
                    <div style="font-size: 11px; color: #888; margin-top: 2px;">${path}</div>
                </div>
            </div>
            <div style="display: flex; gap: 4px;">
                <button style="width: 24px; height: 24px; padding: 0; border: 1px solid #444; background: transparent; color: #4caf50; border-radius: 4px; cursor: pointer;" title="接受">✓</button>
                <button style="width: 24px; height: 24px; padding: 0; border: 1px solid #444; background: transparent; color: #f44336; border-radius: 4px; cursor: pointer;" title="拒绝">✗</button>
            </div>
        </div>
    `;
}

// ============================================================================
// 执行修复
// ============================================================================

console.log('开始修复...\n');

const fixed = fixButtons();

if (fixed) {
    console.log('\n✅ 修复完成！');
    console.log('👆 现在点击"查看 Diff"按钮应该可以打开 Composer 面板了');
} else {
    console.log('\n⚠️  未找到 Composer 按钮');
    console.log('💡 请先运行 testComposer.inject() 注入测试数据');
}

console.log('\n或者直接打开面板：');
console.log('   composerTest.open()');

// 导出便捷方法
window.composerTest = {
    fix: fixButtons,
    open: createComposerPanel,
    close: () => {
        const panel = document.querySelector('.fixed.z-\\[9999\\]');
        if (panel) panel.remove();
    }
};

console.log('\n✅ 修复工具已加载');
console.log('📖 可用命令:');
console.log('   - composerTest.fix()   - 修复按钮');
console.log('   - composerTest.open()  - 直接打开面板');
console.log('   - composerTest.close() - 关闭面板');
