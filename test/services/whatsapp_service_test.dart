import 'package:flutter_test/flutter_test.dart';
import 'package:roomease/database/repositories/settings_repository.dart';
import 'package:roomease/models/models.dart';
import 'package:roomease/services/settings_service.dart';
import 'package:roomease/services/whatsapp_service.dart';

import '../helpers/test_db.dart';

Customer _customer({String phone = '9847012345'}) => Customer(
      id: 1,
      customerCode: 'CUS-0042',
      name: 'Anita Menon',
      address: '12 Beach Road',
      phone: phone,
      roomNumber: '102',
      numberOfPersons: 2,
      idFrontPath: 'front.jpg',
      idBackPath: 'back.jpg',
      checkInDate: '2026-09-18T14:30:00.000+05:30',
      checkOutDate: null,
      status: CustomerStatus.checkedIn,
      createdAt: '2026-09-18T14:30:00.000+05:30',
      updatedAt: '2026-09-18T14:30:00.000+05:30',
      idFrontThumbPath: null,
      idBackThumbPath: null,
      amountMinor: 250000,
    );

void main() {
  late SettingsService settings;
  late WhatsAppService whatsapp;

  setUp(() async {
    final driver = await openTestDatabase();
    settings = SettingsService(SettingsRepository(driver));
    whatsapp = WhatsAppService(settings);
  });

  test('builds a wa.me link carrying the number and the rendered message', () async {
    await settings.saveHotelInfo(hotelName: 'Sea View', hotelAddress: '', hotelPhone: '9847000000');
    await settings.saveWhatsAppSettings(
      enabled: true,
      countryCode: '91',
      template: 'Hi {guest}, room {room} at {hotel}. Call {hotel_phone}. Ref {code}.',
    );

    final uri = (await whatsapp.welcomeUri(_customer()))!;
    expect(uri.scheme, 'https');
    expect(uri.host, 'wa.me');
    expect(uri.path, '/919847012345');
    // queryParameters decodes the percent-encoding, so this asserts the text
    // survives the round trip intact.
    expect(
      uri.queryParameters['text'],
      'Hi Anita Menon, room 102 at Sea View. Call 9847000000. Ref CUS-0042.',
    );
  });

  test('the default template renders with no placeholders left over', () async {
    final uri = (await whatsapp.welcomeUri(_customer()))!;
    final text = uri.queryParameters['text']!;
    expect(text, contains('Anita Menon'));
    expect(text, isNot(contains('{')));
    // The room number is deliberately not in the default message — guests are
    // told their room at the desk. {room} stays available for hotels that
    // want it in their own template.
    expect(text, isNot(contains('102')));
  });

  test('newlines and emoji in the template survive URL encoding', () async {
    final uri = (await whatsapp.welcomeUri(_customer()))!;
    expect(uri.queryParameters['text'], contains('\n'));
    expect(uri.queryParameters['text'], contains('🏨'));
  });

  test('an unusable number yields no link and reports invalidNumber', () async {
    expect(await whatsapp.welcomeUri(_customer(phone: '12345')), isNull);
    expect(await whatsapp.previewWelcome(_customer(phone: '12345')), isNull);
    expect(await whatsapp.sendWelcome(_customer(phone: '12345')), WhatsAppSendResult.invalidNumber);
  });

  test('targetNumber shows the fully qualified number', () async {
    expect(await whatsapp.targetNumber(_customer()), '+919847012345');
    expect(await whatsapp.targetNumber(_customer(phone: '098470 12345')), '+919847012345');
  });

  test('the hotel country code setting is applied', () async {
    await settings.saveWhatsAppSettings(enabled: true, countryCode: '1', template: 'Hi {guest}');
    final uri = (await whatsapp.welcomeUri(_customer(phone: '5550109999')))!;
    expect(uri.path, '/15550109999');
  });
}
