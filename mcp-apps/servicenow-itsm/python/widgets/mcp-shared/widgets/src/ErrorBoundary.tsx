import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props { children: ReactNode; }
interface State { hasError: boolean; error: Error | null; }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[MCP Widget Error]', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          role="alert"
          aria-live="assertive"
          style={{
            padding: '24px', textAlign: 'center', fontFamily: 'Segoe UI, sans-serif',
            color: '#d13438', background: '#fde7e9', borderRadius: '8px', margin: '12px'
          }}
        >
          <div style={{ fontSize: '18px', fontWeight: 600, marginBottom: '8px' }}>Widget Error</div>
          <div style={{ fontSize: '13px', color: '#605e5c' }}>
            {this.state.error?.message || 'Something went wrong rendering this widget.'}
          </div>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            style={{
              marginTop: '12px', padding: '6px 16px', border: '1px solid #d13438',
              borderRadius: '4px', background: 'white', color: '#d13438', cursor: 'pointer'
            }}
          >
            Try Again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
