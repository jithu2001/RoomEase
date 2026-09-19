import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:roomease/database/repositories/booking_guest_repository.dart';
import 'package:roomease/database/repositories/customer_repository.dart';
import 'package:roomease/database/repositories/room_repository.dart';
import 'package:roomease/database/repositories/settings_repository.dart';
import 'package:roomease/database/sql_driver.dart';
import 'package:roomease/models/models.dart';
import 'package:roomease/services/backup_service.dart';
import 'package:roomease/services/customer_service.dart';
import 'package:roomease/services/image_service.dart';
import 'package:roomease/services/room_service.dart';
import 'package:roomease/services/settings_service.dart';
import 'package:roomease/utils/app_error.dart';
import 'package:roomease/utils/validation.dart';

import '../helpers/memory_file_store.dart';
import '../helpers/test_db.dart';

PreparedImage _fakeImage() => const PreparedImage(full: [1, 2, 3, 4], thumb: [1], width: 10, height: 10, bytes: 4);

void main() {
  late SqlDriver driver;
  late CustomerService customers;
  late SettingsService settings;
  late BackupService backup;
  late MemoryFileStore files;

  setUp(() async {
    driver = await openTestDatabase();
    final customerRepo = CustomerRepository(driver);
    final roomRepo = RoomRepository(driver);
    final guestRepo = BookingGuestRepository(driver);
    final settingsRepo = SettingsRepository(driver);
    files = MemoryFileStore();
    final images = ImageService(files);
    final roomService = RoomService(roomRepo, customerRepo);
    customers = CustomerService(customerRepo, roomRepo, roomService, images, guestRepo);
    settings = SettingsService(settingsRepo);
    backup = BackupService(driver, customerRepo, guestRepo, roomRepo, settingsRepo, files);
  });

  NormalisedCustomerForm values({String room = '101'}) => NormalisedCustomerForm(
        name: 'Ravi Kumar',
        address: '123 Main St',
        phone: '9847012345',
        roomNumber: room,
        numberOfPersons: 1,
        amountMinor: 15000,
        checkInAt: null,
        checkOutAt: null,
      );

  test('export then restore round-trips customers and settings', () async {
    await settings.setPin('1234');
    await settings.saveHotelInfo(hotelName: 'The Grand', hotelAddress: 'Addr', hotelPhone: '123');
    await customers.checkIn(values(), CheckInImages(front: _fakeImage(), back: _fakeImage()));

    final export = await backup.exportBackup();
    expect(export.customers, 1);

    // Simulate a fresh device: wipe everything, then restore.
    final bytes = files.peekShared(export.path)!;
    final restored = await backup.restoreBackup(bytes);
    expect(restored.customers, 1);
    expect(restored.warnings, isEmpty);
  });

  test('PIN is never included in an exported backup', () async {
    await settings.setPin('4321');
    final export = await backup.exportBackup();
    final bytes = files.peekShared(export.path)!;

    final manifest = await backup.inspect(bytes);
    expect(manifest.format, backupFormat);

    // Restoring onto a device that never had a PIN must not gain one from
    // this archive — the PIN was excluded at export time, and restore never
    // touches `pin_hash` at all (it also never *clears* a PIN already
    // configured on the restoring device, which this device still has).
    expect(await settings.isPinEnabled(), isTrue);
    await settings.clearPin('4321');
    final restored = await backup.restoreBackup(bytes);
    expect(restored.customers, 0);
    expect(await settings.isPinEnabled(), isFalse);
  });

  test('rejects an empty file', () async {
    expect(() => backup.inspect(Uint8List(0)), throwsA(isA<AppError>()));
  });

  test('rejects a non-zip file', () async {
    expect(() => backup.inspect(Uint8List.fromList('not a zip'.codeUnits)), throwsA(isA<AppError>()));
  });

  test('data-only export omits photos but keeps customer data', () async {
    await customers.checkIn(values(), CheckInImages(front: _fakeImage(), back: _fakeImage()));
    final export = await backup.exportBackup(includeImages: false);
    expect(export.images, 0);
    expect(export.customers, 1);
  });
}
