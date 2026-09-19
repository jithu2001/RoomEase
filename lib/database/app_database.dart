import 'package:path/path.dart' as p;
import 'package:sqflite/sqflite.dart';

import '../utils/app_error.dart';
import 'migrations.dart';
import 'sql_driver.dart';

const _dbName = 'hotelmanager.db';

/// A factory for the underlying `sqflite`-compatible database — swapped out
/// in tests for `sqflite_common_ffi`'s in-memory factory so repository/
/// service tests run against real SQLite without a device or emulator.
DatabaseFactory? testDatabaseFactory;
String? testDatabasePath;

SqlDriver? _driver;
Future<SqlDriver>? _opening;

Future<void> _assertIntegrity(SqlDriver driver) async {
  List<Map<String, Object?>> rows;
  try {
    rows = await driver.query('PRAGMA quick_check(1)', const []);
  } catch (_) {
    // Being unable to even run the pragma isn't itself evidence of
    // corruption — keep going rather than block startup on it.
    return;
  }
  if (rows.isEmpty) return;
  final result = rows.first.values.first?.toString().toLowerCase();
  if (result != 'ok') {
    throw const AppError(
      AppErrorCode.dbInit,
      'The local database appears to be damaged. If you have a backup, restore it from '
      'Settings > Data on a fresh install.',
    );
  }
}

/// Opens (or reuses) the singleton database connection, applying any
/// pending migrations. Safe to call more than once; retries from scratch if
/// a previous attempt failed.
Future<SqlDriver> initDatabase() {
  return _opening ??= () async {
    try {
      final factory = testDatabaseFactory ?? databaseFactory;
      final path = testDatabasePath ?? p.join(await factory.getDatabasesPath(), _dbName);
      final db = await factory.openDatabase(
        path,
        options: OpenDatabaseOptions(
          // Disabled so a `:memory:` path used by tests never returns a
          // cached, already-populated connection from an earlier test —
          // each openTestDatabase() call must get a genuinely fresh database.
          // Harmless for the single real connection the app itself opens.
          singleInstance: false,
          onConfigure: (db) async {
            await db.execute('PRAGMA foreign_keys = ON');
          },
        ),
      );
      final driver = SqlDriver(db);
      await _assertIntegrity(driver);
      await runMigrations(driver);
      _driver = driver;
      return driver;
    } catch (e) {
      _opening = null;
      if (e is AppError) rethrow;
      throw AppError(AppErrorCode.dbInit, 'The local database could not be opened.', e);
    }
  }();
}

/// Throws synchronously if [initDatabase] hasn't completed yet.
SqlDriver getDatabase() {
  final driver = _driver;
  if (driver == null) {
    throw const AppError(AppErrorCode.dbInit, 'The database has not been opened yet.');
  }
  return driver;
}

/// "Clear all data": wipes customers/guests/rooms and non-identity settings,
/// keeping the hotel's own name/address/phone and app PIN.
Future<void> wipeAllTables(SqlDriver driver) async {
  await driver.transaction((txn) async {
    await txn.run('DELETE FROM booking_guests');
    await txn.run('DELETE FROM customers');
    await txn.run('DELETE FROM rooms');
    await txn.run(
      "DELETE FROM settings WHERE key NOT IN ('hotel_name','hotel_address','hotel_phone','pin_hash')",
    );
    final sequenceTable = await txn.query(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='sqlite_sequence'",
      const [],
    );
    if (sequenceTable.isNotEmpty) {
      await txn.run(
        "DELETE FROM sqlite_sequence WHERE name IN ('customers','rooms','booking_guests')",
      );
    }
  });
  await driver.persist();
}

/// Test-only: resets the process-wide singleton so a fresh [initDatabase]
/// call opens a new connection.
void resetDatabaseForTest() {
  _driver = null;
  _opening = null;
}
