/**
 * v0.2.8 ComposerDiffView 单元测试
 * 验证多文件 Diff 预览组件的渲染逻辑与交互状态
 */

import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';

// 由于组件尚未实现，我们先定义一个 Mock 结构用于 TDD
// 在实际开发时，这里会导入 src/components/Composer/ComposerDiffView
const MockComposerDiffView = ({ 
    changes, 
    onAcceptAll, 
    onRejectAll, 
    onAcceptFile 
}: any) => {
    const [selectedPath, setSelectedPath] = React.useState(changes[0]?.path);

    return (
        <div className="composer-diff-container">
            <div className="composer-diff-header">
                <button onClick={onAcceptAll}>Accept All</button>
                <button onClick={onRejectAll}>Reject All</button>
            </div>
            <div className="composer-diff-tabs">
                {changes.map((change: any) => (
                    <div 
                        key={change.path} 
                        className={`composer-diff-tab ${selectedPath === change.path ? 'active' : ''}`}
                        onClick={() => setSelectedPath(change.path)}
                        data-testid={`tab-${change.path}`}
                    >
                        {change.path}
                        <button 
                            className="accept-single-file-btn"
                            onClick={(e) => {
                                e.stopPropagation();
                                onAcceptFile(change.path);
                            }}
                        >
                            ✓
                        </button>
                    </div>
                ))}
            </div>
            <div className="monaco-diff-placeholder">
                Showing diff for: {selectedPath}
            </div>
        </div>
    );
};

describe('ComposerDiffView Component (TDD)', () => {
    const mockChanges = [
        { path: 'src/auth.rs', content: 'new auth content' },
        { path: 'src/main.rs', content: 'new main content' }
    ];

    test('should render all file tabs from changes', () => {
        render(<MockComposerDiffView changes={mockChanges} />);
        
        expect(screen.getByText('src/auth.rs')).toBeDefined();
        expect(screen.getByText('src/main.rs')).toBeDefined();
    });

    test('should switch selected file when tab is clicked', () => {
        render(<MockComposerDiffView changes={mockChanges} />);
        
        const secondTab = screen.getByTestId('tab-src/main.rs');
        fireEvent.click(secondTab);
        
        expect(screen.getByText('Showing diff for: src/main.rs')).toBeDefined();
        expect(secondTab.className).toContain('active');
    });

    test('should trigger onAcceptAll callback when Accept All is clicked', () => {
        const onAcceptAll = vi.fn();
        render(<MockComposerDiffView changes={mockChanges} onAcceptAll={onAcceptAll} />);
        
        fireEvent.click(screen.getByText('Accept All'));
        expect(onAcceptAll).toHaveBeenCalled();
    });

    test('should trigger onAcceptFile with correct path when single checkmark is clicked', () => {
        const onAcceptFile = vi.fn();
        render(<MockComposerDiffView changes={mockChanges} onAcceptFile={onAcceptFile} />);
        
        // 点击第一个文件的 Accept 按钮
        const acceptBtns = screen.getAllByText('✓');
        fireEvent.click(acceptBtns[0]);
        
        expect(onAcceptFile).toHaveBeenCalledWith('src/auth.rs');
    });

    test('should display "Reject All" button for global rollback', () => {
        const onRejectAll = vi.fn();
        render(<MockComposerDiffView changes={mockChanges} onRejectAll={onRejectAll} />);
        
        fireEvent.click(screen.getByText('Reject All'));
        expect(onRejectAll).toHaveBeenCalled();
    });
});
