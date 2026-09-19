import '../../models/models.dart';
import '../sql_driver.dart';

const _columns = '''
  id, customer_code, name, address, phone, room_number, number_of_persons,
  id_front_path, id_back_path, check_in_date, check_out_date, status,
  created_at, updated_at, id_front_thumb_path, id_back_thumb_path, amount_minor
''';

/// Escapes `\`, `%` and `_` for a `LIKE ... ESCAPE '\'` pattern.
String escapeLike(String term) =>
    term.replaceAll(r'\', r'\\').replaceAll('%', r'\%').replaceAll('_', r'\_');

class NewCustomerRow {
  final String customerCode;
  final String name;
  final String address;
  final String phone;
  final String roomNumber;
  final int numberOfPersons;
  final String idFrontPath;
  final String idBackPath;
  final String checkInDate;
  final String createdAt;
  final String updatedAt;
  final String? idFrontThumbPath;
  final String? idBackThumbPath;
  final int? amountMinor;

  const NewCustomerRow({
    required this.customerCode,
    required this.name,
    required this.address,
    required this.phone,
    required this.roomNumber,
    required this.numberOfPersons,
    required this.idFrontPath,
    required this.idBackPath,
    required this.checkInDate,
    required this.createdAt,
    required this.updatedAt,
    this.idFrontThumbPath,
    this.idBackThumbPath,
    this.amountMinor,
  });
}

/// A `WHERE` clause plus its bound parameters.
class _Where {
  final String clause;
  final List<Object?> params;
  const _Where(this.clause, this.params);
}

_Where _buildCustomerWhere(CustomerQuery query) {
  final clauses = <String>[];
  final params = <Object?>[];
  if (query.filter != CustomerFilter.all) {
    clauses.add('status = ?');
    params.add(query.filter.value);
  }
  final search = query.search?.trim();
  if (search != null && search.isNotEmpty) {
    final pattern = '%${escapeLike(search)}%';
    clauses.add('''(
      name LIKE ? ESCAPE '\\' OR
      phone LIKE ? ESCAPE '\\' OR
      room_number LIKE ? ESCAPE '\\' OR
      customer_code LIKE ? ESCAPE '\\' OR
      EXISTS (SELECT 1 FROM booking_guests g WHERE g.customer_id = customers.id AND g.name LIKE ? ESCAPE '\\')
    )''');
    params.addAll([pattern, pattern, pattern, pattern, pattern]);
  }
  if (clauses.isEmpty) return const _Where('', []);
  return _Where('WHERE ${clauses.join(' AND ')}', params);
}

class CustomerRepository {
  final SqlDriver _driver;
  CustomerRepository(this._driver);

  Future<int> insert(NewCustomerRow row) async {
    final result = await _driver.run(
      '''
      INSERT INTO customers (
        customer_code, name, address, phone, room_number, number_of_persons,
        id_front_path, id_back_path, check_in_date, check_out_date, status,
        created_at, updated_at, id_front_thumb_path, id_back_thumb_path, amount_minor
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 'CHECKED_IN', ?, ?, ?, ?, ?)
      ''',
      [
        row.customerCode, row.name, row.address, row.phone, row.roomNumber,
        row.numberOfPersons, row.idFrontPath, row.idBackPath, row.checkInDate,
        row.createdAt, row.updatedAt, row.idFrontThumbPath, row.idBackThumbPath, row.amountMinor,
      ],
    );
    return result.lastId;
  }

  Future<Customer?> findById(int id) async {
    final rows = await _driver.query('SELECT $_columns FROM customers WHERE id = ?', [id]);
    return rows.isEmpty ? null : Customer.fromRow(rows.first);
  }

  Future<List<Customer>> list(CustomerQuery query) async {
    final where = _buildCustomerWhere(query);
    final rows = await _driver.query(
      'SELECT $_columns FROM customers ${where.clause} ORDER BY check_in_date DESC, id DESC LIMIT ? OFFSET ?',
      [...where.params, query.limit, query.offset],
    );
    return rows.map(Customer.fromRow).toList();
  }

  Future<int> count(CustomerQuery query) async {
    final where = _buildCustomerWhere(query);
    final rows = await _driver.query('SELECT COUNT(*) AS c FROM customers ${where.clause}', where.params);
    return rows.first['c'] as int;
  }

  Future<List<Customer>> listAll() async {
    final rows = await _driver.query('SELECT $_columns FROM customers ORDER BY id ASC', const []);
    return rows.map(Customer.fromRow).toList();
  }

  /// Only non-null-key entries are applied; returns 0 (no query run) if [patch] is empty.
  Future<int> update(int id, Map<String, Object?> patch) async {
    if (patch.isEmpty) return 0;
    final setClause = patch.keys.map((k) => '$k = ?').join(', ');
    final result = await _driver.run(
      'UPDATE customers SET $setClause WHERE id = ?',
      [...patch.values, id],
    );
    return result.changes;
  }

  /// Guarded update: only checks out a customer that is currently checked in.
  /// Returns changed-row count (0 = already checked out elsewhere — a race).
  Future<int> checkOut(int id, String checkOutDate, String updatedAt) async {
    final result = await _driver.run(
      "UPDATE customers SET status = 'CHECKED_OUT', check_out_date = ?, updated_at = ? "
      "WHERE id = ? AND status = 'CHECKED_IN'",
      [checkOutDate, updatedAt, id],
    );
    return result.changes;
  }

  Future<int> delete(int id) async {
    final result = await _driver.run('DELETE FROM customers WHERE id = ?', [id]);
    return result.changes;
  }

  Future<void> deleteAll() async {
    await _driver.run('DELETE FROM customers', const []);
  }

  /// Length-then-lexicographic order correctly handles codes that have grown
  /// past 6 digits.
  Future<String?> highestCustomerCode() async {
    final rows = await _driver.query(
      "SELECT customer_code FROM customers WHERE customer_code LIKE 'CUS-%' "
      "ORDER BY LENGTH(customer_code) DESC, customer_code DESC LIMIT 1",
      const [],
    );
    return rows.isEmpty ? null : rows.first['customer_code'] as String;
  }

  Future<Customer?> activeByRoom(String roomNumber) async {
    final rows = await _driver.query(
      "SELECT $_columns FROM customers WHERE room_number = ? AND status = 'CHECKED_IN' LIMIT 1",
      [roomNumber],
    );
    return rows.isEmpty ? null : Customer.fromRow(rows.first);
  }

  Future<List<Customer>> listActive() async {
    final rows = await _driver.query(
      "SELECT $_columns FROM customers WHERE status = 'CHECKED_IN' ORDER BY check_in_date DESC, id DESC",
      const [],
    );
    return rows.map(Customer.fromRow).toList();
  }

  Future<int> countActive() async {
    final rows = await _driver.query("SELECT COUNT(*) AS c FROM customers WHERE status = 'CHECKED_IN'", const []);
    return rows.first['c'] as int;
  }

  Future<int> sumActivePersons() async {
    final rows = await _driver.query(
      "SELECT COALESCE(SUM(number_of_persons), 0) AS s FROM customers WHERE status = 'CHECKED_IN'",
      const [],
    );
    return rows.first['s'] as int;
  }

  Future<int> countCheckInsOn(String dayKey) async {
    final rows = await _driver.query(
      'SELECT COUNT(*) AS c FROM customers WHERE substr(check_in_date, 1, 10) = ?',
      [dayKey],
    );
    return rows.first['c'] as int;
  }

  Future<int> countCheckOutsOn(String dayKey) async {
    final rows = await _driver.query(
      'SELECT COUNT(*) AS c FROM customers WHERE substr(check_out_date, 1, 10) = ?',
      [dayKey],
    );
    return rows.first['c'] as int;
  }

  /// Sum of `amount_minor` (paise) across bookings checked in during
  /// [monthKey] ('YYYY-MM'). Null amounts (not recorded) don't count.
  Future<int> sumAmountMinorForMonth(String monthKey) async {
    final rows = await _driver.query(
      "SELECT COALESCE(SUM(amount_minor), 0) AS s FROM customers WHERE substr(check_in_date, 1, 7) = ?",
      [monthKey],
    );
    return rows.first['s'] as int;
  }

  Future<int> countCheckInsForMonth(String monthKey) async {
    final rows = await _driver.query(
      'SELECT COUNT(*) AS c FROM customers WHERE substr(check_in_date, 1, 7) = ?',
      [monthKey],
    );
    return rows.first['c'] as int;
  }

  /// Of the bookings checked in during [monthKey], how many have an amount
  /// recorded at all (amount is optional per booking).
  Future<int> countAmountRecordedForMonth(String monthKey) async {
    final rows = await _driver.query(
      'SELECT COUNT(*) AS c FROM customers WHERE substr(check_in_date, 1, 7) = ? AND amount_minor IS NOT NULL',
      [monthKey],
    );
    return rows.first['c'] as int;
  }

  /// Everyone whose stay covers [dayKey] — inclusive of arrivals and
  /// departures on that same day, and anyone still staying.
  Future<List<Customer>> listStayingOn(String dayKey) async {
    final rows = await _driver.query(
      '''
      SELECT $_columns FROM customers
      WHERE substr(check_in_date, 1, 10) <= ?
        AND (check_out_date IS NULL OR substr(check_out_date, 1, 10) >= ?)
      ORDER BY
        (CASE WHEN room_number GLOB '[0-9]*' THEN 0 ELSE 1 END),
        CAST(room_number AS INTEGER),
        room_number,
        check_in_date
      ''',
      [dayKey, dayKey],
    );
    return rows.map(Customer.fromRow).toList();
  }

  /// Room number -> {customer_code, name} for every checked-in customer.
  Future<Map<String, ({String customerCode, String name})>> occupancyMap() async {
    final rows = await _driver.query(
      "SELECT room_number, customer_code, name FROM customers WHERE status = 'CHECKED_IN'",
      const [],
    );
    return {
      for (final row in rows)
        row['room_number'] as String: (customerCode: row['customer_code'] as String, name: row['name'] as String),
    };
  }

  /// Restore support: inserts with an explicit id (or lets SQLite assign one
  /// when [customer.id] isn't a positive integer).
  Future<void> insertRaw(Customer customer) async {
    await _driver.run(
      '''
      INSERT INTO customers (
        id, customer_code, name, address, phone, room_number, number_of_persons,
        id_front_path, id_back_path, check_in_date, check_out_date, status,
        created_at, updated_at, id_front_thumb_path, id_back_thumb_path, amount_minor
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ''',
      [
        customer.id > 0 ? customer.id : null,
        customer.customerCode, customer.name, customer.address, customer.phone,
        customer.roomNumber, customer.numberOfPersons, customer.idFrontPath, customer.idBackPath,
        customer.checkInDate, customer.checkOutDate, customer.status.value,
        customer.createdAt, customer.updatedAt, customer.idFrontThumbPath, customer.idBackThumbPath,
        customer.amountMinor,
      ],
    );
  }

  /// Returning-guest lookup by phone or name: one row per distinct phone
  /// number, holding that phone's most recent stay. Uses a correlated
  /// `NOT EXISTS` (rather than `MAX()` or a window function) to pick a single
  /// deterministic "latest" row per phone even when two stays share a
  /// check-in timestamp — and to stay compatible with the older SQLite
  /// builds some Android 8/9 devices still ship.
  Future<List<GuestMatch>> findGuestsByPhoneOrName(String term, {int limit = 8}) async {
    final pattern = '%${escapeLike(term)}%';
    final rows = await _driver.query(
      '''
      SELECT
        m.id AS customer_id, m.customer_code, m.name, m.address, m.phone,
        m.check_in_date AS last_stay, m.id_front_path, m.id_back_path,
        (SELECT COUNT(*) FROM customers t WHERE t.phone = m.phone) AS stay_count
      FROM customers m
      WHERE (m.name LIKE ? ESCAPE '\\' OR m.phone LIKE ? ESCAPE '\\')
        AND NOT EXISTS (
          SELECT 1 FROM customers m2
          WHERE m2.phone = m.phone
            AND (
              m2.check_in_date > m.check_in_date
              OR (m2.check_in_date = m.check_in_date AND m2.id > m.id)
            )
        )
      ORDER BY last_stay DESC, customer_id DESC
      LIMIT ?
      ''',
      [pattern, pattern, limit],
    );
    return rows
        .map((row) => GuestMatch(
              customerId: row['customer_id'] as int,
              customerCode: row['customer_code'] as String,
              name: row['name'] as String,
              address: row['address'] as String,
              phone: row['phone'] as String,
              stayCount: row['stay_count'] as int,
              lastStay: row['last_stay'] as String,
              hasIdPhotos: (row['id_front_path'] as String?)?.isNotEmpty == true &&
                  (row['id_back_path'] as String?)?.isNotEmpty == true,
              idFrontPath: (row['id_front_path'] as String?) ?? '',
              idBackPath: (row['id_back_path'] as String?) ?? '',
            ))
        .toList();
  }
}
