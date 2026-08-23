import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync('./package.json', 'utf8')) as { version: string };

export default defineConfig({
  plugins: [react()],
  // Surfaced in Settings > About so a staff member can report their version.
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  build: {
    // Capacitor copies this folder into the Android assets bundle.
    outDir: 'dist',
    // Android WebView (Chrome 90+) handles modern output fine.
    target: 'es2020',
    sourcemap: false,
  },
  server: {
    port: 5173,
    host: true,
  },
  // jeep-sqlite is only used for the browser fallback; it ships as a
  // stencil bundle that must not be pre-bundled.
  optimizeDeps: {
    exclude: ['jeep-sqlite'],
  },
});
