import 'dart:convert';
import 'dart:typed_data';

import 'package:archive/archive.dart';

import '../database/repositories/booking_guest_repository.dart';
import '../database/repositories/customer_repository.dart';
import '../database/repositories/room_repository.dart';
import '../database/repositories/settings_repository.dart';
import '../database/sql_driver.dart';
import '../models/models.dart';
import '../utils/app_date.dart';
import '../utils/app_error.dart';
import '../utils/customer_code.dart';
import 'file_store.dart';

const backupFormat = 'hotel-customer-manager-backup';
const backupFormatVersion = 1;
/// Total embedded photo bytes cap per archive; export degrades to
/// data-only rather than fail outright once a device's photo library grows
/// past this.
const maxImageBytes = 200 * 1024 * 1024;
const _excludedSettings = {'pin_hash'};

class ArchiveCounts {
  final int customers;
  final int rooms;
  final int images;
  final int guests;
  const ArchiveCounts({required this.customers, required this.rooms, required this.images, required this.guests});
}

class ExportResult {
  final String fileName;
  final String path;
  final String location;
  final int bytes;
  final int customers;
  final int images;
  final List<String> warnings;
  const ExportResult({
    required this.fileName,
    required this.path,
    required this.location,
    required this.bytes,
    required this.customers,
    required this.images,
    required this.warnings,
  });
}

class RestoreSummary {
  final int customers;
  final int guests;
  final int rooms;
  final int images;
  final List<String> warnings;
  const RestoreSummary({
    required this.customers,
    required this.guests,
    required this.rooms,
    required this.images,
    required this.warnings,
  });
}

class BackupManifest {
  final String format;
  final int version;
  final int schemaVersion;
  final String createdAt;
  final bool includesImages;
  final ArchiveCounts counts;
  const BackupManifest({
    required this.format,
    required this.version,
    required this.schemaVersion,
    required this.createdAt,
    required this.includesImages,
    required this.counts,
  });
}

Map<String, Object?> _customerToJson(Customer c) => {
      'id': c.id,
      'customer_code': c.customerCode,
      'name': c.name,
      'address': c.address,
      'phone': c.phone,
      'room_number': c.roomNumber,
      'number_of_persons': c.numberOfPersons,
      'id_front_path': c.idFrontPath,
      'id_back_path': c.idBackPath,
      'check_in_date': c.checkInDate,
      'check_out_date': c.checkOutDate,
      'status': c.status.value,
      'created_at': c.createdAt,
      'updated_at': c.updatedAt,
      'id_front_thumb_path': c.idFrontThumbPath,
      'id_back_thumb_path': c.idBackThumbPath,
      'amount_minor': c.amountMinor,
    };

Map<String, Object?> _guestToJson(BookingGuest g) => {
      'id': g.id,
      'customer_id': g.customerId,
      'name': g.name,
      'phone': g.phone,
      'id_front_path': g.idFrontPath,
      'id_back_path': g.idBackPath,
      'id_front_thumb_path': g.idFrontThumbPath,
      'id_back_thumb_path': g.idBackThumbPath,
      'created_at': g.createdAt,
      'updated_at': g.updatedAt,
    };

final _safeImagePattern =
    RegExp(r'^images/(CUS-\d{6,})/(?:guests/(\d{1,12})/)?([A-Za-z0-9._-]+\.jpg)$');

class _SafeImageEntry {
  final String code;
  final String fileName;
  final int? guestId;
  const _SafeImageEntry({required this.code, required this.fileName, this.guestId});
}

_SafeImageEntry? _safeImageEntry(String path) {
  final m = _safeImagePattern.firstMatch(path);
  if (m == null) return null;
  final code = m.group(1)!;
  if (!isSafeCustomerCode(code)) return null;
  return _SafeImageEntry(
    code: code,
    fileName: m.group(3)!,
    guestId: m.group(2) != null ? int.tryParse(m.group(2)!) : null,
  );
}

/// Export/import of the local backup `.zip`. Mirrors `src/services/backupService.ts`.
class BackupService {
  final SqlDriver _db;
  final CustomerRepository _customers;
  final BookingGuestRepository _guests;
  final RoomRepository _rooms;
  final SettingsRepository _settings;
  final FileStore _files;

  BackupService(this._db, this._customers, this._guests, this._rooms, this._settings, this._files);

