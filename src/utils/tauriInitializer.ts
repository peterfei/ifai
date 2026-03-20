/**
 * Tauri Bridge 初始化工具
 *
 * 确保在动态导入 @tauri-apps/api 之前，Tauri bridge 已正确初始化
 *
 * 问题背景：
 * - useChatStore.ts 重构后使用动态导入：await import('@tauri-apps/api/core')
 * - 动态导入在运行时加载，此时 window.__TAURI_INTERNALS__ 可能未初始化
 * - 导致 TypeError: Cannot read properties of undefined (reading 'transformCallback')
 *
 * 解决方案：
 * - 在动态导入前等待 Tauri bridge 初始化完成
 * - 支持超时和降级处理
 */

let tauriInitPromise: Promise<void> | null = null;
let initializationComplete = false;

/**
 * 确保 Tauri bridge 已初始化
 *
 * @param options 配置选项
 * @returns Promise，初始化完成时 resolve
 */
export async function ensureTauriInitialized(options?: {
  maxWait?: number;
  throwOnError?: boolean;
}): Promise<void> {
  // 如果已经初始化完成，直接返回
  if (initializationComplete) {
    return;
  }

  // 如果已有初始化 Promise，等待它完成
  if (tauriInitPromise) {
    return tauriInitPromise;
  }

  const maxWait = options?.maxWait ?? 5000;
  const throwOnError = options?.throwOnError ?? false;

  tauriInitPromise = (async () => {
    // 服务端渲染检查
    if (typeof window === 'undefined') {
      console.log('[TauriInit] ⚠️ Server-side environment, skipping Tauri initialization');
      initializationComplete = true;
      return;
    }

    const startTime = Date.now();
    const checkInterval = 50; // 每 50ms 检查一次

    console.log('[TauriInit] 🔍 Waiting for Tauri bridge initialization...');

    // 🔥 FIX: 检查是否是真实 Tauri 模式（通过检查 __TAURI__ 对象是否存在）
    // 真实 Tauri 环境会先有 __TAURI__ 对象，然后 __TAURI_INTERNALS__ 才会初始化
    const isRealTauriEnvironment = !!(window as any).__TAURI__;

    // 🔥 FIX: 如果是真实 Tauri 环境，使用更长的超时时间（30秒）
    const actualMaxWait = isRealTauriEnvironment ? 30000 : maxWait;
    console.log(`[TauriInit] 🌍 Environment: ${isRealTauriEnvironment ? 'Real Tauri' : 'Browser/Mock'}, maxWait: ${actualMaxWait}ms`);

    while (Date.now() - startTime < actualMaxWait) {
      const w = window as any;

      // 检查 Tauri bridge 是否已初始化
      const hasInvoke = !!(
        w.__TAURI_INTERNALS__?.invoke ||
        w.__TAURI__?.core?.invoke ||
        w.__TAURI_INTERNALS__?.transformCallback
      );

      if (hasInvoke) {
        initializationComplete = true;
        const elapsed = Date.now() - startTime;
        console.log(`[TauriInit] ✅ Tauri bridge initialized in ${elapsed}ms`);

        // 输出调试信息
        if (process.env.NODE_ENV === 'development') {
          console.log('[TauriInit] 🔧 Debug info:', {
            hasTAURIInternals: !!w.__TAURI_INTERNALS__,
            hasTAURICore: !!w.__TAURI__?.core,
            hasInvoke: !!w.__TAURI_INTERNALS__?.invoke || !!w.__TAURI__?.core?.invoke,
            hasTransformCallback: !!w.__TAURI_INTERNALS__?.transformCallback,
            isRealTauriEnvironment,
          });
        }

        return;
      }

      // 等待一段时间后再次检查
      await new Promise(resolve => setTimeout(resolve, checkInterval));
    }

    // 超时处理
    const elapsed = Date.now() - startTime;
    console.warn(`[TauriInit] ⚠️ Timeout after ${elapsed}ms waiting for Tauri bridge (maxWait: ${actualMaxWait}ms)`);

    // E2E 测试环境：尝试注入 Mock
    const isE2E = (window as any).__E2E__ || (window as any).__E2E_SKIP_STABILIZER__;
    // 🔥 FIX: 检查是否是真实 Tauri 模式（E2E 使用真实后端）
    const isE2ERealTauriMode = (window as any).__E2E_REAL_TAURI_MODE__ === true;

    if (isE2E && !isE2ERealTauriMode) {
      // 只在 E2E mock 模式下注入 mock
      console.log('[TauriInit] 🔧 E2E mock environment detected, injecting Tauri mock...');
      injectTauriMock();
      initializationComplete = true;
      return;
    } else if (isE2E && isE2ERealTauriMode) {
      // E2E 真实 Tauri 模式：真实 Tauri 可能还在初始化中
      console.log('[TauriInit] 🔥 E2E real Tauri mode, mock injection skipped');
    } else if (isRealTauriEnvironment) {
      // 真实 Tauri 环境（非 E2E）：记录警告但不抛出错误
      console.warn('[TauriInit] ⚠️ Real Tauri environment detected but bridge not available after timeout');
      console.warn('[TauriInit] 💡 This might be normal during cold start, continuing anyway...');
    }

    // 生产环境：根据配置决定是否抛出错误
    if (throwOnError) {
      throw new Error(
        `Tauri bridge initialization timeout after ${maxWait}ms. ` +
        `Please ensure Tauri is properly initialized.`
      );
    } else {
      console.error('[TauriInit] ❌ Tauri bridge not available, some features may not work');
      initializationComplete = true; // 标记为完成，避免重复尝试
    }
  })();

  try {
    await tauriInitPromise;
  } catch (error) {
    tauriInitPromise = null; // 失败后重置，允许重试
    throw error;
  }

  return tauriInitPromise;
}

