import '../database/repositories/customer_repository.dart';
import '../database/repositories/room_repository.dart';
import '../models/models.dart';
import '../utils/app_date.dart';
import '../utils/app_error.dart';
import '../utils/validation.dart';

class RoomService {
  final RoomRepository _rooms;
  final CustomerRepository _customers;
  RoomService(this._rooms, this._customers);

  Future<List<Room>> list() => _rooms.list();

  Future<List<RoomStatus>> listStatus() async {
    final results = await Future.wait([_rooms.list(), _customers.occupancyMap()]);
    final rooms = results[0] as List<Room>;
    final occupancy = results[1] as Map<String, ({String customerCode, String name})>;
    return rooms
        .map((room) {
          final occupant = occupancy[room.roomNumber];
          return RoomStatus(
            roomNumber: room.roomNumber,
            occupied: occupant != null,
            customerCode: occupant?.customerCode,
            customerName: occupant?.name,
          );
        })
        .toList();
  }

  /// Unoccupied rooms, plus [keepRoom] even if occupied — lets an edit form
  /// keep showing the record's own current room as selectable.
  Future<List<RoomStatus>> listAvailable({String? keepRoom}) async {
    final statuses = await listStatus();
    return statuses.where((r) => !r.occupied || r.roomNumber == keepRoom).toList();
  }

  Future<bool> isAvailable(String roomNumber, {int? excludeCustomerId}) async {
    final active = await _customers.activeByRoom(roomNumber);
    return active == null || active.id == excludeCustomerId;
  }

  Future<void> assertAssignable(String roomNumber, {int? excludeCustomerId}) async {
    if (!await _rooms.exists(roomNumber)) {
      throw AppError(AppErrorCode.roomUnknown, 'Room $roomNumber does not exist.');
    }
    final active = await _customers.activeByRoom(roomNumber);
    if (active != null && active.id != excludeCustomerId) {
      throw AppError(AppErrorCode.roomOccupied, 'Room $roomNumber is already occupied.');
    }
  }

  Future<Room> add(String roomNumber) async {
    final trimmed = roomNumber.trim();
    final existing = await _rooms.listNumbers();
    final error = validateNewRoomNumber(trimmed, existing);
    if (error != null) {
      final code = error.contains('already exists') ? AppErrorCode.duplicateRoom : AppErrorCode.validation;
      throw AppError(code, error);
    }
    await _rooms.insert(trimmed, nowIso());
    final rooms = await _rooms.list();
    final created = rooms.where((r) => r.roomNumber == trimmed).firstOrNull;
    if (created == null) {
      throw const AppError(AppErrorCode.dbQuery, 'The room could not be added.');
    }
    return created;
  }

  Future<void> remove(String roomNumber) async {
    final active = await _customers.activeByRoom(roomNumber);
    if (active != null) {
      throw AppError(AppErrorCode.roomInUse, 'Room $roomNumber is occupied and cannot be removed.');
    }
    final changes = await _rooms.deleteByNumber(roomNumber);
    if (changes == 0) {
      throw AppError(AppErrorCode.notFound, 'Room $roomNumber was not found.');
    }
  }
}

extension _FirstOrNull<T> on Iterable<T> {
  T? get firstOrNull => isEmpty ? null : first;
}
