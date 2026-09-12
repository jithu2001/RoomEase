import 'dart:io';
import 'dart:typed_data';

import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';

import '../utils/app_error.dart';

const dataRoot = 'hotel-data';
const customersRoot = '$dataRoot/customers';
const backupDir = 'backups';
const autoBackupDir = 'auto';

String customerDir(String code) => '$customersRoot/$code';
String guestDir(String code, int guestId) => '${customerDir(code)}/guests/$guestId';

class SharedFile {
  final String relativePath;
  final String name;
  final DateTime modifiedAt;
  final int bytes;
  const SharedFile({
    required this.relativePath,
    required this.name,
    required this.modifiedAt,
    required this.bytes,
  });
}

/// Stores files under two roots, matching the original app's split:
///  - private files (ID photos) live under an app-private directory, never
///    scanned by gallery apps or readable by other apps;
///  - shared files (backup .zip exports) live under app-specific external
///    storage, reachable via a file manager or USB without any runtime
///    permission, falling back to the private root if unavailable.
///
/// All paths passed in/out are *relative*; callers never see an absolute
/// filesystem path, so paths stay portable across devices (important for
/// backup/restore).
abstract class FileStore {
  Future<String> write(String path, Uint8List bytes);
  Future<Uint8List> read(String path);
  Future<bool> exists(String path);
  Future<void> remove(String path);
  Future<void> removeDir(String path);

  /// Resolves a relative private-root path to an absolute filesystem path,
  /// for handing to `File`/`Image.file` — null if the file doesn't exist.
  Future<String?> resolveForDisplay(String path);

  Future<({String path, String location})> writeShared(String fileName, Uint8List bytes, {String? folder});
  Future<List<SharedFile>> listShared({String? folder});
  Future<void> removeShared(String relativePath);
}

class DeviceFileStore implements FileStore {
  Directory? _privateRoot;
  Directory? _sharedRoot;
  final Set<String> _ensuredDirs = {};

  Future<Directory> _privateRootDir() async {
    return _privateRoot ??= await getApplicationDocumentsDirectory();
  }

  Future<Directory> _sharedRootDir() async {
    if (_sharedRoot != null) return _sharedRoot!;
    try {
      final external = await getExternalStorageDirectory();
      if (external != null) return _sharedRoot = external;
    } catch (_) {
      // Fall through to the private root below.
    }
    try {
      return _sharedRoot = await _privateRootDir();
    } catch (e) {
      throw AppError(AppErrorCode.backupFailed, 'No writable storage location was found for backups.', e);
    }
  }

  Future<void> _ensureParent(File file) async {
    final dir = file.parent;
    if (_ensuredDirs.contains(dir.path)) return;
    await dir.create(recursive: true);
    _ensuredDirs.add(dir.path);
  }

  @override
  Future<String> write(String path, Uint8List bytes) async {
    final root = await _privateRootDir();
    final file = File(p.join(root.path, path));
    await _ensureParent(file);
    await file.writeAsBytes(bytes, flush: true);
    return path;
  }

  @override
  Future<Uint8List> read(String path) async {
    final root = await _privateRootDir();
    final file = File(p.join(root.path, path));
    if (!await file.exists()) {
      throw AppError(AppErrorCode.missingFile, 'A stored file is missing on this device.');
    }
    return file.readAsBytes();
  }

  @override
  Future<bool> exists(String path) async {
    final root = await _privateRootDir();
    return File(p.join(root.path, path)).exists();
  }

  @override
  Future<void> remove(String path) async {
    final root = await _privateRootDir();
    final file = File(p.join(root.path, path));
    try {
      if (await file.exists()) await file.delete();
    } catch (_) {
      // Never throw for a file that's already gone or unreadable.
    }
  }

  @override
  Future<void> removeDir(String path) async {
    final root = await _privateRootDir();
    final dir = Directory(p.join(root.path, path));
    try {
      if (await dir.exists()) await dir.delete(recursive: true);
    } catch (_) {
      // Never throw — best-effort cleanup.
    }
  }

  @override
  Future<String?> resolveForDisplay(String path) async {
    if (path.isEmpty) return null;
    final root = await _privateRootDir();
    final file = File(p.join(root.path, path));
    return await file.exists() ? file.path : null;
  }

  @override
  Future<({String path, String location})> writeShared(String fileName, Uint8List bytes, {String? folder}) async {
    final root = await _sharedRootDir();
    final relativeDir = folder != null ? '$backupDir/$folder' : backupDir;
    final file = File(p.join(root.path, relativeDir, fileName));
    await file.parent.create(recursive: true);
    await file.writeAsBytes(bytes, flush: true);
    return (path: file.path, location: root.path);
  }

  @override
  Future<List<SharedFile>> listShared({String? folder}) async {
    try {
      final root = await _sharedRootDir();
      final relativeDir = folder != null ? '$backupDir/$folder' : backupDir;
      final dir = Directory(p.join(root.path, relativeDir));
      if (!await dir.exists()) return const [];
      final entries = <SharedFile>[];
      await for (final entity in dir.list()) {
        if (entity is! File) continue;
        final stat = await entity.stat();
        entries.add(SharedFile(
          relativePath: p.join(relativeDir, p.basename(entity.path)),
          name: p.basename(entity.path),
          modifiedAt: stat.modified,
          bytes: stat.size,
        ));
      }
      entries.sort((a, b) {
        final byDate = b.modifiedAt.compareTo(a.modifiedAt);
        return byDate != 0 ? byDate : b.name.compareTo(a.name);
      });
      return entries;
    } catch (_) {
      return const [];
    }
  }

  @override
  Future<void> removeShared(String relativePath) async {
    try {
      final root = await _sharedRootDir();
      final file = File(p.join(root.path, relativePath));
      if (await file.exists()) await file.delete();
    } catch (_) {
      // Best-effort.
    }
  }
}
