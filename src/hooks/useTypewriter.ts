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
  /**
   * 节流模式：将 React 状态更新频率限制为指定间隔（ms）
   * RAF 仍然每帧运行（保证字符索引持续增长），但只按间隔刷新 displayText
   * 设为 0 或不传则不节流（每帧更新）
   */
  throttleMs?: number;
}

export interface UseTypewriterReturn {
  /** 当前应显示的文本（仅 enabled=true 时有效） */
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
 * 设计要点：
 * - enabled=false 时不修改 charIndexRef/displayText，由调用方通过 visibleText 控制
 * - enabled=true 时启动 RAF，从当前 charIndex 位置继续打字
 * - 首次挂载 enabled=true 时 charIndex 从 0 开始
 */
export function useTypewriter(options: UseTypewriterOptions): UseTypewriterReturn {
  const {
    content,
    enabled = true,
    baseCPS = 80,
    fastCPS = 200,
    threshold = 500,
    onComplete,
    throttleMs = 0,
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
  const throttleMsRef = useRef(throttleMs);
  const lastFlushRef = useRef(0);
  const prevContentLenRef = useRef(content.length);

  // 保持所有 ref 同步（不触发 re-render / effect 重启）
  contentRef.current = content;
  enabledRef.current = enabled;
  onCompleteRef.current = onComplete;
  baseCPSRef.current = baseCPS;
  fastCPSRef.current = fastCPS;
  thresholdRef.current = threshold;
  throttleMsRef.current = throttleMs;

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

  useEffect(() => {
    if (!enabled) {
      // 禁用时停止 RAF，并跳到内容末尾
      charIndexRef.current = contentRef.current.length;
      setDisplayText(contentRef.current);
      setProgress(1);
      setIsTyping(false);
      lastFlushRef.current = 0;
      prevContentLenRef.current = contentRef.current.length;
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      return;
    }

    // 如果已有 RAF 在运行，不要重复启动
    if (rafRef.current !== null) return;

    // 启动 RAF
    setIsTyping(true);
    lastTimeRef.current = performance.now();

    const animate = (now: number) => {
      if (!enabledRef.current) {
        rafRef.current = null;
        return;
      }

      const elapsed = (now - lastTimeRef.current) / 1000;
      lastTimeRef.current = now;

      const totalLen = contentRef.current.length;

      if (totalLen === 0) {
        rafRef.current = requestAnimationFrame(animate);
        return;
      }

      const remaining = totalLen - charIndexRef.current;

      // 已追上内容长度，空转等待新内容
      if (remaining <= 0) {
        rafRef.current = requestAnimationFrame(animate);
        return;
      }

      const th = thresholdRef.current;
      const cps = remaining > th ? fastCPSRef.current : baseCPSRef.current;
      const charsToAdd = Math.ceil(cps * elapsed);

      if (charsToAdd > 0) {
        charIndexRef.current = Math.min(charIndexRef.current + charsToAdd, totalLen);

        // 节流：RAF 持续推进 charIndex，但只按 throttleMs 间隔刷新 React 状态
        const throttle = throttleMsRef.current;
        const shouldFlush = throttle <= 0 || (now - lastFlushRef.current) >= throttle;

        if (shouldFlush) {
          setDisplayText(contentRef.current.slice(0, charIndexRef.current));
          setProgress(charIndexRef.current / totalLen);
          lastFlushRef.current = now;
        }
      }

      rafRef.current = requestAnimationFrame(animate);
    };

    rafRef.current = requestAnimationFrame(animate);

    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [enabled]);

  return { displayText, isTyping, progress, skip };
}
