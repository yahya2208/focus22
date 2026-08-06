import { Component, type ReactNode, type ErrorInfo } from 'react';
import { useTranslation } from '../../hooks/useTranslation';
import { devError } from '../../core/logging';
import { registerAppReset, requestInAppReset } from '../../core/navigation/error-reset';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

function ErrorFallback({ onRetry }: { onRetry: () => void }) {
  const { t } = useTranslation();
  return (
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
      <h1 style={{ fontSize: '1.5rem', marginBottom: '1rem' }}>{t('error.title')}</h1>
      <p style={{ color: '#888', marginBottom: '2rem', fontSize: '0.85rem', maxWidth: '500px' }}>
        {t('error.unexpected')}
      </p>
      <button
        onClick={onRetry}
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
        {t('error.reload')}
      </button>
    </div>
  );
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
    devError('═══════════════════════════════════════');
    devError('FOCUS ERROR BOUNDARY CAUGHT AN ERROR');
    devError('═══════════════════════════════════════');
    devError('Error message:', error.message);
    devError('Error name:', error.name);
    devError('Error stack:', error.stack);
    devError('Component stack:', errorInfo.componentStack);
    devError('═══════════════════════════════════════');
  }

  private unregister?: () => void;

  componentDidMount() {
    this.unregister = registerAppReset(() => {
      this.setState({ hasError: false, error: null });
    });
  }

  componentWillUnmount() {
    this.unregister?.();
  }

  private handleRetry = () => {
    if (!requestInAppReset()) {
      window.location.reload();
    }
  };

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback ?? <ErrorFallback onRetry={this.handleRetry} />
      );
    }
    return this.props.children;
  }
}
