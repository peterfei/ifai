import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { ToolRow } from '../../components/workflow/ToolRow';
import type { ToolItem } from '../../types/workflow';

describe('ToolRow', () => {
  // UT-T.1.1: done 工具完整格式
  it('UT-T.1.1: done tool shows ✔ + name + time + target', () => {
    const tool: ToolItem = { toolName: 'read_file', status: 'done', elapsedSecs: 0.02, target: 'src/main.rs' };
    const { container } = render(<ToolRow tool={tool} index={0} total={2} />);
    const text = container.textContent ?? '';
    expect(text).toContain('read_file');
    expect(text).toContain('→');
    expect(text).toContain('src/main.rs');
  });

  // UT-T.1.2: running 工具
  it('UT-T.1.2: running tool shows icon + name', () => {
    const tool: ToolItem = { toolName: 'scan_project', status: 'running', elapsedSecs: 0.03, target: 'scanning...' };
    const { container } = render(<ToolRow tool={tool} index={0} total={1} />);
    const text = container.textContent ?? '';
    expect(text).toContain('scan_project');
  });

  // UT-T.1.3: 非末位连接符 ├─
  it('UT-T.1.3: non-last tool uses ├─', () => {
    const tool: ToolItem = { toolName: 'read', status: 'done', elapsedSecs: 0.1 };
    const { container } = render(<ToolRow tool={tool} index={0} total={3} />);
    expect(container.textContent).toContain('├─');
  });

  // UT-T.1.4: 末位连接符 └─
  it('UT-T.1.4: last tool uses └─', () => {
    const tool: ToolItem = { toolName: 'grep', status: 'done', elapsedSecs: 0.15 };
    const { container } = render(<ToolRow tool={tool} index={2} total={3} />);
    expect(container.textContent).toContain('└─');
  });

  // UT-T.1.8: 单工具连接符 ┌─
  it('UT-T.1.8: single tool uses ┌─', () => {
    const tool: ToolItem = { toolName: 'scan', status: 'done', elapsedSecs: 0.5 };
    const { container } = render(<ToolRow tool={tool} index={0} total={1} />);
    expect(container.textContent).toContain('┌─');
  });

  // UT-T.1.5: 无 target 时不显示箭头
  it('UT-T.1.5: no target hides →', () => {
    const tool: ToolItem = { toolName: 'read', status: 'done', elapsedSecs: 0.1 };
    const { container } = render(<ToolRow tool={tool} index={0} total={1} />);
    expect(container.textContent).not.toContain('→');
  });

  // UT-T.1.6: 耗时格式
  it('UT-T.1.6: formats elapsed time', () => {
    const tool: ToolItem = { toolName: 'x', status: 'done', elapsedSecs: 0 };
    const { container } = render(<ToolRow tool={tool} index={0} total={1} />);
    expect(container.textContent).toContain('(<1s)');
  });

  // UT-T.1.7: 颜色
  it('UT-T.1.7: status icon colors', () => {
    const done: ToolItem = { toolName: 'a', status: 'done', elapsedSecs: 0.1 };
    const { container: dc } = render(<ToolRow tool={done} index={0} total={1} />);
    expect(dc.querySelector('.text-emerald-400')).toBeTruthy();

    const run: ToolItem = { toolName: 'b', status: 'running', elapsedSecs: 0.1 };
    const { container: rc } = render(<ToolRow tool={run} index={0} total={1} />);
    expect(rc.querySelector('.text-purple-400')).toBeTruthy();
  });
});
