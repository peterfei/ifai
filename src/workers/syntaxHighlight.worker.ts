/**
 * 语法高亮 Web Worker - v0.2.6 性能优化
 * 将语法高亮计算移到 Worker 线程，避免阻塞主线程
 * 注意：这是简化版本，实际高亮由 Monaco Editor 处理
 */

// Worker 消息类型
interface HighlightRequest {
  code: string;
  language: string;
}

interface HighlightResponse {
  html: string;
}

/**
 * Worker 消息处理器
 * 简化实现：仅做基本的 HTML 转义
 * 实际语法高亮由 Monaco Editor 在主线程处理
 */
self.onmessage = (event: MessageEvent<HighlightRequest>) => {
  const { code, language } = event.data;

  try {
    // 简化版本：仅转义 HTML 特殊字符
    // 实际语法高亮由 Monaco Editor 的内置处理完成
    const html = escapeHtml(code);

    const response: HighlightResponse = { html };
    self.postMessage({ success: true, data: response });
  } catch (error) {
    self.postMessage({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
};

/**
 * 转义 HTML 特殊字符
 */
function escapeHtml(text: string): string {
  const htmlEscapes: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  };
  return text.replace(/[&<>"']/g, (char) => htmlEscapes[char]);
}

/**
 * 导出 Worker 类型（用于 TypeScript）
 */
export type {};
