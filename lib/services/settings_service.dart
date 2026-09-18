import 'dart:convert';

import 'package:crypto/crypto.dart';

import '../database/repositories/settings_repository.dart';
import '../models/models.dart';
import '../utils/app_error.dart';
import '../utils/message_template.dart';
import '../utils/validation.dart';

const _pinSalt = 'hotel-customer-manager/pin/v1:';

const _defaults = HotelSettings(
  hotelName: 'My Hotel',
  hotelAddress: '',
  hotelPhone: '',
  pinHash: '',
  lastBackupAt: '',
  whatsappEnabled: true,
  whatsappCountryCode: '91',
  whatsappWelcomeTemplate: defaultWelcomeTemplate,
);

/// Longest welcome message we'll store. `wa.me` prefill is a URL query
/// parameter, so a runaway template would get truncated by the OS anyway.
const _maxTemplateLength = 1000;

final _countryCodePattern = RegExp(r'^\d{1,4}$');

String _hashPin(String pin) => sha256.convert(utf8.encode('$_pinSalt$pin')).toString();

/// Hotel identity, and the optional app PIN.
///
/// The PIN itself is **never stored** — only a salted SHA-256 digest. An
/// empty digest means "no PIN configured", in which case [verifyPin] always
/// succeeds (there's nothing to check against).
class SettingsService {
  final SettingsRepository _repo;
  SettingsService(this._repo);

  Future<HotelSettings> get() async {
    final stored = await _repo.getAll();
    return HotelSettings(
      hotelName: (stored['hotel_name']?.isNotEmpty ?? false) ? stored['hotel_name']! : _defaults.hotelName,
      hotelAddress: stored['hotel_address'] ?? _defaults.hotelAddress,
      hotelPhone: stored['hotel_phone'] ?? _defaults.hotelPhone,
      pinHash: stored['pin_hash'] ?? _defaults.pinHash,
      lastBackupAt: stored['last_backup_at'] ?? _defaults.lastBackupAt,
      // These three keys are absent on installs created before the WhatsApp
      // feature shipped, so they fall back rather than needing a migration.
      whatsappEnabled: (stored['whatsapp_enabled'] ?? '1') == '1',
      whatsappCountryCode: (stored['whatsapp_country_code']?.isNotEmpty ?? false)
          ? stored['whatsapp_country_code']!
          : _defaults.whatsappCountryCode,
      whatsappWelcomeTemplate: (stored['whatsapp_welcome_template']?.isNotEmpty ?? false)
          ? stored['whatsapp_welcome_template']!
          : _defaults.whatsappWelcomeTemplate,
    );
  }

  Future<void> saveHotelInfo({
    required String hotelName,
    required String hotelAddress,
    required String hotelPhone,
  }) async {
    final name = hotelName.trim();
    if (name.isEmpty || name.length > 80) {
      throw const AppError(AppErrorCode.validation, 'Hotel name is required (up to 80 characters).');
    }
    await _repo.setMany({
      'hotel_name': name,
      'hotel_address': hotelAddress.trim(),
      'hotel_phone': hotelPhone.trim(),
    });
  }

  Future<void> saveWhatsAppSettings({
    required bool enabled,
    required String countryCode,
    required String template,
  }) async {
    final code = countryCode.trim().replaceFirst(RegExp(r'^\+'), '');
    if (!_countryCodePattern.hasMatch(code)) {
      throw const AppError(AppErrorCode.validation, 'Country code must be 1-4 digits.');
    }
    final body = template.trim();
    if (body.isEmpty || body.length > _maxTemplateLength) {
      throw const AppError(
        AppErrorCode.validation,
        'Welcome message is required (up to $_maxTemplateLength characters).',
      );
    }
    await _repo.setMany({
      'whatsapp_enabled': enabled ? '1' : '0',
      'whatsapp_country_code': code,
      'whatsapp_welcome_template': body,
    });
  }

  Future<bool> isPinEnabled() async => ((await _repo.get('pin_hash')) ?? '').isNotEmpty;

  Future<void> setPin(String pin) async {
    final error = validatePin(pin);
    if (error != null) throw AppError(AppErrorCode.validation, error);
    await _repo.set('pin_hash', _hashPin(pin));
  }

  Future<bool> verifyPin(String pin) async {
    final stored = await _repo.get('pin_hash') ?? '';
    if (stored.isEmpty) return true;
    return stored == _hashPin(pin);
  }

  Future<void> clearPin(String currentPin) async {
    if (!await verifyPin(currentPin)) {
      throw const AppError(AppErrorCode.validation, 'That PIN is incorrect.');
    }
    await _repo.set('pin_hash', '');
  }

  Future<String> lastBackupAt() async => (await _repo.get('last_backup_at')) ?? '';
}
