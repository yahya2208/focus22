import { Component, type ReactNode, type ErrorInfo } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('═══════════════════════════════════════');
    console.error('FOCUS ERROR BOUNDARY CAUGHT AN ERROR');
    console.error('═══════════════════════════════════════');
    console.error('Error message:', error.message);
    console.error('Error name:', error.name);
    console.error('Error stack:', error.stack);
    console.error('Component stack:', errorInfo.componentStack);
    console.error('═══════════════════════════════════════');
  }

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback ?? (
          <div
            role="alert"
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100vh',
              padding: '2rem',
              textAlign: 'center',
              fontFamily: 'system-ui, sans-serif',
              backgroundColor: '#0a0a0f',
              color: '#f0f0f0',
            }}
          >
            <h1 style={{ fontSize: '1.5rem', marginBottom: '1rem' }}>Something went wrong</h1>
            <p style={{ color: '#888', marginBottom: '1rem', fontSize: '0.85rem', maxWidth: '500px', wordBreak: 'break-all' }}>
              {this.state.error?.message ?? 'An unexpected error occurred.'}
            </p>
            <pre style={{ color: '#666', fontSize: '0.7rem', marginBottom: '2rem', maxWidth: '500px', overflow: 'auto', textAlign: 'left' }}>
              {this.state.error?.stack}
            </pre>
            <button
              onClick={() => window.location.reload()}
              style={{
                padding: '0.75rem 1.5rem',
                borderRadius: '8px',
                border: 'none',
                backgroundColor: '#6366f1',
                color: 'white',
                cursor: 'pointer',
                fontSize: '1rem',
              }}
            >
              Reload
            </button>
          </div>
        )
      );
    }
    return this.props.children;
  }
}
