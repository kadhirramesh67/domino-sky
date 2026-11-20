import { Component, type ReactNode, type ErrorInfo } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

/**
 * Clean React ErrorBoundary providing an accessible fallback UI
 * to prevent catastrophic application crashes.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  public override state: ErrorBoundaryState = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  public override componentDidCatch(_error: Error, _errorInfo: ErrorInfo): void {
    // Error caught safely within boundary
  }

  private handleReset = (): void => {
    this.setState({ hasError: false, error: null });
  };

  private handleReload = (): void => {
    window.location.reload();
  };

  public override render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <main
          role="alert"
          aria-live="assertive"
          className="min-h-screen bg-gray-950 text-gray-100 font-mono flex items-center justify-center p-6"
        >
          <div className="max-w-md w-full bg-gray-900 border border-rose-800 rounded-lg p-6 shadow-xl space-y-4 text-center">
            <div className="text-3xl text-rose-500" aria-hidden="true">
              ⚠️
            </div>
            <h1 className="text-lg font-bold text-rose-400 tracking-wide uppercase">
              Application Error
            </h1>
            <p className="text-xs text-gray-300 leading-relaxed">
              An unexpected operational fault occurred while rendering Domino Sky.
              The deterministic engine state has been safely suspended.
            </p>
            {this.state.error && (
              <div className="text-[11px] font-mono text-rose-300 bg-rose-950/60 border border-rose-900 rounded p-2.5 text-left overflow-x-auto">
                {this.state.error.message || 'Unknown runtime error'}
              </div>
            )}
            <div className="flex items-center justify-center gap-3 pt-2">
              <button
                type="button"
                onClick={this.handleReset}
                className="text-xs bg-gray-800 hover:bg-gray-700 text-gray-200 px-4 py-2 rounded border border-gray-700 transition-colors cursor-pointer"
              >
                Try Again
              </button>
              <button
                type="button"
                onClick={this.handleReload}
                className="text-xs bg-cyan-700 hover:bg-cyan-600 text-white font-semibold px-4 py-2 rounded transition-colors cursor-pointer"
              >
                Reload App
              </button>
            </div>
          </div>
        </main>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
