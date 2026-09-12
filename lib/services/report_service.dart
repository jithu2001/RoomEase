import '../database/repositories/booking_guest_repository.dart';
import '../database/repositories/customer_repository.dart';
import '../models/models.dart';
import '../utils/app_date.dart';
import '../utils/app_error.dart';
import 'settings_service.dart';

/// A companion guest on a report — deliberately whitelisted, never carries
/// payment info (there is none on a guest anyway).
class ReportGuest {
  final String name;
  final String? phone;
  final String? idFrontPath;
  final String? idBackPath;
  const ReportGuest({required this.name, required this.phone, required this.idFrontPath, required this.idBackPath});
}

/// One booking's worth of report data. Deliberately excludes `amountMinor` —
/// this whitelist is what keeps payment amounts out of a document that may
/// be printed and shared, even if `Customer` gains new fields later.
class ReportBooking {
  final int customerId;
  final String customerCode;
  final String roomNumber;
  final String name;
  final String address;
  final String phone;
  final int numberOfPersons;
  final String? idFrontPath;
  final String? idBackPath;
  final String checkInDate;
  final String? checkOutDate;
  final bool arrivedOnDate;
  final bool departedOnDate;
  final bool stillStayingOnDate;
  final List<ReportGuest> guests;

  const ReportBooking({
    required this.customerId,
    required this.customerCode,
    required this.roomNumber,
    required this.name,
    required this.address,
    required this.phone,
    required this.numberOfPersons,
    required this.idFrontPath,
    required this.idBackPath,
    required this.checkInDate,
    required this.checkOutDate,
    required this.arrivedOnDate,
    required this.departedOnDate,
    required this.stillStayingOnDate,
    required this.guests,
  });
}

class ReportTotals {
  final int bookings;
  final int people;
  final int arrivals;
  final int departures;
  final int rooms;
  const ReportTotals({
    required this.bookings,
    required this.people,
    required this.arrivals,
    required this.departures,
    required this.rooms,
  });
}

class DayReport {
  final String day;
  final String dayLabel;
  final String hotelName;
  final String hotelAddress;
  final String hotelPhone;
  final String generatedAt;
  final List<ReportBooking> bookings;
  final ReportTotals totals;

  const DayReport({
    required this.day,
    required this.dayLabel,
    required this.hotelName,
    required this.hotelAddress,
    required this.hotelPhone,
    required this.generatedAt,
    required this.bookings,
    required this.totals,
  });
}

ReportBooking _stripPaymentInfo(Customer customer, String day, List<BookingGuest> guests) {
  final checkOutDay = customer.checkOutDate != null ? dayKeyOf(customer.checkOutDate!) : null;
  return ReportBooking(
    customerId: customer.id,
    customerCode: customer.customerCode,
    roomNumber: customer.roomNumber,
    name: customer.name,
    address: customer.address,
    phone: customer.phone,
    numberOfPersons: customer.numberOfPersons,
    idFrontPath: customer.idFrontPath,
    idBackPath: customer.idBackPath,
    checkInDate: customer.checkInDate,
    checkOutDate: customer.checkOutDate,
    arrivedOnDate: dayKeyOf(customer.checkInDate) == day,
    departedOnDate: checkOutDay == day,
    stillStayingOnDate: customer.checkOutDate == null || (checkOutDay != null && checkOutDay.compareTo(day) > 0),
    guests: guests
        .map((g) => ReportGuest(name: g.name, phone: g.phone, idFrontPath: g.idFrontPath, idBackPath: g.idBackPath))
        .toList(),
  );
}

final _dayPattern = RegExp(r'^\d{4}-\d{2}-\d{2}$');

class ReportService {
  final CustomerRepository _customers;
  final BookingGuestRepository _guests;
  final SettingsService _settings;
  ReportService(this._customers, this._guests, this._settings);

  Future<DayReport> buildDayReport(String day, {DateTime? now}) async {
    if (!_dayPattern.hasMatch(day)) {
      throw const AppError(AppErrorCode.validation, 'Enter a valid date.');
    }
    final results = await Future.wait([_customers.listStayingOn(day), _settings.get()]);
    final rows = results[0] as List<Customer>;
    final hotel = results[1] as HotelSettings;
    final guestsByCustomer = <int, List<BookingGuest>>{};
    if (rows.isNotEmpty) {
      final allGuests = await _guests.listByCustomers(rows.map((r) => r.id).toList());
      for (final guest in allGuests) {
        guestsByCustomer.putIfAbsent(guest.customerId, () => []).add(guest);
      }
    }
    final bookings = rows.map((r) => _stripPaymentInfo(r, day, guestsByCustomer[r.id] ?? const [])).toList();

    final dayDate = DateTime(int.parse(day.substring(0, 4)), int.parse(day.substring(5, 7)), int.parse(day.substring(8, 10)));
    return DayReport(
      day: day,
      dayLabel: formatDate(toIso(dayDate)),
      hotelName: hotel.hotelName,
      hotelAddress: hotel.hotelAddress,
      hotelPhone: hotel.hotelPhone,
      generatedAt: nowIso(),
      bookings: bookings,
      totals: ReportTotals(
        bookings: bookings.length,
        people: bookings.fold(0, (sum, b) => sum + b.numberOfPersons),
        arrivals: bookings.where((b) => b.arrivedOnDate).length,
        departures: bookings.where((b) => b.departedOnDate).length,
        rooms: bookings.map((b) => b.roomNumber).toSet().length,
      ),
    );
  }
}
