import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

/**
 * 🔥 ErrorBoundary - 捕获组件树中的错误，防止整个应用崩溃
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null
    };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('[ErrorBoundary] Caught error:', error);
    console.error('[ErrorBoundary] Error info:', errorInfo);

    this.setState({
      error,
      errorInfo
    });
  }

  handleReset = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null
    });
  };

  render(): ReactNode {
    if (this.state.hasError) {
      // 使用自定义 fallback 或默认错误 UI
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="flex items-center justify-center min-h-screen bg-gray-900 text-gray-100 p-8">
          <div className="max-w-md w-full bg-gray-800 rounded-lg border border-gray-700 p-6 shadow-lg">
            <div className="flex items-center gap-3 mb-4">
              <AlertTriangle className="text-red-500" size={24} />
              <h2 className="text-xl font-semibold text-red-400">应用崩溃了</h2>
            </div>

            <p className="text-gray-300 mb-4">
              抱歉，应用遇到了一个错误。请尝试以下操作：
            </p>

            <ul className="list-disc list-inside text-gray-400 mb-6 space-y-1">
              <li>点击下方按钮重置应用</li>
              <li>如果问题持续，请刷新页面</li>
              <li>检查控制台获取详细错误信息</li>
            </ul>

            <button
              onClick={this.handleReset}
              className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white py-2 px-4 rounded transition-colors"
            >
              <RefreshCw size={16} />
              重置应用
            </button>

            {process.env.NODE_ENV === 'development' && this.state.error && (
              <details className="mt-4">
                <summary className="cursor-pointer text-gray-400 hover:text-gray-300">
                  错误详情 (开发模式)
                </summary>
                <div className="mt-2 p-3 bg-gray-900 rounded text-xs text-red-400 overflow-auto max-h-60">
                  <div className="font-bold mb-1">{this.state.error.toString()}</div>
                  <pre className="whitespace-pre-wrap">
                    {this.state.errorInfo?.componentStack}
                  </pre>
                </div>
              </details>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
