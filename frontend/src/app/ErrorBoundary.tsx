/**
 * Catches render errors in a page so the rest of the app keeps working.
 * Hook a crash reporter (Sentry etc.) into componentDidCatch for production.
 */
import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Button, EmptyState } from '@/components/ui';

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // TODO(backend): forward to the error-reporting service.
    console.error('[EduTrack] Unhandled UI error', error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="card">
        <EmptyState
          icon="error"
          title="Something went wrong on this page"
          description={this.state.error.message || 'An unexpected error occurred.'}
          action={
            <Button variant="tonal" icon="refresh" onClick={() => this.setState({ error: null })}>
              Try again
            </Button>
          }
        />
      </div>
    );
  }
}
