import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { StatsLine } from '../../components/workflow/StatsLine';

describe('StatsLine', () => {
  // UT-S.1.1: done 节点统计行
  it('UT-S.1.1: node done stats format', () => {
    const { container } = render(
      <StatsLine label="Done" elapsedSecs={1.0} doneCount={3} totalCount={3} tokenCount={4200} status="done" />,
    );
    const text = container.textContent ?? '';
    expect(text).toMatch(/✔ Done  \d+\.\ds · 3\/3 tools · \d+\.\dk tokens/);
  });

  // UT-S.1.2: 工作流汇总行
  it('UT-S.1.2: workflow summary format', () => {
    const { container } = render(
      <StatsLine label="Workflow complete" elapsedSecs={1.2} doneCount={5} totalCount={5} tokenCount={6000} status="done" />,
    );
    const text = container.textContent ?? '';
    expect(text).toMatch(/✔ Workflow complete  \d+\.\ds · 5\/5 tools · \d+\.\dk tokens/);
  });

  // UT-S.1.3: token=0 不显示 tokens
  it('UT-S.1.3: hides tokens when zero', () => {
    const { container } = render(
      <StatsLine label="Done" elapsedSecs={0.5} doneCount={1} totalCount={2} tokenCount={0} status="done" />,
    );
    expect(container.textContent).not.toContain('tokens');
  });

  // UT-S.1.4: 单数 tool
  it('UT-S.1.4: singular tool', () => {
    const { container } = render(
      <StatsLine label="Done" elapsedSecs={0.1} doneCount={1} totalCount={1} tokenCount={100} status="done" />,
    );
    expect(container.textContent).toContain('1 tool');
  });

  // UT-S.1.5: 复数 tools
  it('UT-S.1.5: plural tools', () => {
    const { container } = render(
      <StatsLine label="Done" elapsedSecs={0.5} doneCount={3} totalCount={5} tokenCount={200} status="done" />,
    );
    expect(container.textContent).toContain('3/5 tools');
  });

  // UT-S.1.6: running 显示 ▸
  it('UT-S.1.6: running status shows ▸', () => {
    const { container } = render(
      <StatsLine label="Running" elapsedSecs={0.3} doneCount={1} totalCount={3} tokenCount={0} status="running" />,
    );
    expect(container.textContent).toContain('▸');
    expect(container.textContent).not.toContain('✔');
  });

  // UT-S.1.7: 耗时格式
  it('UT-S.1.7: formats elapsedSecs correctly', () => {
    const { container } = render(
      <StatsLine label="Done" elapsedSecs={0.5} doneCount={1} totalCount={1} tokenCount={0} status="done" />,
    );
    expect(container.textContent).toContain('0.5s');
  });
});
