import 'package:roomease/database/app_database.dart';
import 'package:roomease/database/sql_driver.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';

/// Opens a fresh, migrated, purely in-memory database for one test.
/// Call once per test (each call gets an isolated database).
Future<SqlDriver> openTestDatabase() async {
  sqfliteFfiInit();
  testDatabaseFactory = databaseFactoryFfi;
  testDatabasePath = inMemoryDatabasePath;
  resetDatabaseForTest();
  return initDatabase();
}
