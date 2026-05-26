import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { StatusIcon, STATUS_ICONS } from '../StatusIcon';

describe('StatusIcon', () => {
  // UT-E.1.1: running 渲染 Loader2 + animate-spin + text-purple-400
  it('UT-E.1.1: renders running icon', () => {
    const { container } = render(<StatusIcon status="running" />);
    const svg = container.querySelector('svg');
    expect(svg).toBeTruthy();
    expect(svg!.className).toContain('animate-spin');
    expect(svg!.className).toContain('text-purple-400');
  });

  // UT-E.1.2: done 渲染 CheckCircle2 + text-emerald-400
  it('UT-E.1.2: renders done icon', () => {
    const { container } = render(<StatusIcon status="done" />);
    const svg = container.querySelector('svg');
    expect(svg).toBeTruthy();
    expect(svg!.className).toContain('text-emerald-400');
    expect(svg!.className).not.toContain('animate-spin');
  });

  // UT-E.1.3: pending 渲染 Circle + text-white/20
  it('UT-E.1.3: renders pending icon', () => {
    const { container } = render(<StatusIcon status="pending" />);
    const svg = container.querySelector('svg');
    expect(svg).toBeTruthy();
    expect(svg!.className).toContain('text-white/20');
  });

  // UT-E.1.4: 未知 status 降级为 pending
  it('UT-E.1.4: falls back to pending for unknown status', () => {
    const { container } = render(<StatusIcon status={'unknown' as any} />);
    const svg = container.querySelector('svg');
    expect(svg).toBeTruthy();
    expect(svg!.className).toContain('text-white/20');
  });

  // UT-C.1.2: STATUS_ICONS 映射表包含所有必要条目
  it('UT-C.1.2: STATUS_ICONS table has all entries', () => {
    expect(STATUS_ICONS).toHaveProperty('running');
    expect(STATUS_ICONS).toHaveProperty('done');
    expect(STATUS_ICONS).toHaveProperty('pending');
  });
});
