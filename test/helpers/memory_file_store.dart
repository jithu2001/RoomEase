import 'dart:typed_data';

import 'package:roomease/services/file_store.dart';

/// In-memory [FileStore] test double — mirrors the original test suite's
/// `MemoryFileStore`, so service-layer tests never touch real disk.
class MemoryFileStore implements FileStore {
  final Map<String, Uint8List> _private = {};
  final Map<String, ({Uint8List bytes, DateTime modifiedAt})> _shared = {};
  var _clock = 0;

  @override
  Future<String> write(String path, Uint8List bytes) async {
    _private[path] = bytes;
    return path;
  }

  @override
  Future<Uint8List> read(String path) async {
    final bytes = _private[path];
    if (bytes == null) {
      throw StateError('missing file: $path');
    }
    return bytes;
  }

  @override
  Future<bool> exists(String path) async => _private.containsKey(path);

  @override
  Future<void> remove(String path) async => _private.remove(path);

  @override
  Future<void> removeDir(String path) async {
    _private.removeWhere((key, _) => key == path || key.startsWith('$path/'));
  }

  @override
  Future<String?> resolveForDisplay(String path) async => _private.containsKey(path) ? path : null;

  @override
  Future<({String path, String location})> writeShared(String fileName, Uint8List bytes, {String? folder}) async {
    final relativePath = folder != null ? '$backupDir/$folder/$fileName' : '$backupDir/$fileName';
    _shared[relativePath] = (bytes: bytes, modifiedAt: DateTime.fromMillisecondsSinceEpoch(_clock++));
    return (path: relativePath, location: 'memory://backups');
  }

  @override
  Future<List<SharedFile>> listShared({String? folder}) async {
    final prefix = folder != null ? '$backupDir/$folder/' : '$backupDir/';
    final entries = _shared.entries.where((e) => e.key.startsWith(prefix) && !e.key.substring(prefix.length).contains('/'));
    final files = entries
        .map((e) => SharedFile(
              relativePath: e.key,
              name: e.key.substring(prefix.length),
              modifiedAt: e.value.modifiedAt,
              bytes: e.value.bytes.length,
            ))
        .toList();
    files.sort((a, b) {
      final byDate = b.modifiedAt.compareTo(a.modifiedAt);
      return byDate != 0 ? byDate : b.name.compareTo(a.name);
    });
    return files;
  }

  @override
  Future<void> removeShared(String relativePath) async => _shared.remove(relativePath);

  /// Test-only accessor.
  Uint8List? peekShared(String relativePath) => _shared[relativePath]?.bytes;
}