  Future<int> _schemaVersion() => scalar<int>(_db, 'PRAGMA user_version', const [], 0);

  Future<({Uint8List bytes, ArchiveCounts counts, List<String> warnings})> buildArchive({bool includeImages = true}) async {
    final results = await Future.wait([
      _customers.listAll(),
      _guests.listAll(),
      _rooms.list(),
      _settings.getAll(),
      _schemaVersion(),
    ]);
    final customers = results[0] as List<Customer>;
    final guests = results[1] as List<BookingGuest>;
    final rooms = results[2] as List<Room>;
    final settings = Map<String, String>.from(results[3] as Map);
    final schemaVersion = results[4] as int;

    for (final key in _excludedSettings) {
      settings.remove(key);
    }

    final payload = {
      'customers': customers.map(_customerToJson).toList(),
      'guests': guests.map(_guestToJson).toList(),
      'rooms': rooms.map((r) => {'room_number': r.roomNumber, 'created_at': r.createdAt}).toList(),
      'settings': settings,
    };

    final archive = Archive();
    final warnings = <String>[];
    var imageBytesTotal = 0;
    var imageCount = 0;

    if (includeImages) {
      final codeById = {for (final c in customers) c.id: c.customerCode};

      // e.g. 'hotel-data/customers/CUS-000001/id-front.jpg' -> 'images/CUS-000001/id-front.jpg'
      String archivePathFor(String storedPath) =>
          'images/${storedPath.startsWith('$customersRoot/') ? storedPath.substring(customersRoot.length + 1) : storedPath}';

      Future<void> addImage(String path) async {
        if (path.isEmpty) return;
        try {
          final bytes = await _files.read(path);
          imageBytesTotal += bytes.length;
          if (imageBytesTotal > maxImageBytes) {
            throw const AppError(
              AppErrorCode.backupFailed,
              'The ID photos on this device are too large to include in one backup. Try '
              '"Export data only" instead, and copy the hotel-data folder manually.',
            );
          }
          archive.addFile(ArchiveFile.bytes(archivePathFor(path), bytes)..compression = CompressionType.none);
          imageCount++;
        } on AppError {
          rethrow;
        } catch (_) {
          warnings.add('A stored ID photo could not be read and was skipped.');
        }
      }

      for (final c in customers) {
        await addImage(c.idFrontPath);
        await addImage(c.idBackPath);
        if (c.idFrontThumbPath != null) await addImage(c.idFrontThumbPath!);
        if (c.idBackThumbPath != null) await addImage(c.idBackThumbPath!);
      }
      for (final g in guests) {
        final code = codeById[g.customerId];
        if (code == null) continue;
        if (g.idFrontPath != null) await addImage(g.idFrontPath!);
        if (g.idBackPath != null) await addImage(g.idBackPath!);
        if (g.idFrontThumbPath != null) await addImage(g.idFrontThumbPath!);
        if (g.idBackThumbPath != null) await addImage(g.idBackThumbPath!);
      }
    }

    final counts = ArchiveCounts(customers: customers.length, rooms: rooms.length, images: imageCount, guests: guests.length);
    final manifest = {
      'format': backupFormat,
      'version': backupFormatVersion,
      'schema_version': schemaVersion,
      'created_at': nowIso(),
      'includes_images': includeImages,
      'counts': {'customers': counts.customers, 'rooms': counts.rooms, 'images': counts.images, 'guests': counts.guests},
    };

    archive.addFile(ArchiveFile.bytes('manifest.json', utf8.encode(jsonEncode(manifest))));
    archive.addFile(ArchiveFile.bytes('data.json', utf8.encode(jsonEncode(payload))));

    late final Uint8List bytes;
    try {
      bytes = ZipEncoder().encodeBytes(archive);
    } catch (e) {
      throw AppError(AppErrorCode.backupFailed, 'The backup archive could not be created.', e);
    }
    return (bytes: bytes, counts: counts, warnings: warnings);
  }

  Future<ExportResult> exportBackup({bool includeImages = true}) async {
    final built = await buildArchive(includeImages: includeImages);
    final fileName = 'hotel-backup-${backupStamp(DateTime.now())}${includeImages ? '' : '-data-only'}.zip';
    final written = await _files.writeShared(fileName, built.bytes);
    await _settings.set('last_backup_at', nowIso());
    return ExportResult(
      fileName: fileName,
      path: written.path,
      location: written.location,
      bytes: built.bytes.length,
      customers: built.counts.customers,
      images: built.counts.images,
      warnings: built.warnings,
    );
  }

