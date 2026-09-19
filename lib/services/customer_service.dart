import '../database/repositories/booking_guest_repository.dart';
import '../database/repositories/customer_repository.dart';
import '../database/repositories/room_repository.dart';
import '../models/models.dart';
import '../utils/app_date.dart';
import '../utils/app_error.dart';
import '../utils/customer_code.dart';
import '../utils/validation.dart';
import 'file_store.dart' show customerDir;
import 'image_service.dart';
import 'room_service.dart';

/// Images supplied to a check-in: a fresh capture for each side, and/or a
/// source customer id to reuse a returning guest's photos from.
class CheckInImages {
  final PreparedImage? front;
  final PreparedImage? back;
  final int? reuseFromCustomerId;
  const CheckInImages({this.front, this.back, this.reuseFromCustomerId});
}

class UpdateImages {
  final PreparedImage? front;
  final PreparedImage? back;
  const UpdateImages({this.front, this.back});
}

class CustomerService {
  final CustomerRepository _customers;
  final RoomRepository _rooms;
  final RoomService _roomService;
  final ImageService _images;
  final BookingGuestRepository? _guests;

  CustomerService(this._customers, this._rooms, this._roomService, this._images, [this._guests]);

  Future<Customer> get(int id) async {
    final customer = await _customers.findById(id);
    if (customer == null) {
      throw const AppError(AppErrorCode.notFound, 'That customer record was not found.');
    }
    return customer;
  }

  Future<Customer?> find(int id) => _customers.findById(id);

  Future<CustomerPage> search([CustomerQuery query = const CustomerQuery(limit: 25)]) async {
    final results = await Future.wait([_customers.list(query), _customers.count(query)]);
    final items = results[0] as List<Customer>;
    final total = results[1] as int;
    return CustomerPage(items: items, total: total, hasMore: query.offset + items.length < total);
  }

  Future<List<Customer>> listActive() => _customers.listActive();

  Future<DashboardStats> dashboard({DateTime? now}) async {
    final clock = now ?? DateTime.now();
    final today = toDayKey(clock);
    final thisMonth = toMonthKey(clock);
    final results = await Future.wait([
      _rooms.count(),
      _customers.occupancyMap(),
      _rooms.list(),
      _customers.countActive(),
      _customers.sumActivePersons(),
      _customers.countCheckInsOn(today),
      _customers.countCheckOutsOn(today),
      _customers.sumAmountMinorForMonth(thisMonth),
      _customers.countCheckInsForMonth(thisMonth),
      _customers.countAmountRecordedForMonth(thisMonth),
    ]);
    final totalRooms = results[0] as int;
    final occupancy = results[1] as Map<String, ({String customerCode, String name})>;
    final rooms = results[2] as List<Room>;
    final activeCount = results[3] as int;
    final activePersons = results[4] as int;
    final checkIns = results[5] as int;
    final checkOuts = results[6] as int;
    final monthAmount = results[7] as int;
    final monthBookings = results[8] as int;
    final monthBookingsWithAmount = results[9] as int;
    final occupiedRooms = rooms.where((r) => occupancy.containsKey(r.roomNumber)).length;
    final availableRooms = totalRooms - occupiedRooms;
    return DashboardStats(
      currentlyStaying: activeCount,
      activeGuests: activePersons,
      occupiedRooms: occupiedRooms,
      availableRooms: availableRooms < 0 ? 0 : availableRooms,
      totalRooms: totalRooms,
      todaysCheckIns: checkIns,
      todaysCheckOuts: checkOuts,
      monthAmountMinor: monthAmount,
      monthBookings: monthBookings,
      monthBookingsWithAmount: monthBookingsWithAmount,
    );
  }

  Future<String> nextCode() async => nextCustomerCode(await _customers.highestCustomerCode());

  /// Requires at least 3 characters. Re-verifies "has ID photos" against
  /// what's actually still on disk (a match's stored path may point at a
  /// since-deleted file).
  Future<List<GuestMatch>> findReturningGuests(String term, {int limit = 8}) async {
    final trimmed = term.trim();
    if (trimmed.length < 3) return const [];
    final matches = await _customers.findGuestsByPhoneOrName(trimmed, limit: limit);
    final verified = <GuestMatch>[];
    for (final match in matches) {
      if (!match.hasIdPhotos) {
        verified.add(match);
        continue;
      }
      final frontOk = await _images.exists(match.idFrontPath);
      final backOk = await _images.exists(match.idBackPath);
      verified.add(match.copyWith(hasIdPhotos: frontOk && backOk));
    }
    return verified;
  }

