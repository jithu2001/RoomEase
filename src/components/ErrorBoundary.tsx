/**
 * Last-resort guard: an unexpected render error shows a recovery screen rather
 * than a blank white app, which on a phone is indistinguishable from a crash.
 */

import { Component, type ErrorInfo, type ReactNode } from 'react';

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Component stack only — never customer data.
    console.error('[ErrorBoundary]', error.message, info.componentStack);
  }

  render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <div className="center-screen">
        <div style={{ fontSize: '2.2rem' }} aria-hidden="true">
          ⚠️
        </div>
        <h2>The app hit an unexpected problem</h2>
        <p className="muted small">
          Your saved customer data has not been changed. Reopen the screen to continue.
        </p>
        <button
          type="button"
          className="btn"
          onClick={() => {
            this.setState({ error: null });
            window.location.hash = '';
            window.location.reload();
          }}
        >
          Restart the app
        </button>
      </div>
    );
  }
}
