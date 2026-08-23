import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Capacitor } from '@capacitor/core';
import App from './App';
import './index.css';

/**
 * In the browser (`npm run dev`) @capacitor-community/sqlite runs on top of the
 * jeep-sqlite web component, which needs registering before the first query.
 * On Android the native plugin is used and this is skipped entirely.
 */
async function registerWebSqlite(): Promise<void> {
  // Statically false in production builds (see .env.production), so Rollup
  // drops the dynamic import and jeep-sqlite never enters the APK.
  if (import.meta.env.VITE_WEB_SQLITE !== '1') return;
  if (Capacitor.isNativePlatform()) return;
  const { defineCustomElements } = await import('jeep-sqlite/loader');
  await defineCustomElements(window);
}

/**
 * React's error boundary only catches render errors. A rejected promise in an
 * event handler would otherwise vanish without trace, so log it (message only —
 * never customer data).
 */
function installGlobalErrorLogging(): void {
  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    console.error('[unhandledrejection]', reason instanceof Error ? reason.message : String(reason));
  });
  window.addEventListener('error', (event) => {
    console.error('[window.error]', event.message);
  });
}

async function start(): Promise<void> {
  installGlobalErrorLogging();
  await registerWebSqlite();
  const container = document.getElementById('root');
  if (!container) throw new Error('Root element missing from index.html');
  createRoot(container).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

void start();
