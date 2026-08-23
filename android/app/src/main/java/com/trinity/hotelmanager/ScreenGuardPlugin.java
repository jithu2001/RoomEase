package com.trinity.hotelmanager;

import android.view.WindowManager;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Adds/removes FLAG_SECURE on the app window.
 *
 * The app stores photographs of guests' ID documents. With the flag set,
 * Android blocks screenshots and screen recording, and shows a blank tile in
 * the recent-apps switcher instead of a snapshot of whatever was on screen.
 *
 * The web layer enables this whenever an app PIN is configured, so it follows
 * the hotel's own privacy choice rather than being forced on.
 */
@CapacitorPlugin(name = "ScreenGuard")
public class ScreenGuardPlugin extends Plugin {

    @PluginMethod
    public void setEnabled(PluginCall call) {
        final boolean enabled = Boolean.TRUE.equals(call.getBoolean("enabled", false));
        final android.app.Activity activity = getActivity();
        if (activity == null) {
            call.reject("No activity available");
            return;
        }
        activity.runOnUiThread(() -> {
            if (enabled) {
                activity.getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE);
            } else {
                activity.getWindow().clearFlags(WindowManager.LayoutParams.FLAG_SECURE);
            }
        });
        call.resolve();
    }
}
