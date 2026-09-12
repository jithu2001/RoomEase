import 'dart:async';

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import 'pages/pin_lock_page.dart';
import 'router.dart';
import 'services/auto_backup_service.dart';
import 'services/services.dart';
import 'state/app_state.dart';
import 'theme/app_theme.dart';
import 'utils/app_error.dart';

/// App bootstrap — mirrors `App.tsx`: open SQLite + run migrations, read
/// hotel settings, show the PIN lock if one is configured, then render the
/// routes. Everything after startup is fully offline.
///
/// Exactly one top-level [MaterialApp] (or [MaterialApp.router]) is mounted
/// at a time — boot loading, boot error, the PIN lock, or the routed app —
/// swapped wholesale rather than nested, so there is never more than one
/// [Navigator]/[Router] in the tree.
class RoomEaseApp extends StatefulWidget {
  const RoomEaseApp({super.key});

  @override
  State<RoomEaseApp> createState() => _RoomEaseAppState();
}

class _RoomEaseAppState extends State<RoomEaseApp> with WidgetsBindingObserver {
  late Future<AppState> _boot;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _boot = _bootstrap();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  Future<AppState> _bootstrap() async {
    final services = await initServices();
    final hotel = await services.settings.get();
    return AppState(services: services, hotel: hotel);
  }

  AppState? _liveAppState;

  // Re-lock when the app goes to the background, so ID photos are never
  // left visible in the OS recent-apps view.
  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state != AppLifecycleState.paused && state != AppLifecycleState.inactive) return;
    final appState = _liveAppState;
    if (appState == null) return;
    // Read the current setting rather than the boot snapshot, so a PIN
    // added during this session takes effect immediately.
    appState.services.settings.isPinEnabled().then((enabled) {
      if (enabled) appState.lock();
    });
  }

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<AppState>(
      future: _boot,
      builder: (context, snapshot) {
        if (snapshot.hasError) {
          return MaterialApp(
            theme: appLightTheme,
            darkTheme: appDarkTheme,
            debugShowCheckedModeBanner: false,
            home: _BootError(message: toUserMessage(snapshot.error!), onRetry: () => setState(() => _boot = _bootstrap())),
          );
        }
        if (!snapshot.hasData) {
          return MaterialApp(
            theme: appLightTheme,
            darkTheme: appDarkTheme,
            debugShowCheckedModeBanner: false,
            home: const _BootLoading(),
          );
        }
        _liveAppState = snapshot.data;
        return ChangeNotifierProvider.value(
          value: snapshot.data!,
          child: const _AppShell(),
        );
      },
    );
  }
}

class _AppShell extends StatelessWidget {
  const _AppShell();

  @override
  Widget build(BuildContext context) {
    final locked = context.select<AppState, bool>((s) => s.locked);
    if (locked) {
      return MaterialApp(
        title: 'Hotel Manager',
        theme: appLightTheme,
        darkTheme: appDarkTheme,
        debugShowCheckedModeBanner: false,
        home: const PinLockPage(),
      );
    }
    return const _RoutedApp();
  }
}

class _RoutedApp extends StatefulWidget {
  const _RoutedApp();

  @override
  State<_RoutedApp> createState() => _RoutedAppState();
}

class _RoutedAppState extends State<_RoutedApp> {
  @override
  void initState() {
    super.initState();
    // Fire-and-forget, delayed so it never competes with first paint.
    Timer(const Duration(milliseconds: 2500), _runAutoBackup);
  }

  Future<void> _runAutoBackup() async {
    if (!mounted) return;
    final appState = context.read<AppState>();
    final result = await appState.services.autoBackup.runIfDue();
    if (result.status == AutoBackupStatus.written && mounted) {
      await appState.reloadHotel();
    }
  }

  @override
  Widget build(BuildContext context) {
    return MaterialApp.router(
      title: 'Hotel Manager',
      theme: appLightTheme,
      darkTheme: appDarkTheme,
      debugShowCheckedModeBanner: false,
      routerConfig: appRouter,
    );
  }
}

class _BootLoading extends StatelessWidget {
  const _BootLoading();

  @override
  Widget build(BuildContext context) => const Scaffold(
        body: Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              CircularProgressIndicator(),
              SizedBox(height: 16),
              Text('Opening local database…'),
            ],
          ),
        ),
      );
}

class _BootError extends StatelessWidget {
  final String message;
  final VoidCallback onRetry;
  const _BootError({required this.message, required this.onRetry});

  @override
  Widget build(BuildContext context) => Scaffold(
        body: Center(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Icon(Icons.error_outline, size: 40),
                const SizedBox(height: 12),
                Text(message, textAlign: TextAlign.center),
                const SizedBox(height: 16),
                FilledButton(onPressed: onRetry, child: const Text('Try again')),
              ],
            ),
          ),
        ),
      );
}
