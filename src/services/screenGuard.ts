/**
 * Blocks screenshots, screen recording and recent-apps snapshots.
 *
 * Backed by a small native plugin (android ScreenGuardPlugin.java) that toggles
 * FLAG_SECURE. Enabled whenever an app PIN is configured, so the protection
 * follows the hotel's own privacy choice. A no-op in the browser.
 */

import { Capacitor, registerPlugin } from '@capacitor/core';
import { logError } from '../utils/errors';

interface ScreenGuardPlugin {
  setEnabled(options: { enabled: boolean }): Promise<void>;
}

const ScreenGuard = registerPlugin<ScreenGuardPlugin>('ScreenGuard');

export async function setScreenGuard(enabled: boolean): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    await ScreenGuard.setEnabled({ enabled });
  } catch (e) {
    // An older build without the plugin must not break the app.
    logError('screenGuard', e);
  }
}
