import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.trinity.hotelmanager',
  appName: 'Hotel Manager',
  webDir: 'dist',
  // No `server.url` on purpose: the bundled web assets are shipped inside the
  // APK so the app never needs a network connection.
  android: {
    // Keeps the WebView from being treated as a plain browser page.
    allowMixedContent: false,
    captureInput: true,
    webContentsDebuggingEnabled: false,
  },
  plugins: {
    CapacitorSQLite: {
      android: {
        // Databases live in the app's private storage; no encryption keys to
        // manage on a device the hotel owns.
        databaseLocation: 'default',
      },
    },
  },
};

export default config;
