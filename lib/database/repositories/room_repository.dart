import '../../models/models.dart';
import '../sql_driver.dart';

class RoomRepository {
  final SqlDriver _driver;
  RoomRepository(this._driver);

  /// Numeric-looking room numbers sort numerically first, then alphabetic fallback.
  Future<List<Room>> list() async {
    final rows = await _driver.query(
      '''
      SELECT id, room_number, created_at FROM rooms
      ORDER BY
        (CASE WHEN room_number GLOB '[0-9]*' THEN 0 ELSE 1 END),
        CAST(room_number AS INTEGER),
        room_number
      ''',
      const [],
    );
    return rows.map(Room.fromRow).toList();
  }

  Future<List<String>> listNumbers() async {
    final rooms = await list();
    return rooms.map((r) => r.roomNumber).toList();
  }

  Future<bool> exists(String roomNumber) async {
    final rows = await _driver.query(
      'SELECT 1 FROM rooms WHERE room_number = ? COLLATE NOCASE LIMIT 1',
      [roomNumber],
    );
    return rows.isNotEmpty;
  }

  Future<int> insert(String roomNumber, String createdAt) async {
    final result = await _driver.run(
      'INSERT INTO rooms (room_number, created_at) VALUES (?, ?)',
      [roomNumber, createdAt],
    );
    return result.lastId;
  }

  Future<int> deleteByNumber(String roomNumber) async {
    final result = await _driver.run('DELETE FROM rooms WHERE room_number = ?', [roomNumber]);
    return result.changes;
  }

  Future<int> count() async {
    final rows = await _driver.query('SELECT COUNT(*) AS c FROM rooms', const []);
    return rows.first['c'] as int;
  }

  Future<void> deleteAll() async {
    await _driver.run('DELETE FROM rooms', const []);
  }
}