  Archive _unzip(Uint8List bytes) {
    if (bytes.isEmpty) {
      throw const AppError(AppErrorCode.corruptBackup, 'That backup file is empty.');
    }
    if (bytes.length < 2 || bytes[0] != 0x50 || bytes[1] != 0x4B) {
      throw const AppError(AppErrorCode.corruptBackup, 'That file is not a hotel backup archive.');
    }
    try {
      return ZipDecoder().decodeBytes(bytes);
    } catch (e) {
      throw AppError(AppErrorCode.corruptBackup, 'That backup archive could not be read.', e);
    }
  }

  ({BackupManifest manifest, Map<String, Object?> payload}) _readPayload(Archive archive) {
    final manifestFile = archive.find('manifest.json');
    final dataFile = archive.find('data.json');
    if (manifestFile == null || dataFile == null) {
      throw const AppError(AppErrorCode.corruptBackup, 'That backup archive is missing required files.');
    }
    late final Map<String, Object?> manifestJson;
    late final Map<String, Object?> payload;
    try {
      manifestJson = jsonDecode(utf8.decode(manifestFile.content)) as Map<String, Object?>;
      payload = jsonDecode(utf8.decode(dataFile.content)) as Map<String, Object?>;
    } catch (e) {
      throw AppError(AppErrorCode.corruptBackup, 'That backup archive could not be read.', e);
    }
    if (manifestJson['format'] != backupFormat) {
      throw const AppError(AppErrorCode.corruptBackup, 'That file is not a hotel backup archive.');
    }
    final version = manifestJson['version'];
    if (version is! int || version > backupFormatVersion) {
      throw const AppError(
        AppErrorCode.corruptBackup,
        'This backup was made by a newer version of the app. Please update the app first.',
      );
    }
    if (payload['customers'] is! List || payload['rooms'] is! List) {
      throw const AppError(AppErrorCode.corruptBackup, 'That backup archive is missing required data.');
    }
    final countsJson = (manifestJson['counts'] as Map?)?.cast<String, Object?>() ?? const {};
    final manifest = BackupManifest(
      format: manifestJson['format'] as String,
      version: version,
      schemaVersion: (manifestJson['schema_version'] as num?)?.toInt() ?? 0,
      createdAt: manifestJson['created_at'] as String? ?? '',
      includesImages: manifestJson['includes_images'] as bool? ?? false,
      counts: ArchiveCounts(
        customers: (countsJson['customers'] as num?)?.toInt() ?? 0,
        rooms: (countsJson['rooms'] as num?)?.toInt() ?? 0,
        images: (countsJson['images'] as num?)?.toInt() ?? 0,
        guests: (countsJson['guests'] as num?)?.toInt() ?? 0,
      ),
    );
    return (manifest: manifest, payload: payload);
  }

  /// Read-only validation, for a "preview before restore" confirmation UI.
  Future<BackupManifest> inspect(Uint8List bytes) async {
    return _readPayload(_unzip(bytes)).manifest;
  }

  String? _describeCustomerProblem(Object? raw) {
    if (raw is! Map) return 'not an object';
    final code = raw['customer_code'];
    if (code is! String || !isSafeCustomerCode(code)) return 'invalid customer code';
    if (raw['name'] is! String || (raw['name'] as String).isEmpty) return 'missing name';
    if (raw['room_number'] is! String || (raw['room_number'] as String).isEmpty) return 'missing room number';
    if (raw['check_in_date'] is! String || (raw['check_in_date'] as String).isEmpty) return 'missing check-in date';
    if (CustomerStatus.tryFromValue(raw['status'] as String? ?? '') == null) return 'invalid status';
    return null;
  }

  String? _describeGuestProblem(Object? raw, Set<int> validCustomerIds) {
    if (raw is! Map) return 'not an object';
    if (raw['name'] is! String || (raw['name'] as String).isEmpty) return 'missing name';
    final customerId = raw['customer_id'];
    if (customerId is! num || !validCustomerIds.contains(customerId.toInt())) return 'its booking was not restored';
    return null;
  }

  int? _normaliseAmount(Object? value) {
    if (value == null) return null;
    if (value is String && value.trim().isEmpty) return null;
    final n = value is num ? value : num.tryParse(value.toString());
    if (n == null) return null;
    final intValue = n.toInt();
    if (intValue != n || intValue < 0) return null;
    return intValue;
  }

