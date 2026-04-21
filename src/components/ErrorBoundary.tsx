import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import i18n from '../i18n/config';

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
        <div className="theme-panel theme-text flex min-h-screen items-center justify-center p-8">
          <div className="theme-panel-elevated theme-border theme-shadow w-full max-w-md rounded-lg border p-6">
            <div className="flex items-center gap-3 mb-4">
              <AlertTriangle className="text-[var(--danger-color)]" size={24} />
              <h2 className="text-xl font-semibold text-[var(--danger-color)]">{i18n.t('errorBoundary.title')}</h2>
            </div>

            <p className="theme-text-muted mb-4">
              {i18n.t('errorBoundary.description')}
            </p>

            <ul className="theme-text-subtle mb-6 list-inside list-disc space-y-1">
              <li>{i18n.t('errorBoundary.steps.reset')}</li>
              <li>{i18n.t('errorBoundary.steps.refresh')}</li>
              <li>{i18n.t('errorBoundary.steps.console')}</li>
            </ul>

            <button
              onClick={this.handleReset}
              className="theme-button-primary flex w-full items-center justify-center gap-2 rounded px-4 py-2"
            >
              <RefreshCw size={16} />
              {i18n.t('errorBoundary.reset')}
            </button>

            {process.env.NODE_ENV === 'development' && this.state.error && (
              <details className="mt-4">
                <summary className="theme-text-subtle cursor-pointer transition-colors hover:text-[var(--text-primary)]">
                  {i18n.t('errorBoundary.details')}
                </summary>
                <div className="theme-code-surface theme-border mt-2 max-h-60 overflow-auto rounded border p-3 text-xs text-[var(--danger-color)]">
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
