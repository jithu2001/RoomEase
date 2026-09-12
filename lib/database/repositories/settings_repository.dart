import '../sql_driver.dart';

class SettingsRepository {
  final SqlDriver _driver;
  SettingsRepository(this._driver);

  Future<Map<String, String>> getAll() async {
    final rows = await _driver.query('SELECT key, value FROM settings', const []);
    return {for (final row in rows) row['key'] as String: (row['value'] as String?) ?? ''};
  }

  Future<String?> get(String key) async {
    final rows = await _driver.query('SELECT value FROM settings WHERE key = ?', [key]);
    return rows.isEmpty ? null : rows.first['value'] as String?;
  }

  /// Portable upsert (try UPDATE, INSERT if no row existed) rather than
  /// `ON CONFLICT ... DO UPDATE`, which needs SQLite 3.24+ — newer than the
  /// system SQLite some Android 8/9 devices still ship.
  Future<void> set(String key, String value) async {
    final result = await _driver.run('UPDATE settings SET value = ? WHERE key = ?', [value, key]);
    if (result.changes == 0) {
      await _driver.run('INSERT INTO settings (key, value) VALUES (?, ?)', [key, value]);
    }
  }

  Future<void> setMany(Map<String, String> entries) async {
    await _driver.transaction((txn) async {
      final repo = SettingsRepository(txn);
      for (final entry in entries.entries) {
        await repo.set(entry.key, entry.value);
      }
    });
  }

  Future<void> remove(String key) async {
    await _driver.run('DELETE FROM settings WHERE key = ?', [key]);
  }
}