  Customer _normaliseRestoredCustomer(Map raw) {
    final code = raw['customer_code'] as String;
    final id = raw['id'];
    final numericId = id is num && id.toInt() > 0 ? id.toInt() : 0;
    final checkInDate = raw['check_in_date'] as String;
    final createdAt = (raw['created_at'] as String?)?.isNotEmpty == true ? raw['created_at'] as String : checkInDate;
    final updatedAt = (raw['updated_at'] as String?)?.isNotEmpty == true ? raw['updated_at'] as String : checkInDate;
    final persons = (raw['number_of_persons'] is num && (raw['number_of_persons'] as num) > 0)
        ? (raw['number_of_persons'] as num).toInt()
        : 1;
    return Customer(
      id: numericId,
      customerCode: code,
      name: (raw['name'] as String).trim(),
      address: ((raw['address'] as String?) ?? '').trim(),
      phone: ((raw['phone'] as String?) ?? '').trim(),
      roomNumber: (raw['room_number'] as String).trim(),
      numberOfPersons: persons,
      idFrontPath: '${customerDir(code)}/id-front.jpg',
      idBackPath: '${customerDir(code)}/id-back.jpg',
      checkInDate: checkInDate,
      checkOutDate: raw['check_out_date'] as String?,
      status: CustomerStatus.fromValue(raw['status'] as String),
      createdAt: createdAt,
      updatedAt: updatedAt,
      idFrontThumbPath: '${customerDir(code)}/id-front-thumb.jpg',
      idBackThumbPath: '${customerDir(code)}/id-back-thumb.jpg',
      amountMinor: _normaliseAmount(raw['amount_minor']),
    );
  }

  BookingGuest _normaliseRestoredGuest(Map raw, String customerCode) {
    final id = raw['id'];
    final numericId = id is num && id.toInt() > 0 ? id.toInt() : 0;
    // Guest ids are AUTOINCREMENT and always >0 once a guest has ever been
    // saved, so a valid backup's photo folder (images/<code>/guests/<id>/...)
    // always matches the id preserved by insertRaw below.
    final guestIdForPath = numericId;
    final hasFront = raw['id_front_path'] != null;
    final hasBack = raw['id_back_path'] != null;
    final now = nowIso();
    final phone = (raw['phone'] as String?)?.trim();
    return BookingGuest(
      id: numericId,
      customerId: (raw['customer_id'] as num).toInt(),
      name: (raw['name'] as String).trim(),
      phone: phone == null || phone.isEmpty ? null : phone,
      idFrontPath: hasFront ? '${guestDir(customerCode, guestIdForPath)}/id-front.jpg' : null,
      idBackPath: hasBack ? '${guestDir(customerCode, guestIdForPath)}/id-back.jpg' : null,
      idFrontThumbPath: hasFront ? '${guestDir(customerCode, guestIdForPath)}/id-front-thumb.jpg' : null,
      idBackThumbPath: hasBack ? '${guestDir(customerCode, guestIdForPath)}/id-back-thumb.jpg' : null,
      createdAt: (raw['created_at'] as String?)?.isNotEmpty == true ? raw['created_at'] as String : now,
      updatedAt: (raw['updated_at'] as String?)?.isNotEmpty == true ? raw['updated_at'] as String : now,
    );
  }

