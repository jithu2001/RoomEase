/// Shared domain types. Kept free of any UI or platform imports — mirrors the
/// original `src/types.ts`.
library;

/// Status of a customer's current stay.
enum CustomerStatus {
  checkedIn('CHECKED_IN'),
  checkedOut('CHECKED_OUT');

  final String value;
  const CustomerStatus(this.value);

  static CustomerStatus fromValue(String value) => switch (value) {
        'CHECKED_IN' => CustomerStatus.checkedIn,
        'CHECKED_OUT' => CustomerStatus.checkedOut,
        _ => throw ArgumentError('Unknown customer status: $value'),
      };

  static CustomerStatus? tryFromValue(String value) => switch (value) {
        'CHECKED_IN' => CustomerStatus.checkedIn,
        'CHECKED_OUT' => CustomerStatus.checkedOut,
        _ => null,
      };
}

/// A row of the `customers` table.
class Customer {
  final int id;
  final String customerCode;
  final String name;
  final String address;
  final String phone;
  final String roomNumber;
  final int numberOfPersons;
  final String idFrontPath;
  final String idBackPath;
  /// ISO 8601 local-offset timestamp, e.g. 2026-08-18T10:35:00.000+05:30
  final String checkInDate;
  final String? checkOutDate;
  final CustomerStatus status;
  final String createdAt;
  final String updatedAt;
  final String? idFrontThumbPath;
  final String? idBackThumbPath;
  /// Optional booking amount in minor units (paise). Null means "not
  /// recorded", which is different from zero.
  final int? amountMinor;

  const Customer({
    required this.id,
    required this.customerCode,
    required this.name,
    required this.address,
    required this.phone,
    required this.roomNumber,
    required this.numberOfPersons,
    required this.idFrontPath,
    required this.idBackPath,
    required this.checkInDate,
    required this.checkOutDate,
    required this.status,
    required this.createdAt,
    required this.updatedAt,
    required this.idFrontThumbPath,
    required this.idBackThumbPath,
    required this.amountMinor,
  });

  factory Customer.fromRow(Map<String, Object?> row) => Customer(
        id: row['id'] as int,
        customerCode: row['customer_code'] as String,
        name: row['name'] as String,
        address: row['address'] as String,
        phone: row['phone'] as String,
        roomNumber: row['room_number'] as String,
        numberOfPersons: row['number_of_persons'] as int,
        idFrontPath: row['id_front_path'] as String,
        idBackPath: row['id_back_path'] as String,
        checkInDate: row['check_in_date'] as String,
        checkOutDate: row['check_out_date'] as String?,
        status: CustomerStatus.fromValue(row['status'] as String),
        createdAt: row['created_at'] as String,
        updatedAt: row['updated_at'] as String,
        idFrontThumbPath: row['id_front_thumb_path'] as String?,
        idBackThumbPath: row['id_back_thumb_path'] as String?,
        amountMinor: row['amount_minor'] as int?,
      );
}

/// Another person sharing the room, recorded optionally. Everything except
/// the name is optional: a companion's phone and ID proof are often not
/// collected.
class BookingGuest {
  final int id;
  final int customerId;
  final String name;
  final String? phone;
  final String? idFrontPath;
  final String? idBackPath;
  final String? idFrontThumbPath;
  final String? idBackThumbPath;
  final String createdAt;
  final String updatedAt;

  const BookingGuest({
    required this.id,
    required this.customerId,
    required this.name,
    required this.phone,
    required this.idFrontPath,
    required this.idBackPath,
    required this.idFrontThumbPath,
    required this.idBackThumbPath,
    required this.createdAt,
    required this.updatedAt,
  });

  factory BookingGuest.fromRow(Map<String, Object?> row) => BookingGuest(
        id: row['id'] as int,
        customerId: row['customer_id'] as int,
        name: row['name'] as String,
        phone: row['phone'] as String?,
        idFrontPath: row['id_front_path'] as String?,
        idBackPath: row['id_back_path'] as String?,
        idFrontThumbPath: row['id_front_thumb_path'] as String?,
        idBackThumbPath: row['id_back_thumb_path'] as String?,
        createdAt: row['created_at'] as String,
        updatedAt: row['updated_at'] as String,
      );
}

/// How many companions a booking has room for, and how many are recorded.
class GuestCapacity {
  /// number_of_persons on the booking.
  final int persons;
  /// Companions already recorded (excludes the primary guest).
  final int recorded;
  /// persons - 1: the primary guest is the booking itself.
  final int allowed;
  final bool canAddMore;

  const GuestCapacity({
    required this.persons,
    required this.recorded,
    required this.allowed,
    required this.canAddMore,
  });
}

/// One returning-guest match: the latest stay for a phone number.
class GuestMatch {
  /// Id of that latest stay, used as the source for copied ID photos.
  final int customerId;
  final String customerCode;
  final String name;
  final String address;
  final String phone;
  /// How many stays this phone number has on record.
  final int stayCount;
  /// Check-in timestamp of the most recent stay.
  final String lastStay;
  final bool hasIdPhotos;
  /// Source paths for photo reuse on check-in. Not shown in the UI.
  final String idFrontPath;
  final String idBackPath;

