import '../../models/models.dart';
import '../sql_driver.dart';

const _columns = '''
  id, customer_id, name, phone, id_front_path, id_back_path,
  id_front_thumb_path, id_back_thumb_path, created_at, updated_at
''';

class NewBookingGuestRow {
  final int customerId;
  final String name;
  final String? phone;
  final String createdAt;
  final String updatedAt;

  const NewBookingGuestRow({
    required this.customerId,
    required this.name,
    required this.phone,
    required this.createdAt,
    required this.updatedAt,
  });
}

class BookingGuestRepository {
  final SqlDriver _driver;
  BookingGuestRepository(this._driver);

  Future<List<BookingGuest>> listByCustomer(int customerId) async {
    final rows = await _driver.query(
      'SELECT $_columns FROM booking_guests WHERE customer_id = ? ORDER BY id ASC',
      [customerId],
    );
    return rows.map(BookingGuest.fromRow).toList();
  }

  /// Batched lookup — avoids an N+1 query when building a report or search result.
  Future<List<BookingGuest>> listByCustomers(List<int> customerIds) async {
    if (customerIds.isEmpty) return const [];
    final placeholders = List.filled(customerIds.length, '?').join(', ');
    final rows = await _driver.query(
      'SELECT $_columns FROM booking_guests WHERE customer_id IN ($placeholders) ORDER BY customer_id ASC, id ASC',
      customerIds,
    );
    return rows.map(BookingGuest.fromRow).toList();
  }

  Future<BookingGuest?> findById(int id) async {
    final rows = await _driver.query('SELECT $_columns FROM booking_guests WHERE id = ?', [id]);
    return rows.isEmpty ? null : BookingGuest.fromRow(rows.first);
  }

  Future<int> countByCustomer(int customerId) async {
    final rows = await _driver.query(
      'SELECT COUNT(*) AS c FROM booking_guests WHERE customer_id = ?',
      [customerId],
    );
    return rows.first['c'] as int;
  }

  /// Inserted without photo paths first — the new row's own id is needed to
  /// name its photo folder before `update` fills the paths in.
  Future<int> insert(NewBookingGuestRow row) async {
    final result = await _driver.run(
      'INSERT INTO booking_guests (customer_id, name, phone, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
      [row.customerId, row.name, row.phone, row.createdAt, row.updatedAt],
    );
    return result.lastId;
  }

  Future<int> update(int id, Map<String, Object?> patch) async {
    if (patch.isEmpty) return 0;
    final setClause = patch.keys.map((k) => '$k = ?').join(', ');
    final result = await _driver.run(
      'UPDATE booking_guests SET $setClause WHERE id = ?',
      [...patch.values, id],
    );
    return result.changes;
  }

  Future<int> delete(int id) async {
    final result = await _driver.run('DELETE FROM booking_guests WHERE id = ?', [id]);
    return result.changes;
  }

  Future<List<BookingGuest>> listAll() async {
    final rows = await _driver.query('SELECT $_columns FROM booking_guests ORDER BY id ASC', const []);
    return rows.map(BookingGuest.fromRow).toList();
  }

  Future<void> deleteAll() async {
    await _driver.run('DELETE FROM booking_guests', const []);
  }

  Future<void> insertRaw(BookingGuest guest) async {
    await _driver.run(
      '''
      INSERT INTO booking_guests (
        id, customer_id, name, phone, id_front_path, id_back_path,
        id_front_thumb_path, id_back_thumb_path, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ''',
      [
        guest.id > 0 ? guest.id : null,
        guest.customerId, guest.name, guest.phone, guest.idFrontPath, guest.idBackPath,
        guest.idFrontThumbPath, guest.idBackThumbPath, guest.createdAt, guest.updatedAt,
      ],
    );
  }
}