  Future<Customer> checkIn(NormalisedCustomerForm values, CheckInImages images) async {
    Customer? source;
    if (images.reuseFromCustomerId != null) {
      source = await _customers.findById(images.reuseFromCustomerId!);
      if (source == null) {
        throw const AppError(AppErrorCode.notFound, 'The previous guest record could not be found.');
      }
    }

    await _roomService.assertAssignable(values.roomNumber);

    final code = await nextCode();
    final now = nowIso();
    final checkInAt = values.checkInAt != null ? toIso(values.checkInAt!) : now;

    String frontPath, backPath, frontThumb, backThumb;
    try {
      if (source != null) {
        await _images.copyIdImages(source, code);
        frontPath = '${customerDir(code)}/id-front.jpg';
        backPath = '${customerDir(code)}/id-back.jpg';
        frontThumb = '${customerDir(code)}/id-front-thumb.jpg';
        backThumb = '${customerDir(code)}/id-back-thumb.jpg';
        // A fresh capture, even when reusing, wins over the copied photo.
        if (images.front != null) {
          final stored = await _images.storeIdImage(code, PhotoSide.front, images.front!);
          frontPath = stored.path;
          frontThumb = stored.thumbPath;
        }
        if (images.back != null) {
          final stored = await _images.storeIdImage(code, PhotoSide.back, images.back!);
          backPath = stored.path;
          backThumb = stored.thumbPath;
        }
      } else {
        if (images.front == null || images.back == null) {
          throw const AppError(AppErrorCode.validation, 'Both ID photos are required.');
        }
        final front = await _images.storeIdImage(code, PhotoSide.front, images.front!);
        final back = await _images.storeIdImage(code, PhotoSide.back, images.back!);
        frontPath = front.path;
        backPath = back.path;
        frontThumb = front.thumbPath;
        backThumb = back.thumbPath;
      }
    } catch (e) {
      await _images.removeCustomerImages(code);
      rethrow;
    }

    int id;
    try {
      id = await _customers.insert(NewCustomerRow(
        customerCode: code,
        name: values.name,
        address: values.address,
        phone: values.phone,
        roomNumber: values.roomNumber,
        numberOfPersons: values.numberOfPersons,
        idFrontPath: frontPath,
        idBackPath: backPath,
        checkInDate: checkInAt,
        createdAt: now,
        updatedAt: now,
        idFrontThumbPath: frontThumb,
        idBackThumbPath: backThumb,
        amountMinor: values.amountMinor,
      ));
    } catch (e) {
      await _images.removeCustomerImages(code);
      logError('customerService.checkIn', e);
      if (e is AppError && e.code == AppErrorCode.dbQuery) {
        throw AppError(
          AppErrorCode.dbQuery,
          'That room was just taken by another check-in. Please pick a different room.',
          e,
        );
      }
      rethrow;
    }
    return get(id);
  }

  Future<Customer> update(int id, NormalisedCustomerForm values, [UpdateImages images = const UpdateImages()]) async {
    final existing = await get(id);

    if (_guests != null && values.numberOfPersons < existing.numberOfPersons) {
      final recorded = await _guests.countByCustomer(id);
      if (values.numberOfPersons < recorded + 1) {
        throw AppError(
          AppErrorCode.validation,
          'This booking has $recorded other guest(s) recorded. Remove a guest before lowering '
          'the number of persons.',
        );
      }
    }

    final roomChanged = values.roomNumber != existing.roomNumber;
    if (roomChanged) {
      if (existing.status == CustomerStatus.checkedIn) {
        await _roomService.assertAssignable(values.roomNumber, excludeCustomerId: id);
      } else if (!await _rooms.exists(values.roomNumber)) {
        throw AppError(AppErrorCode.roomUnknown, 'Room ${values.roomNumber} does not exist.');
      }
    }

    final now = nowIso();
    final patch = <String, Object?>{
      'name': values.name,
      'address': values.address,
      'phone': values.phone,
      'room_number': values.roomNumber,
      'number_of_persons': values.numberOfPersons,
      'amount_minor': values.amountMinor,
      'updated_at': now,
    };
    if (values.checkInAt != null) {
      patch['check_in_date'] = toIso(values.checkInAt!);
    }

    String? effectiveCheckOut = existing.checkOutDate;
    if (existing.status == CustomerStatus.checkedOut && values.checkOutAt != null) {
      effectiveCheckOut = toIso(values.checkOutAt!);
      patch['check_out_date'] = effectiveCheckOut;
    } else if (existing.status == CustomerStatus.checkedIn && values.checkOutAt != null) {
      throw const AppError(AppErrorCode.validation, 'This customer is still staying.');
    }

    final effectiveCheckIn = patch['check_in_date'] as String? ?? existing.checkInDate;
    if (effectiveCheckOut != null && effectiveCheckOut.compareTo(effectiveCheckIn) < 0) {
      throw const AppError(AppErrorCode.validation, 'Check-out cannot be before check-in.');
    }

    if (images.front != null) {
      final stored = await _images.storeIdImage(existing.customerCode, PhotoSide.front, images.front!);
      patch['id_front_path'] = stored.path;
      patch['id_front_thumb_path'] = stored.thumbPath;
    }
    if (images.back != null) {
      final stored = await _images.storeIdImage(existing.customerCode, PhotoSide.back, images.back!);
      patch['id_back_path'] = stored.path;
      patch['id_back_thumb_path'] = stored.thumbPath;
    }

    await _customers.update(id, patch);
    return get(id);
  }

  Future<Customer> checkOut(int id, {String? at}) async {
    final existing = await get(id);
    if (existing.status == CustomerStatus.checkedOut) {
      throw const AppError(AppErrorCode.validation, 'This customer is already checked out.');
    }
    final when = at ?? nowIso();
    if (when.compareTo(existing.checkInDate) < 0) {
      throw const AppError(AppErrorCode.validation, 'Check-out cannot be before check-in.');
    }
    final changes = await _customers.checkOut(id, when, nowIso());
    if (changes == 0) {
      throw const AppError(AppErrorCode.dbQuery, 'This customer was already checked out elsewhere.');
    }
    return get(id);
  }

  Future<void> remove(int id) async {
    final existing = await get(id);
    final changes = await _customers.delete(id);
    if (changes == 0) {
      throw const AppError(AppErrorCode.notFound, 'That customer record was not found.');
    }
    await _images.removeCustomerImages(existing.customerCode, [
      existing.idFrontPath,
      existing.idBackPath,
      if (existing.idFrontThumbPath != null) existing.idFrontThumbPath!,
      if (existing.idBackThumbPath != null) existing.idBackThumbPath!,
    ]);
  }
}