  Future<RestoreSummary> restoreBackup(Uint8List bytes) async {
    final archive = _unzip(bytes);
    final read = _readPayload(archive);
    final payload = read.payload;
    final warnings = <String>[];

    final rawCustomers = (payload['customers'] as List).cast<Object?>();
    final keptCustomers = <Customer>[];
    for (final raw in rawCustomers) {
      final problem = _describeCustomerProblem(raw);
      if (problem != null) {
        warnings.add('Skipped a customer record ($problem).');
        continue;
      }
      keptCustomers.add(_normaliseRestoredCustomer(raw as Map));
    }

    // Dedupe active rooms: only one CHECKED_IN customer per room can survive
    // the DB's own partial unique index.
    final seenActiveRooms = <String>{};
    final dedupedCustomers = <Customer>[];
    for (final c in keptCustomers) {
      if (c.status == CustomerStatus.checkedIn) {
        if (seenActiveRooms.contains(c.roomNumber)) {
          warnings.add('Two active bookings shared room ${c.roomNumber}; the older one was marked checked out.');
          dedupedCustomers.add(Customer(
            id: c.id, customerCode: c.customerCode, name: c.name, address: c.address, phone: c.phone,
            roomNumber: c.roomNumber, numberOfPersons: c.numberOfPersons, idFrontPath: c.idFrontPath,
            idBackPath: c.idBackPath, checkInDate: c.checkInDate, checkOutDate: c.checkOutDate ?? c.updatedAt,
            status: CustomerStatus.checkedOut, createdAt: c.createdAt, updatedAt: c.updatedAt,
            idFrontThumbPath: c.idFrontThumbPath, idBackThumbPath: c.idBackThumbPath, amountMinor: c.amountMinor,
          ));
          continue;
        }
        seenActiveRooms.add(c.roomNumber);
      }
      dedupedCustomers.add(c);
    }

    final validCustomerIds = dedupedCustomers.map((c) => c.id).where((id) => id > 0).toSet();
    final codeById = {for (final c in dedupedCustomers.where((c) => c.id > 0)) c.id: c.customerCode};

    final rawGuests = ((payload['guests'] as List?) ?? const []).cast<Object?>();
    final keptGuests = <BookingGuest>[];
    for (final raw in rawGuests) {
      final problem = _describeGuestProblem(raw, validCustomerIds);
      if (problem != null) {
        warnings.add('Skipped a guest record ($problem).');
        continue;
      }
      final map = raw as Map;
      final code = codeById[(map['customer_id'] as num).toInt()]!;
      keptGuests.add(_normaliseRestoredGuest(map, code));
    }

    final roomNumbers = <String>{
      ...((payload['rooms'] as List).cast<Map>().map((r) => r['room_number'] as String)),
      ...dedupedCustomers.where((c) => c.status == CustomerStatus.checkedIn).map((c) => c.roomNumber),
    };
    final roomsCreatedAt = {
      for (final r in (payload['rooms'] as List).cast<Map>()) r['room_number'] as String: r['created_at'] as String? ?? nowIso(),
    };

    final settingsPayload = ((payload['settings'] as Map?) ?? const {}).cast<String, Object?>();

    try {
      await _db.transaction((txn) async {
        final customersRepo = CustomerRepository(txn);
        final guestsRepo = BookingGuestRepository(txn);
        final roomsRepo = RoomRepository(txn);
        final settingsRepo = SettingsRepository(txn);

        await guestsRepo.deleteAll();
        await customersRepo.deleteAll();
        await roomsRepo.deleteAll();

        for (final roomNumber in roomNumbers) {
          await roomsRepo.insert(roomNumber, roomsCreatedAt[roomNumber] ?? nowIso());
        }
        for (final customer in dedupedCustomers) {
          await customersRepo.insertRaw(customer);
        }
        for (final guest in keptGuests) {
          await guestsRepo.insertRaw(guest);
        }
        for (final entry in settingsPayload.entries) {
          if (_excludedSettings.contains(entry.key)) continue;
          await settingsRepo.set(entry.key, entry.value?.toString() ?? '');
        }
      });
    } catch (e) {
      throw AppError(
        AppErrorCode.restoreFailed,
        'The backup could not be restored. Your existing data has been left unchanged.',
        e,
      );
    }

    // Image restore is best-effort and happens outside the DB transaction.
    var imageCount = 0;
    try {
      await _files.removeDir(customersRoot);
    } catch (_) {
      // Logged elsewhere; never block restore on cleanup failure.
    }
    for (final file in archive.files) {
      if (!file.isFile || !file.name.startsWith('images/')) continue;
      final entry = _safeImageEntry(file.name);
      if (entry == null) {
        warnings.add('Skipped an unexpected file in the archive.');
        continue;
      }
      final targetDir = entry.guestId != null ? guestDir(entry.code, entry.guestId!) : customerDir(entry.code);
      try {
        await _files.write('$targetDir/${entry.fileName}', file.content);
        imageCount++;
      } catch (_) {
        warnings.add('An ID photo could not be restored.');
      }
    }

    await _db.persist();
    return RestoreSummary(
      customers: dedupedCustomers.length,
      guests: keptGuests.length,
      rooms: roomNumbers.length,
      images: imageCount,
      warnings: warnings,
    );
  }
}