/**
 * 注入 Tauri Mock（用于 E2E 测试环境）
 * 🔥 FIX: 不覆盖真实 Tauri，只在需要时提供基础结构
 */
function injectTauriMock() {
  const w = window as any;

  // 🔥 FIX: 检查是否是真实 Tauri 模式
  const isRealTauriMode = w.__E2E_REAL_TAURI_MODE__ === true;

  // 🔥 FIX: 检查是否已有真实 Tauri 实现
  const hasRealTauri = !!(
    w.__TAURI_INTERNALS__?.plugins ||
    (w.__TAURI_INTERNALS__?.invoke && w.__TAURI_INTERNALS__.transformCallback)
  );

  if (isRealTauriMode || hasRealTauri) {
    console.log('[TauriInit] ✅ Real Tauri detected or real Tauri mode, skipping mock injection');
    return;
  }

  // 确保 __TAURI_INTERNALS__ 存在
  if (!w.__TAURI_INTERNALS__) {
    w.__TAURI_INTERNALS__ = {};

    // Mock transformCallback
    w.__TAURI_INTERNALS__.transformCallback = (callback: any, once: any) => {
      console.log('[Tauri Mock] transformCallback called');
      return callback;
    };

    // Mock invoke
    w.__TAURI_INTERNALS__.invoke = (cmd: string, args: any) => {
      console.log(`[Tauri Mock] invoke: ${cmd}`, args);
      return Promise.reject(new Error(
        `Tauri invoke not available in E2E mock environment: ${cmd}. ` +
        `Please ensure your test properly mocks Tauri API calls.`
      ));
    };
  }

  // 确保 __TAURI__.core 存在
  if (!w.__TAURI__?.core) {
    w.__TAURI__ = w.__TAURI__ || {};
    w.__TAURI__.core = {
      invoke: w.__TAURI_INTERNALS__.invoke
    };
  }

  console.log('[TauriInit] ✅ Tauri mock injected');
}

/**
 * 获取 Tauri 初始化状态
 */
export function getTauriInitStatus(): {
  initialized: boolean;
  initializing: boolean;
  hasBridge: boolean;
} {
  if (typeof window === 'undefined') {
    return { initialized: false, initializing: false, hasBridge: false };
  }

  const w = window as any;
  const hasBridge = !!(
    w.__TAURI_INTERNALS__?.invoke ||
    w.__TAURI__?.core?.invoke ||
    w.__TAURI_INTERNALS__?.transformCallback
  );

  return {
    initialized: initializationComplete,
    initializing: !!tauriInitPromise,
    hasBridge,
  };
}

/**
 * 重置初始化状态（主要用于测试）
 */
export function resetTauriInitialization() {
  tauriInitPromise = null;
  initializationComplete = false;
}

/**
 * 等待多个 Tauri 依赖准备就绪
 * 用于需要确保多个 Tauri API 可用的场景
 */
export async function ensureTauriAPIs(apis: string[] = ['invoke', 'listen', 'emit']) {
  await ensureTauriInitialized();

  if (typeof window === 'undefined') {
    return;
  }

  const w = window as any;
  const available: string[] = [];
  const missing: string[] = [];

  for (const api of apis) {
    // 简单检查：假设所有 API 都通过 __TAURI_INTERNALS__ 或 __TAURI__ 暴露
    if (w.__TAURI_INTERNALS__?.[api] || w.__TAURI__?.[api]) {
      available.push(api);
    } else {
      missing.push(api);
    }
  }

  if (missing.length > 0) {
    console.warn('[TauriInit] ⚠️ Some Tauri APIs may not be available:', missing);
  }

  return { available, missing };
}
