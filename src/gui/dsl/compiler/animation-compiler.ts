/**
 * AnimationSpec 编译器 — 声明 → CSS @keyframes + 工具类
 *
 * 纯函数：输入 AnimationSpec[]，输出 CSS 字符串
 */

import type { AnimationSpec } from '../animation-spec';

/**
 * 将 offset (0-1) 转为百分比字符串
 */
function toPercent(offset: number): string {
  return `${Math.round(offset * 100)}%`;
}

/**
 * 编译单个 AnimationSpec 为 CSS 片段
 */
function compileOne(spec: AnimationSpec): string {
  // 参数校验
  if (spec.duration <= 0) {
    throw new Error(`Animation "${spec.name}": duration must be positive, got ${spec.duration}`);
  }

  if (spec.keyframes.length === 0) {
    throw new Error(`Animation "${spec.name}": keyframes must not be empty`);
  }

  const lines: string[] = [];

  // @keyframes
  lines.push(`@keyframes ${spec.name} {`);
  for (const step of spec.keyframes) {
    const props = Object.entries(step.properties)
      .map(([prop, val]) => `${prop}: ${val}`)
      .join('; ');
    lines.push(`  ${toPercent(step.offset)} { ${props}; }`);
  }
  lines.push('}');

  // 工具类
  const duration = `${spec.duration}ms`;
  const easing = spec.easing ?? 'ease';
  const delay = spec.delay ? `${spec.delay}ms` : '';
  const iterationCount = spec.iterationCount === 'infinite' ? 'infinite' :
    (spec.iterationCount !== undefined ? String(spec.iterationCount) : '');
  const direction = spec.direction ?? '';
  const fillMode = spec.fillMode ?? '';

  const animationParts = [
    spec.name,
    duration,
    easing,
    delay,
    iterationCount,
    direction,
    fillMode,
  ].filter(Boolean);

  lines.push(`.animate-${spec.name} {`);
  lines.push(`  animation: ${animationParts.join(' ')};`);
  lines.push('}');

  return lines.join('\n');
}

/**
 * 编译 AnimationSpec 数组为 CSS 字符串
 */
export function compileAnimations(specs: AnimationSpec[]): string {
  if (specs.length === 0) return '';
  return specs.map(compileOne).join('\n\n');
}
