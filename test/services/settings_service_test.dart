import 'package:flutter_test/flutter_test.dart';
import 'package:roomease/database/repositories/settings_repository.dart';
import 'package:roomease/services/settings_service.dart';
import 'package:roomease/utils/app_error.dart';
import 'package:roomease/utils/message_template.dart';

import '../helpers/test_db.dart';

void main() {
  late SettingsService settings;

  setUp(() async {
    final driver = await openTestDatabase();
    settings = SettingsService(SettingsRepository(driver));
  });

  test('defaults to "My Hotel" with no PIN', () async {
    final hotel = await settings.get();
    expect(hotel.hotelName, 'My Hotel');
    expect(hotel.pinEnabled, isFalse);
  });

  test('verifyPin always succeeds when no PIN is configured', () async {
    expect(await settings.verifyPin('anything'), isTrue);
  });

  test('setPin then verifyPin round-trips', () async {
    await settings.setPin('1234');
    expect(await settings.isPinEnabled(), isTrue);
    expect(await settings.verifyPin('1234'), isTrue);
    expect(await settings.verifyPin('0000'), isFalse);
  });

  test('setPin rejects a bad format', () async {
    expect(() => settings.setPin('12'), throwsA(isA<AppError>()));
  });

  test('clearPin requires the current PIN', () async {
    await settings.setPin('1234');
    expect(() => settings.clearPin('9999'), throwsA(isA<AppError>()));
    await settings.clearPin('1234');
    expect(await settings.isPinEnabled(), isFalse);
  });

  test('the PIN itself is never stored, only its hash', () async {
    await settings.setPin('1234');
    final hotel = await settings.get();
    expect(hotel.pinHash, isNot('1234'));
    expect(hotel.pinHash.length, 64); // sha256 hex digest
  });

  test('saveHotelInfo requires a name', () async {
    expect(
      () => settings.saveHotelInfo(hotelName: '', hotelAddress: '', hotelPhone: ''),
      throwsA(isA<AppError>()),
    );
  });

  group('WhatsApp settings', () {
    test('falls back to defaults when the keys are absent (upgrade path)', () async {
      final driver = await openTestDatabase();
      final repo = SettingsRepository(driver);
      for (final key in ['whatsapp_enabled', 'whatsapp_country_code', 'whatsapp_welcome_template']) {
        await repo.remove(key);
      }
      final hotel = await SettingsService(repo).get();
      expect(hotel.whatsappEnabled, isTrue);
      expect(hotel.whatsappCountryCode, '91');
      expect(hotel.whatsappWelcomeTemplate, defaultWelcomeTemplate);
    });

    test('round-trips a saved template', () async {
      await settings.saveWhatsAppSettings(
        enabled: false,
        countryCode: '+1',
        template: 'Welcome {guest} to room {room}.',
      );
      final hotel = await settings.get();
      expect(hotel.whatsappEnabled, isFalse);
      expect(hotel.whatsappCountryCode, '1'); // the '+' is stripped
      expect(hotel.whatsappWelcomeTemplate, 'Welcome {guest} to room {room}.');
    });

    test('rejects a blank template', () async {
      expect(
        () => settings.saveWhatsAppSettings(enabled: true, countryCode: '91', template: '   '),
        throwsA(isA<AppError>()),
      );
    });

    test('rejects a non-numeric country code', () async {
      expect(
        () => settings.saveWhatsAppSettings(enabled: true, countryCode: 'IN', template: 'Hi'),
        throwsA(isA<AppError>()),
      );
    });
  });
}
