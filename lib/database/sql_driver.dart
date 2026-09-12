import 'package:sqflite_common/sqlite_api.dart';

import '../utils/app_error.dart';

class RunResult {
  final int changes;
  final int lastId;
  const RunResult({required this.changes, required this.lastId});
}

/// Thin wrapper around a `sqflite` [DatabaseExecutor] (either the top-level
/// [Database] or a [Transaction]) that mirrors the original app's
/// `SqlDriver` seam (`src/database/driver.ts`): consistent [AppError]
/// wrapping, and a [transaction] that *joins* an already-open transaction
/// instead of nesting (sqflite, like the original's native SQLite plugin,
/// has no real nested-transaction support).
class SqlDriver {
  final DatabaseExecutor _executor;
  final bool _isTransaction;

  // ignore: prefer_initializing_formals
  SqlDriver(this._executor, {bool isTransaction = false}) : _isTransaction = isTransaction;

  /// One DDL/PRAGMA statement — never a multi-statement script.
  Future<void> execute(String sql, [List<Object?> params = const []]) async {
    try {
      await _executor.execute(sql, params);
    } catch (e) {
      throw AppError(AppErrorCode.dbQuery, 'The database could not complete that change.', e);
    }
  }

  /// INSERT / UPDATE / DELETE.
  Future<RunResult> run(String sql, [List<Object?> params = const []]) async {
    final trimmed = sql.trimLeft().toUpperCase();
    try {
      if (trimmed.startsWith('INSERT')) {
        final id = await _executor.rawInsert(sql, params);
        return RunResult(changes: 1, lastId: id);
      }
      if (trimmed.startsWith('UPDATE')) {
        final changes = await _executor.rawUpdate(sql, params);
        return RunResult(changes: changes, lastId: 0);
      }
      if (trimmed.startsWith('DELETE')) {
        final changes = await _executor.rawDelete(sql, params);
        return RunResult(changes: changes, lastId: 0);
      }
      await _executor.execute(sql, params);
      return const RunResult(changes: 0, lastId: 0);
    } catch (e) {
      throw AppError(AppErrorCode.dbQuery, 'The database could not complete that change.', e);
    }
  }

  /// SELECT.
  Future<List<Map<String, Object?>>> query(String sql, [List<Object?> params = const []]) async {
    try {
      return await _executor.rawQuery(sql, params);
    } catch (e) {
      throw AppError(AppErrorCode.dbQuery, 'The database could not be read.', e);
    }
  }

  /// Runs [action] inside a transaction, rolling back on any thrown error.
  /// If this driver already represents an open transaction, [action] just
  /// joins it (no nested BEGIN).
  Future<T> transaction<T>(Future<T> Function(SqlDriver driver) action) async {
    if (_isTransaction) return action(this);
    final executor = _executor;
    if (executor is! Database) {
      // Already inside a Transaction wrapper that wasn't flagged — join it.
      return action(this);
    }
    try {
      return await executor.transaction((txn) => action(SqlDriver(txn, isTransaction: true)));
    } catch (e) {
      if (e is AppError) rethrow;
      throw AppError(AppErrorCode.dbQuery, 'The database change could not be saved.', e);
    }
  }

  /// No-op: sqflite writes are immediate, unlike the web (IndexedDB-backed)
  /// fallback the original app also had to support.
  Future<void> persist() async {}

  Future<void> close() async {
    final executor = _executor;
    if (executor is Database) await executor.close();
  }
}

/// Reads the first column of the first row, or [fallback] if there are no rows.
Future<T> scalar<T>(SqlDriver driver, String sql, List<Object?> params, T fallback) async {
  final rows = await driver.query(sql, params);
  if (rows.isEmpty) return fallback;
  final value = rows.first.values.first;
  return (value as T?) ?? fallback;
}
