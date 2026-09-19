import 'package:flutter/material.dart';

import 'app.dart';

void main() {
  // Catches render-time errors app-wide, mirroring `components/ErrorBoundary.tsx`:
  // customer data is never lost by a UI crash, so show a recovery screen
  // instead of the framework's default red error box.
  ErrorWidget.builder = (details) => Scaffold(
        body: SafeArea(
          child: Center(
            child: Padding(
              padding: const EdgeInsets.all(24),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Icon(Icons.error_outline, size: 40),
                  const SizedBox(height: 12),
                  const Text(
                    'The app hit an unexpected problem.\nYour saved customer data has not been changed.',
                    textAlign: TextAlign.center,
                  ),
                ],
              ),
            ),
          ),
        ),
      );

  runApp(const RoomEaseApp());
}
