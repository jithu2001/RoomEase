package com.trinity.hotelmanager

import android.view.WindowManager
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel

/**
 * Hosts one platform channel: `com.trinity.hotelmanager/screen_guard`.
 *
 * `setEnabled(bool)` toggles [WindowManager.LayoutParams.FLAG_SECURE], which blocks
 * screenshots, screen recording, and hides app content from the Android recent-apps
 * thumbnail. The Dart side turns this on whenever an app PIN is configured and off
 * otherwise (see `lib/services/screen_guard_service.dart`), so ID photos are never
 * left visible outside the unlocked app.
 */
class MainActivity : FlutterActivity() {
    private val channelName = "com.trinity.hotelmanager/screen_guard"

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, channelName).setMethodCallHandler { call, result ->
            when (call.method) {
                "setEnabled" -> {
                    val enabled = call.argument<Boolean>("enabled") ?: false
                    runOnUiThread {
                        if (enabled) {
                            window.setFlags(
                                WindowManager.LayoutParams.FLAG_SECURE,
                                WindowManager.LayoutParams.FLAG_SECURE
                            )
                        } else {
                            window.clearFlags(WindowManager.LayoutParams.FLAG_SECURE)
                        }
                    }
                    result.success(null)
                }
                else -> result.notImplemented()
            }
        }
    }
}
