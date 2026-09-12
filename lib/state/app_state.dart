import 'dart:async';

import 'package:flutter/foundation.dart';

import '../models/models.dart';
import '../services/screen_guard_service.dart';
import '../services/services.dart';

/// App-wide reactive state layered on top of the (non-reactive) [Services]
/// composition root — mirrors the original `ServicesContext.tsx`: the
/// current hotel settings, a lock flag for the PIN screen, and a
/// [dataVersion] counter screens can key their reloads on so a restore or
/// "clear all data" is reflected everywhere without manual plumbing.
class AppState extends ChangeNotifier {
  final Services services;
  HotelSettings hotel;
  late bool locked;
  int dataVersion = 0;

  AppState({required this.services, required this.hotel}) {
    locked = hotel.pinEnabled;
    _applyScreenGuard();
  }

  Future<void> reloadHotel() async {
    hotel = await services.settings.get();
    _applyScreenGuard();
    notifyListeners();
  }

  /// Bumps [dataVersion] so screens depending on it refetch — used after a
  /// restore or "clear all data".
  void invalidateData() {
    dataVersion++;
    notifyListeners();
  }

  void lock() {
    if (locked) return;
    locked = true;
    notifyListeners();
  }

  void unlock() {
    if (!locked) return;
    locked = false;
    notifyListeners();
  }

  void _applyScreenGuard() {
    unawaited(setScreenGuard(hotel.pinEnabled));
  }
}
