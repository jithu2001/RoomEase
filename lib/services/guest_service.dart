import '../database/repositories/booking_guest_repository.dart';
import '../database/repositories/customer_repository.dart';
import '../models/models.dart';
import '../utils/app_date.dart';
import '../utils/app_error.dart';
import '../utils/validation.dart';
import 'image_service.dart';

class GuestImages {
  final PreparedImage? front;
  final PreparedImage? back;
  const GuestImages({this.front, this.back});
}

/// Companion guests sharing a room with the primary booking.
class GuestService {
  final BookingGuestRepository _guests;
  final CustomerRepository _customers;
  final ImageService _images;
  GuestService(this._guests, this._customers, this._images);

  Future<List<BookingGuest>> list(int customerId) => _guests.listByCustomer(customerId);

  Future<BookingGuest> get(int guestId) async {
    final guest = await _guests.findById(guestId);
    if (guest == null) {
      throw const AppError(AppErrorCode.notFound, 'That guest record was not found.');
    }
    return guest;
  }

  Future<GuestCapacity> capacity(int customerId) async {
    final customer = await _customers.findById(customerId);
    if (customer == null) {
      throw const AppError(AppErrorCode.notFound, 'That customer record was not found.');
    }
    final allowed = customer.numberOfPersons - 1 < 0 ? 0 : customer.numberOfPersons - 1;
    final recorded = await _guests.countByCustomer(customerId);
    return GuestCapacity(
      persons: customer.numberOfPersons,
      recorded: recorded,
      allowed: allowed,
      canAddMore: recorded < allowed,
    );
  }

  Future<BookingGuest> add(int customerId, NormalisedGuestForm values, [GuestImages images = const GuestImages()]) async {
    final customer = await _customers.findById(customerId);
    if (customer == null) {
      throw const AppError(AppErrorCode.notFound, 'That customer record was not found.');
    }
    final cap = await capacity(customerId);
    if (!cap.canAddMore) {
      final message = cap.allowed == 0
          ? 'This booking is for one person, so no other guests can be recorded. Increase '
              '"Number of Persons" on the booking first.'
          : 'This booking already has all ${cap.allowed} other guest(s) recorded. Increase '
              '"Number of Persons" on the booking to add more.';
      throw AppError(AppErrorCode.validation, message);
    }
    final now = nowIso();
    final guestId = await _guests.insert(NewBookingGuestRow(
      customerId: customerId,
      name: values.name,
      phone: values.phone,
      createdAt: now,
      updatedAt: now,
    ));
    try {
      await _storePhotos(customer.customerCode, guestId, images, now);
    } catch (e) {
      await _guests.delete(guestId);
      await _images.removeGuestImages(customer.customerCode, guestId);
      rethrow;
    }
    return get(guestId);
  }

  Future<BookingGuest> update(int guestId, NormalisedGuestForm values, [GuestImages images = const GuestImages()]) async {
    final guest = await get(guestId);
    final customer = await _customers.findById(guest.customerId);
    if (customer == null) {
      throw const AppError(AppErrorCode.notFound, 'That customer record was not found.');
    }
    final now = nowIso();
    await _guests.update(guestId, {
      'name': values.name,
      'phone': values.phone,
      'updated_at': now,
    });
    await _storePhotos(customer.customerCode, guestId, images, now);
    return get(guestId);
  }

  Future<void> remove(int guestId) async {
    final guest = await get(guestId);
    final customer = await _customers.findById(guest.customerId);
    final changes = await _guests.delete(guestId);
    if (changes == 0) {
      throw const AppError(AppErrorCode.notFound, 'That guest record was not found.');
    }
    if (customer != null) {
      await _images.removeGuestImages(customer.customerCode, guestId);
    }
  }

  Future<void> _storePhotos(String customerCode, int guestId, GuestImages images, String now) async {
    final patch = <String, Object?>{};
    if (images.front != null) {
      final stored = await _images.storeGuestIdImage(customerCode, guestId, PhotoSide.front, images.front!);
      patch['id_front_path'] = stored.path;
      patch['id_front_thumb_path'] = stored.thumbPath;
    }
    if (images.back != null) {
      final stored = await _images.storeGuestIdImage(customerCode, guestId, PhotoSide.back, images.back!);
      patch['id_back_path'] = stored.path;
      patch['id_back_thumb_path'] = stored.thumbPath;
    }
    if (patch.isNotEmpty) {
      patch['updated_at'] = now;
      await _guests.update(guestId, patch);
    }
  }
}
