import '../utils/app_date.dart';
import '../utils/app_error.dart';
import 'sql_driver.dart';

/// Schema version is tracked via `PRAGMA user_version` (no separate
/// migrations table) — mirrors `src/database/migrations.ts` exactly,
/// including the full migration history, so an existing device's exported
/// backup (built on the same schema) restores cleanly.
class Migration {
  final int version;
  final String name;
  final List<String> statements;
  final Future<void> Function(SqlDriver driver)? seed;
  const Migration({required this.version, required this.name, required this.statements, this.seed});
}

const defaultRooms = ['101', '102', '103', '104', '105', '201', '202', '203'];

Map<String, String> defaultSettings() => const {
      'hotel_name': 'My Hotel',
      'hotel_address': '',
      'hotel_phone': '',
      'pin_hash': '',
      'last_backup_at': '',
      'auto_backup_enabled': '1',
    };

final List<Migration> migrations = [
  Migration(
    version: 1,
    name: 'initial schema',
    statements: const [
      '''
      CREATE TABLE customers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        customer_code TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        address TEXT NOT NULL,
        phone TEXT NOT NULL,
        room_number TEXT NOT NULL,
        number_of_persons INTEGER NOT NULL,
        id_front_path TEXT NOT NULL,
        id_back_path TEXT NOT NULL,
        check_in_date TEXT NOT NULL,
        check_out_date TEXT,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
      ''',
      '''
      CREATE TABLE rooms (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        room_number TEXT UNIQUE NOT NULL,
        created_at TEXT NOT NULL
      )
      ''',
      'CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT)',
      'CREATE INDEX idx_customers_status ON customers (status)',
      'CREATE INDEX idx_customers_room ON customers (room_number)',
      'CREATE INDEX idx_customers_phone ON customers (phone)',
      'CREATE INDEX idx_customers_code ON customers (customer_code)',
      'CREATE INDEX idx_customers_checkin ON customers (check_in_date DESC)',
      'CREATE INDEX idx_customers_checkout ON customers (check_out_date DESC)',
      'CREATE INDEX idx_customers_name ON customers (name)',
      // Enforced by the DB itself: only one active guest per room.
      "CREATE UNIQUE INDEX idx_customers_active_room ON customers (room_number) WHERE status = 'CHECKED_IN'",
    ],
    seed: (driver) async {
      final now = nowIso();
      for (final room in defaultRooms) {
        await driver.run('INSERT OR IGNORE INTO rooms (room_number, created_at) VALUES (?, ?)', [room, now]);
      }
      for (final entry in defaultSettings().entries) {
        await driver.run(
          'INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)',
          [entry.key, entry.value],
        );
      }
      await driver.run('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)', ['schema_created_at', now]);
    },
  ),
  Migration(
    version: 2,
    name: 'id photo thumbnails',
    statements: const [
      'ALTER TABLE customers ADD COLUMN id_front_thumb_path TEXT',
      'ALTER TABLE customers ADD COLUMN id_back_thumb_path TEXT',
    ],
  ),
  Migration(
    version: 3,
    name: 'composite list indexes',
    statements: const [
      'CREATE INDEX idx_customers_status_checkin ON customers (status, check_in_date DESC, id DESC)',
      'CREATE INDEX idx_customers_checkin_id ON customers (check_in_date DESC, id DESC)',
      'DROP INDEX idx_customers_checkin',
    ],
  ),
  Migration(
    version: 4,
    name: 'booking amount + returning-guest lookup',
    statements: const [
      // Minor units (paise), never a float.
      'ALTER TABLE customers ADD COLUMN amount_minor INTEGER',
      'CREATE INDEX idx_customers_phone_checkin ON customers (phone, check_in_date DESC)',
      'DROP INDEX idx_customers_phone',
    ],
  ),
  Migration(
    version: 5,
    name: 'additional guests per booking',
    statements: const [
      '''
      CREATE TABLE booking_guests (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        phone TEXT,
        id_front_path TEXT,
        id_back_path TEXT,
        id_front_thumb_path TEXT,
        id_back_thumb_path TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
      ''',
      'CREATE INDEX idx_booking_guests_customer ON booking_guests (customer_id)',
      'CREATE INDEX idx_booking_guests_name ON booking_guests (name)',
    ],
  ),
];

int get latestVersion => migrations.map((m) => m.version).reduce((a, b) => a > b ? a : b);

Future<void> _applyMigration(SqlDriver driver, Migration migration) async {
  await driver.transaction((txn) async {
    for (final statement in migration.statements) {
      await txn.execute(statement);
    }
    if (migration.seed != null) await migration.seed!(txn);
    await txn.execute('PRAGMA user_version = ${migration.version}');
  });
}

Future<void> runMigrations(SqlDriver driver) async {
  var current = await scalar<int>(driver, 'PRAGMA user_version', const [], 0);
  final pending = migrations.where((m) => m.version > current).toList()
    ..sort((a, b) => a.version.compareTo(b.version));
  for (final migration in pending) {
    try {
      await _applyMigration(driver, migration);
      current = migration.version;
    } catch (e) {
      throw AppError(
        AppErrorCode.dbInit,
        'The database could not be upgraded (step ${migration.version}: ${migration.name}).',
        e,
      );
    }
  }
}
