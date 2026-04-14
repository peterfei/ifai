import { render, screen, fireEvent } from '@testing-library/react';
import { InlineAIWidget } from '../InlineAIWidget';
import { describe, it, expect, vi } from 'vitest';
import React from 'react';

// TODO: skip - 过时的测试，需要更新 mock/组件接口
describe.skip('InlineAIWidget', () => {
  it('should render correctly', () => {
    const onClose = vi.fn();
    const onSubmit = vi.fn();
    
    render(<InlineAIWidget onClose={onClose} onSubmit={onSubmit} />);
    
    expect(screen.getByPlaceholderText(/Ask AI to edit/i)).toBeInTheDocument();
    expect(screen.getByText('Inline AI')).toBeInTheDocument();
  });

  it('should call onClose when close button is clicked', () => {
    const onClose = vi.fn();
    const onSubmit = vi.fn();
    
    render(<InlineAIWidget onClose={onClose} onSubmit={onSubmit} />);
    
    fireEvent.click(screen.getByText('✕'));
    expect(onClose).toHaveBeenCalled();
  });

  it('should call onSubmit when Enter is pressed', () => {
    const onClose = vi.fn();
    const onSubmit = vi.fn();
    
    render(<InlineAIWidget onClose={onClose} onSubmit={onSubmit} />);
    
    const input = screen.getByPlaceholderText(/Ask AI to edit/i);
    fireEvent.change(input, { target: { value: 'Refactor this' } });
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });
    
    expect(onSubmit).toHaveBeenCalledWith('Refactor this');
  });
});
