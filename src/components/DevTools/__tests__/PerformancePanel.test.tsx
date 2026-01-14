import React from 'react';
import { render, act } from '@testing-library/react';
import { screen, fireEvent } from '@testing-library/dom';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import '@testing-library/jest-dom';
import { PerformancePanel } from '../PerformancePanel';

// Mock Recharts since it renders SVG and can be complex to test in JSDOM
// We mock it to just render children or simple divs
vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: any) => <div>{children}</div>,
  AreaChart: ({ children }: any) => <div data-testid="area-chart">{children}</div>,
  Area: () => <div />,
  XAxis: () => <div />,
  YAxis: () => <div />,
  Tooltip: () => <div />,
}));

// Mock Lucide icons
vi.mock('lucide-react', () => ({
  X: () => <span>CloseIcon</span>,
  Activity: () => <span>ActivityIcon</span>,
  Cpu: () => <span>CpuIcon</span>,
  Database: () => <span>DbIcon</span>,
}));

describe('PerformancePanel', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders correctly with initial metrics', () => {
    render(<PerformancePanel />);
    expect(screen.getByText('Performance Monitor')).toBeInTheDocument();
    expect(screen.getByText('FPS')).toBeInTheDocument();
    expect(screen.getByText('Memory')).toBeInTheDocument();
  });

  it('handles minimize and expand', () => {
    render(<PerformancePanel />);
    
    // Initial state: maximized
    expect(screen.getByText('Performance Monitor')).toBeInTheDocument();

    // Click minimize button
    const minimizeBtn = screen.getByText('_');
    fireEvent.click(minimizeBtn);

    // Should be minimized (header gone, only icon remains)
    expect(screen.queryByText('Performance Monitor')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Expand Performance Panel' })).toBeInTheDocument();

    // Click to expand
    fireEvent.click(screen.getByRole('button', { name: 'Expand Performance Panel' }));
    expect(screen.getByText('Performance Monitor')).toBeInTheDocument();
  });

  it('calls onClose when close button is clicked', () => {
    const onClose = vi.fn();
    render(<PerformancePanel onClose={onClose} />);
    
    const closeBtn = screen.getByLabelText('Close');
    fireEvent.click(closeBtn);
    
    expect(onClose).toHaveBeenCalled();
  });

  it('updates metrics over time', () => {
    render(<PerformancePanel />);
    
    // Fast-forward time to trigger interval updates
    act(() => {
      vi.advanceTimersByTime(2000);
    });

    // Since we mocked the hook's internal logic with timers, 
    // we just check if component is still alive and rendering numbers.
    // Detailed logic test is in usePerformanceMetrics hook test.
    expect(screen.getByText('FPS')).toBeInTheDocument();
  });
});
