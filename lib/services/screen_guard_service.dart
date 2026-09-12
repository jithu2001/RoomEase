import 'dart:io';

import 'package:flutter/services.dart';

import '../utils/app_error.dart';

const _channel = MethodChannel('com.trinity.hotelmanager/screen_guard');

/// Toggles Android's `FLAG_SECURE` (see `MainActivity.kt`) to block
/// screenshots, screen recording, and the recent-apps thumbnail. The app
/// turns this on whenever an app PIN is configured and off otherwise, so ID
/// photos are never left visible outside the unlocked app.
Future<void> setScreenGuard(bool enabled) async {
  if (!Platform.isAndroid) return;
  try {
    await _channel.invokeMethod<void>('setEnabled', {'enabled': enabled});
  } catch (e) {
    // Never let a platform-channel hiccup break the app.
    logError('screenGuard', e);
  }
}