  const GuestMatch({
    required this.customerId,
    required this.customerCode,
    required this.name,
    required this.address,
    required this.phone,
    required this.stayCount,
    required this.lastStay,
    required this.hasIdPhotos,
    this.idFrontPath = '',
    this.idBackPath = '',
  });

  GuestMatch copyWith({bool? hasIdPhotos}) => GuestMatch(
        customerId: customerId,
        customerCode: customerCode,
        name: name,
        address: address,
        phone: phone,
        stayCount: stayCount,
        lastStay: lastStay,
        hasIdPhotos: hasIdPhotos ?? this.hasIdPhotos,
        idFrontPath: idFrontPath,
        idBackPath: idBackPath,
      );
}

class Room {
  final int id;
  final String roomNumber;
  final String createdAt;

  const Room({required this.id, required this.roomNumber, required this.createdAt});

  factory Room.fromRow(Map<String, Object?> row) => Room(
        id: row['id'] as int,
        roomNumber: row['room_number'] as String,
        createdAt: row['created_at'] as String,
      );
}

class RoomStatus {
  final String roomNumber;
  final bool occupied;
  final String? customerCode;
  final String? customerName;

  const RoomStatus({
    required this.roomNumber,
    required this.occupied,
    this.customerCode,
    this.customerName,
  });
}

class HotelSettings {
  final String hotelName;
  final String hotelAddress;
  final String hotelPhone;
  /// SHA-256 hex of the app PIN, or '' when PIN lock is disabled.
  final String pinHash;
  /// ISO timestamp of the last successful backup export, or ''.
  final String lastBackupAt;
  /// Whether check-in offers to send a WhatsApp welcome message.
  final bool whatsappEnabled;
  /// Digits-only country code prepended to guest numbers that lack one.
  final String whatsappCountryCode;
  /// Welcome message body, with `{guest}`-style placeholders.
  final String whatsappWelcomeTemplate;

  const HotelSettings({
    required this.hotelName,
    required this.hotelAddress,
    required this.hotelPhone,
    required this.pinHash,
    required this.lastBackupAt,
    required this.whatsappEnabled,
    required this.whatsappCountryCode,
    required this.whatsappWelcomeTemplate,
  });

  bool get pinEnabled => pinHash.isNotEmpty;
}

enum CustomerFilter {
  all('ALL'),
  checkedIn('CHECKED_IN'),
  checkedOut('CHECKED_OUT');

  final String value;
  const CustomerFilter(this.value);
}

class CustomerQuery {
  final String? search;
  final CustomerFilter filter;
  final int limit;
  final int offset;

  const CustomerQuery({
    this.search,
    this.filter = CustomerFilter.all,
    this.limit = 50,
    this.offset = 0,
  });

  CustomerQuery copyWith({String? search, CustomerFilter? filter, int? limit, int? offset}) =>
      CustomerQuery(
        search: search ?? this.search,
        filter: filter ?? this.filter,
        limit: limit ?? this.limit,
        offset: offset ?? this.offset,
      );
}

class CustomerPage {
  final List<Customer> items;
  final int total;
  final bool hasMore;

  const CustomerPage({required this.items, required this.total, required this.hasMore});
}

class DashboardStats {
  final int currentlyStaying;
  final int activeGuests;
  final int occupiedRooms;
  final int availableRooms;
  final int totalRooms;
  final int todaysCheckIns;
  final int todaysCheckOuts;
  /// Sum of `amountMinor` (paise) across bookings checked in this calendar
  /// month. Amount is an optional field per booking, so this is a total of
  /// whatever was actually recorded, not necessarily every stay.
  final int monthAmountMinor;
  /// How many bookings checked in this month had an amount recorded, out of
  /// [monthBookings] total — shown so the total above doesn't read as more
  /// complete than it is.
  final int monthBookingsWithAmount;
  final int monthBookings;

  const DashboardStats({
    required this.currentlyStaying,
    required this.activeGuests,
    required this.occupiedRooms,
    required this.availableRooms,
    required this.totalRooms,
    required this.todaysCheckIns,
    required this.todaysCheckOuts,
    required this.monthAmountMinor,
    required this.monthBookingsWithAmount,
    required this.monthBookings,
  });
}

/// A compressed image ready to be persisted, produced by `ImageCompression`.
class PreparedImage {
  /// Full-size (compressed) JPEG bytes.
  final List<int> full;
  /// Small preview JPEG bytes used by lists and detail cards.
  final List<int> thumb;
  final int width;
  final int height;
  final int bytes;

  const PreparedImage({
    required this.full,
    required this.thumb,
    required this.width,
    required this.height,
    required this.bytes,
  });
}

/// Fields collected by the check-in / edit form, already validated & normalised.
class CustomerInput {
  final String name;
  final String address;
  final String phone;
  final String roomNumber;
  final int numberOfPersons;
  final int? amountMinor;
  /// Explicit check-in timestamp (ISO, local offset); defaults to now when null.
  final String? checkInDate;
  /// Only meaningful for an already checked-out booking.
  final String? checkOutDate;

  const CustomerInput({
    required this.name,
    required this.address,
    required this.phone,
    required this.roomNumber,
    required this.numberOfPersons,
    required this.amountMinor,
    this.checkInDate,
    this.checkOutDate,
  });
}

class BookingGuestInput {
  final String name;
  final String? phone;

  const BookingGuestInput({required this.name, this.phone});
}
