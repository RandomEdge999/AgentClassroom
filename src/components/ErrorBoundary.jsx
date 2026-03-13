import React from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
    this.setState({ errorInfo });
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-[var(--app-bg)] p-4">
          <div className="w-full max-w-md rounded-[32px] border border-red-200 bg-white p-8 shadow-xl">
            <div className="flex items-center gap-3 text-red-600">
              <AlertCircle className="h-8 w-8" />
              <h1 className="text-xl font-semibold">Something went wrong</h1>
            </div>
            <p className="mt-4 text-sm leading-6 text-[var(--app-muted)]">
              The application encountered an unexpected error. This has been logged to the console.
            </p>
            {this.state.error && (
              <div className="mt-4 rounded-2xl bg-red-50 p-4">
                <code className="text-xs text-red-700">{this.state.error.message}</code>
              </div>
            )}
            <button
              onClick={this.handleReset}
              className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-[var(--app-accent)] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[var(--app-accent-strong)]"
            >
              <RefreshCw className="h-4 w-4" />
              Try again
            </button>
            <button
              onClick={() => window.location.reload()}
              className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-[var(--app-border)] bg-white px-4 py-3 text-sm font-semibold text-[var(--app-text)] transition hover:bg-gray-50"
            >
              Reload page
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
