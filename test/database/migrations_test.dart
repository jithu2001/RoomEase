import 'package:flutter_test/flutter_test.dart';
import 'package:roomease/database/app_database.dart';
import 'package:roomease/database/migrations.dart';
import 'package:roomease/database/sql_driver.dart';

import '../helpers/test_db.dart';

Future<Set<String>> _tableNames(SqlDriver driver) async {
  final rows = await driver.query("SELECT name FROM sqlite_master WHERE type='table'", const []);
  return rows.map((r) => r['name'] as String).toSet();
}

void main() {
  test('a fresh install creates the full schema and seed data', () async {
    final driver = await openTestDatabase();

    final tables = await _tableNames(driver);
    expect(tables, containsAll(['customers', 'rooms', 'settings', 'booking_guests']));

    final version = await scalar<int>(driver, 'PRAGMA user_version', const [], 0);
    expect(version, latestVersion);

    final rooms = await driver.query('SELECT room_number FROM rooms ORDER BY room_number', const []);
    expect(rooms.length, defaultRooms.length);

    final settings = await driver.query('SELECT key, value FROM settings', const []);
    final settingsMap = {for (final r in settings) r['key'] as String: r['value'] as String?};
    expect(settingsMap['hotel_name'], 'My Hotel');
    expect(settingsMap['auto_backup_enabled'], '1');
  });

  test('migrations are idempotent: re-running does not duplicate seed rows', () async {
    final driver = await openTestDatabase();
    await runMigrations(driver); // second run should be a no-op

    final rooms = await driver.query('SELECT room_number FROM rooms', const []);
    expect(rooms.length, defaultRooms.length);
  });

  test('only one CHECKED_IN customer can occupy a room at a time', () async {
    final driver = await openTestDatabase();
    final now = '2026-01-01T10:00:00.000+05:30';

    Future<void> insertCustomer(String code) => driver.run(
          '''
          INSERT INTO customers (
            customer_code, name, address, phone, room_number, number_of_persons,
            id_front_path, id_back_path, check_in_date, check_out_date, status,
            created_at, updated_at
          ) VALUES (?, 'Guest', 'Addr', '9999999999', '101', 1, 'f', 'b', ?, NULL, 'CHECKED_IN', ?, ?)
          ''',
          [code, now, now, now],
        );

    await insertCustomer('CUS-000001');
    expect(() => insertCustomer('CUS-000002'), throwsA(anything));
  });

  test('customer_code must be unique', () async {
    final driver = await openTestDatabase();
    final now = '2026-01-01T10:00:00.000+05:30';
    Future<void> insertCustomer(String room) => driver.run(
          '''
          INSERT INTO customers (
            customer_code, name, address, phone, room_number, number_of_persons,
            id_front_path, id_back_path, check_in_date, check_out_date, status,
            created_at, updated_at
          ) VALUES ('CUS-000001', 'Guest', 'Addr', '9999999999', ?, 1, 'f', 'b', ?, NULL, 'CHECKED_OUT', ?, ?)
          ''',
          [room, now, now, now],
        );
    await insertCustomer('101');
    expect(() => insertCustomer('102'), throwsA(anything));
  });

  test('wipeAllTables clears customer/room data but keeps hotel identity and PIN', () async {
    final driver = await openTestDatabase();
    await driver.run("UPDATE settings SET value = 'The Grand' WHERE key = 'hotel_name'", const []);
    await driver.run("INSERT OR REPLACE INTO settings (key, value) VALUES ('pin_hash', 'abc123')", const []);
    await driver.run(
      '''
      INSERT INTO customers (
        customer_code, name, address, phone, room_number, number_of_persons,
        id_front_path, id_back_path, check_in_date, check_out_date, status, created_at, updated_at
      ) VALUES ('CUS-000001', 'Guest', 'Addr', '999', '101', 1, 'f', 'b', '2026-01-01T00:00:00+05:30', NULL, 'CHECKED_IN', '2026-01-01T00:00:00+05:30', '2026-01-01T00:00:00+05:30')
      ''',
      const [],
    );

    await wipeAllTables(driver);

    final customers = await driver.query('SELECT * FROM customers', const []);
    final rooms = await driver.query('SELECT * FROM rooms', const []);
    expect(customers, isEmpty);
    expect(rooms, isEmpty);

    final settings = await driver.query('SELECT key, value FROM settings', const []);
    final settingsMap = {for (final r in settings) r['key'] as String: r['value'] as String?};
    expect(settingsMap['hotel_name'], 'The Grand');
    expect(settingsMap['pin_hash'], 'abc123');
  });
}
