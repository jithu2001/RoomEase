/** Loading, empty and error presentation shared by every screen. */

import type { ReactNode } from 'react';

export function Spinner({ small, onBrand }: { small?: boolean; onBrand?: boolean }) {
  return (
    <span
      className={`spinner${small ? ' small' : ''}${onBrand ? ' on-brand' : ''}`}
      role="status"
      aria-label="Loading"
    />
  );
}

export function InlineLoading({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="inline-loading">
      <Spinner small /> {label}
    </div>
  );
}

export function FullScreenLoading({ label = 'Starting up…' }: { label?: string }) {
  return (
    <div className="center-screen">
      <Spinner />
      <p className="muted mb0">{label}</p>
    </div>
  );
}

export function Notice({
  kind = 'info',
  children,
}: {
  kind?: 'info' | 'warn' | 'error';
  children: ReactNode;
}) {
  return (
    <div className={`notice ${kind}`} role={kind === 'error' ? 'alert' : undefined}>
      {children}
    </div>
  );
}

export function EmptyState({
  glyph = '📋',
  title,
  message,
  action,
}: {
  glyph?: string;
  title: string;
  message?: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <div className="glyph" aria-hidden="true">
        {glyph}
      </div>
      <h3>{title}</h3>
      {message ? <p>{message}</p> : null}
      {action}
    </div>
  );
}

/** Used when a screen's data could not be loaded at all. */
export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="empty-state">
      <div className="glyph" aria-hidden="true">
        ⚠️
      </div>
      <h3>Something went wrong</h3>
      <p>{message}</p>
      {onRetry ? (
        <button type="button" className="btn secondary" onClick={onRetry}>
          Try again
        </button>
      ) : null}
    </div>
  );
}
