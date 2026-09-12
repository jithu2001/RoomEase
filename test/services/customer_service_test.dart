import 'package:flutter_test/flutter_test.dart';
import 'package:roomease/database/repositories/booking_guest_repository.dart';
import 'package:roomease/database/repositories/customer_repository.dart';
import 'package:roomease/database/repositories/room_repository.dart';
import 'package:roomease/database/sql_driver.dart';
import 'package:roomease/models/models.dart';
import 'package:roomease/services/customer_service.dart';
import 'package:roomease/services/image_service.dart';
import 'package:roomease/services/room_service.dart';
import 'package:roomease/utils/app_error.dart';
import 'package:roomease/utils/validation.dart';

import '../helpers/memory_file_store.dart';
import '../helpers/test_db.dart';

PreparedImage _fakeImage() => const PreparedImage(full: [1, 2, 3], thumb: [1], width: 10, height: 10, bytes: 3);

NormalisedCustomerForm _values({
  String name = 'Ravi Kumar',
  String room = '101',
  int persons = 1,
  DateTime? checkIn,
  DateTime? checkOut,
  int? amountMinor,
}) =>
    NormalisedCustomerForm(
      name: name,
      address: '123 Main St',
      phone: '9847012345',
      roomNumber: room,
      numberOfPersons: persons,
      amountMinor: amountMinor,
      checkInAt: checkIn,
      checkOutAt: checkOut,
    );

void main() {
  late SqlDriver driver;
  late CustomerService customers;
  late RoomService rooms;

  setUp(() async {
    driver = await openTestDatabase();
    final customerRepo = CustomerRepository(driver);
    final roomRepo = RoomRepository(driver);
    final guestRepo = BookingGuestRepository(driver);
    final images = ImageService(MemoryFileStore());
    rooms = RoomService(roomRepo, customerRepo);
    customers = CustomerService(customerRepo, roomRepo, rooms, images, guestRepo);
  });

  test('check-in creates a CHECKED_IN customer with a generated code', () async {
    final customer = await customers.checkIn(
      _values(),
      CheckInImages(front: _fakeImage(), back: _fakeImage()),
    );
    expect(customer.customerCode, 'CUS-000001');
    expect(customer.status, CustomerStatus.checkedIn);
    expect(customer.roomNumber, '101');
  });

  test('sequential check-ins get sequential codes', () async {
    final a = await customers.checkIn(_values(room: '101'), CheckInImages(front: _fakeImage(), back: _fakeImage()));
    final b = await customers.checkIn(_values(room: '102'), CheckInImages(front: _fakeImage(), back: _fakeImage()));
    expect(a.customerCode, 'CUS-000001');
    expect(b.customerCode, 'CUS-000002');
  });

  test('check-in refuses an already-occupied room', () async {
    await customers.checkIn(_values(room: '101'), CheckInImages(front: _fakeImage(), back: _fakeImage()));
    expect(
      () => customers.checkIn(_values(room: '101'), CheckInImages(front: _fakeImage(), back: _fakeImage())),
      throwsA(isA<AppError>().having((e) => e.code, 'code', AppErrorCode.roomOccupied)),
    );
  });

  test('check-in refuses a room that does not exist', () async {
    expect(
      () => customers.checkIn(_values(room: '999'), CheckInImages(front: _fakeImage(), back: _fakeImage())),
      throwsA(isA<AppError>().having((e) => e.code, 'code', AppErrorCode.roomUnknown)),
    );
  });

  test('check-out frees the room for a new check-in', () async {
    final customer = await customers.checkIn(_values(room: '101'), CheckInImages(front: _fakeImage(), back: _fakeImage()));
    await customers.checkOut(customer.id);
    final again = await customers.checkIn(_values(room: '101'), CheckInImages(front: _fakeImage(), back: _fakeImage()));
    expect(again.roomNumber, '101');
    expect((await rooms.isAvailable('101')), isFalse); // occupied again by `again`
  });

  test('check-out twice is rejected', () async {
    final customer = await customers.checkIn(_values(), CheckInImages(front: _fakeImage(), back: _fakeImage()));
    await customers.checkOut(customer.id);
    expect(
      () => customers.checkOut(customer.id),
      throwsA(isA<AppError>().having((e) => e.code, 'code', AppErrorCode.validation)),
    );
  });

  test('editing to move rooms checks the new room is free', () async {
    final a = await customers.checkIn(_values(room: '101'), CheckInImages(front: _fakeImage(), back: _fakeImage()));
    await customers.checkIn(_values(room: '102'), CheckInImages(front: _fakeImage(), back: _fakeImage()));
    expect(
      () => customers.update(a.id, _values(room: '102')),
      throwsA(isA<AppError>().having((e) => e.code, 'code', AppErrorCode.roomOccupied)),
    );
  });

  test('editing keeps working when the room is unchanged', () async {
    final a = await customers.checkIn(_values(room: '101', name: 'Old Name'), CheckInImages(front: _fakeImage(), back: _fakeImage()));
    final updated = await customers.update(a.id, _values(room: '101', name: 'New Name'));
    expect(updated.name, 'New Name');
  });

  test('dashboard reflects occupancy and today\'s activity', () async {
    final a = await customers.checkIn(_values(room: '101'), CheckInImages(front: _fakeImage(), back: _fakeImage()));
    await customers.checkIn(_values(room: '102', persons: 2), CheckInImages(front: _fakeImage(), back: _fakeImage()));
    await customers.checkOut(a.id);

    final stats = await customers.dashboard();
    expect(stats.currentlyStaying, 1);
    expect(stats.activeGuests, 2);
    expect(stats.occupiedRooms, 1);
    expect(stats.todaysCheckIns, 2);
    expect(stats.todaysCheckOuts, 1);
    expect(stats.totalRooms, defaultRoomsCount);
  });

  test('findReturningGuests requires at least 3 characters', () async {
    await customers.checkIn(_values(), CheckInImages(front: _fakeImage(), back: _fakeImage()));
    expect(await customers.findReturningGuests('98'), isEmpty);
  });

  test('findReturningGuests matches by phone and returns the latest stay', () async {
    final first = await customers.checkIn(_values(room: '101'), CheckInImages(front: _fakeImage(), back: _fakeImage()));
    await customers.checkOut(first.id);
    final second = await customers.checkIn(
      _values(room: '102', checkIn: DateTime.now().add(const Duration(minutes: 1))),
      CheckInImages(front: _fakeImage(), back: _fakeImage()),
    );

    final matches = await customers.findReturningGuests('9847012345');
    expect(matches, hasLength(1));
    expect(matches.first.customerId, second.id);
    expect(matches.first.stayCount, 2);
  });

  test('check-in can reuse a returning guest\'s ID photos', () async {
    final first = await customers.checkIn(_values(room: '101'), CheckInImages(front: _fakeImage(), back: _fakeImage()));
    await customers.checkOut(first.id);

    final reused = await customers.checkIn(
      _values(room: '102'),
      CheckInImages(reuseFromCustomerId: first.id),
    );
    expect(reused.idFrontPath, isNotEmpty);
    expect(reused.idBackPath, isNotEmpty);
  });
}

const defaultRoomsCount = 8;
