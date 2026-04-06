import { useState, useRef, useCallback, useEffect } from 'react';

export interface UseTypewriterOptions {
  /** 完整内容 */
  content: string;
  /** 是否启用（默认 true） */
  enabled?: boolean;
  /** 基础每秒字符数（默认 80） */
  baseCPS?: number;
  /** 加速 CPS（默认 200，内容 > threshold 时） */
  fastCPS?: number;
  /** 加速阈值字符数（默认 500） */
  threshold?: number;
  /** 完成回调 */
  onComplete?: () => void;
}

export interface UseTypewriterReturn {
  /** 当前应显示的文本 */
  displayText: string;
  /** 是否正在打字 */
  isTyping: boolean;
  /** 0-1 进度 */
  progress: number;
  /** 跳过动画，立即显示全部 */
  skip: () => void;
}

/**
 * 打字机效果 hook
 *
 * 基于 requestAnimationFrame 调度，支持：
 * - 智能加速：长内容自动提速
 * - 跳过机制：点击/按键立即显示完整内容
 * - 流式追加：新内容到达时从当前位置继续打字（不重启 RAF）
 *
 * 关键：useEffect 不依赖 content，避免流式场景下 RAF 被不断 cancel+restart。
 * 所有对 content 的读取通过 contentRef。
 */
export function useTypewriter(options: UseTypewriterOptions): UseTypewriterReturn {
  const {
    content,
    enabled = true,
    baseCPS = 80,
    fastCPS = 200,
    threshold = 500,
    onComplete,
  } = options;

  const charIndexRef = useRef(0);
  const [displayText, setDisplayText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [progress, setProgress] = useState(0);

  const rafRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number>(0);
  const contentRef = useRef(content);
  const enabledRef = useRef(enabled);
  const onCompleteRef = useRef(onComplete);
  const baseCPSRef = useRef(baseCPS);
  const fastCPSRef = useRef(fastCPS);
  const thresholdRef = useRef(threshold);

  // 保持所有 ref 同步（不触发 re-render / effect 重启）
  contentRef.current = content;
  enabledRef.current = enabled;
  onCompleteRef.current = onComplete;
  baseCPSRef.current = baseCPS;
  fastCPSRef.current = fastCPS;
  thresholdRef.current = threshold;

  // 跳过动画
  const skip = useCallback(() => {
    charIndexRef.current = contentRef.current.length;
    setDisplayText(contentRef.current);
    setIsTyping(false);
    setProgress(1);
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    onCompleteRef.current?.();
  }, []);

  // RAF 动画循环 —— 只在 enabled 首次变为 true 时启动，content 变化不重启
  const prevEnabledRef = useRef(enabled);

  useEffect(() => {
    prevEnabledRef.current = enabled;

    if (!enabled) {
      // 禁用时直接显示全部内容，停止 RAF
      if (contentRef.current.length > 0) {
        charIndexRef.current = contentRef.current.length;
        setDisplayText(contentRef.current);
      }
      setIsTyping(false);
      setProgress(contentRef.current.length > 0 ? 1 : 0);
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      onCompleteRef.current?.();
      return;
    }

    // 如果已有 RAF 在运行，不要重复启动
    if (rafRef.current !== null) return;

    // 启动 RAF（content 可能为空，RAF 会空转等待）
    setIsTyping(true);
    lastTimeRef.current = performance.now();

    const animate = (now: number) => {
      // 检查是否被禁用
      if (!enabledRef.current) {
        rafRef.current = null;
        return;
      }

      const elapsed = (now - lastTimeRef.current) / 1000;
      lastTimeRef.current = now;

      const totalLen = contentRef.current.length;
      const remaining = totalLen - charIndexRef.current;

      // 内容可能还没到或者已经清空
      if (totalLen === 0) {
        rafRef.current = requestAnimationFrame(animate);
        return;
      }

      // 根据剩余内容决定速度
      const th = thresholdRef.current;
      const cps = remaining > th ? fastCPSRef.current : baseCPSRef.current;
      const charsToAdd = Math.ceil(cps * elapsed);

      if (charsToAdd > 0) {
        charIndexRef.current = Math.min(charIndexRef.current + charsToAdd, totalLen);
        setDisplayText(contentRef.current.slice(0, charIndexRef.current));
        setProgress(totalLen > 0 ? charIndexRef.current / totalLen : 1);
      }

      // 追上当前内容长度时，不停止 RAF，继续空转等待新内容到达
      // 只有 enabled=false（流式结束）时 useEffect 才会 cleanup 停止 RAF
      rafRef.current = requestAnimationFrame(animate);
    };

    rafRef.current = requestAnimationFrame(animate);

    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [enabled]); // 仅依赖 enabled，不依赖 content

  return { displayText, isTyping, progress, skip };
}
