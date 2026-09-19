/// Form-field validation rules — mirrors `src/utils/validation.ts`. Dates are
/// held as real `DateTime` values here (there is no HTML
/// `datetime-local` string to bridge through, unlike the original web app).
library;

import 'money.dart';

class Limits {
  static const nameMin = 2;
  static const nameMax = 80;
  static const addressMin = 5;
  static const addressMax = 250;
  static const phoneMin = 7;
  static const phoneMax = 15;
  static const personsMin = 1;
  static const personsMax = 20;
}

/// Clock-drift allowance: a hand-entered check-in/out time can be at most
/// this many hours in the future.
const maxFutureHours = 24;

String _phoneDigits(String phone) => phone.replaceAll(RegExp(r'\D'), '');

String? validateName(String value) {
  final trimmed = value.trim();
  if (trimmed.isEmpty) return 'Name is required.';
  if (trimmed.length < Limits.nameMin || trimmed.length > Limits.nameMax) {
    return 'Name must be ${Limits.nameMin}-${Limits.nameMax} characters.';
  }
  return null;
}

String? validateAddress(String value) {
  final trimmed = value.trim();
  if (trimmed.isEmpty) return 'Address is required.';
  if (trimmed.length < Limits.addressMin || trimmed.length > Limits.addressMax) {
    return 'Address must be ${Limits.addressMin}-${Limits.addressMax} characters.';
  }
  return null;
}

final _phoneCharPattern = RegExp(r'^[+]?[\d\s\-()]+$');

String? validatePhone(String value) {
  final trimmed = value.trim();
  if (trimmed.isEmpty) return 'Phone number is required.';
  if (!_phoneCharPattern.hasMatch(trimmed)) return 'Phone number has invalid characters.';
  final digits = _phoneDigits(trimmed).length;
  if (digits < Limits.phoneMin || digits > Limits.phoneMax) {
    return 'Phone number must have ${Limits.phoneMin}-${Limits.phoneMax} digits.';
  }
  return null;
}

String? validateRoomNumber(String value) {
  if (value.trim().isEmpty) return 'Room is required.';
  return null;
}

String? validatePersons(String value) {
  final trimmed = value.trim();
  if (trimmed.isEmpty) return 'Number of persons is required.';
  final asNum = num.tryParse(trimmed);
  if (asNum == null || !asNum.isFinite) return 'Enter a valid number.';
  if (asNum != asNum.roundToDouble()) return 'Number of persons must be a whole number.';
  final persons = asNum.toInt();
  if (persons < Limits.personsMin || persons > Limits.personsMax) {
    return 'Number of persons must be ${Limits.personsMin}-${Limits.personsMax}.';
  }
  return null;
}

final _roomNumberPattern = RegExp(r'^[A-Za-z0-9\-/ ]+$');

/// Validates a *new* room number: length, charset (room labels double as
/// filesystem path segments), and no case-insensitive duplicate.
String? validateNewRoomNumber(String value, List<String> existing) {
  final trimmed = value.trim();
  if (trimmed.isEmpty) return 'Room number is required.';
  if (trimmed.length > 10) return 'Room number must be at most 10 characters.';
  if (!_roomNumberPattern.hasMatch(trimmed)) {
    return 'Room number can only contain letters, numbers, spaces, - and /.';
  }
  final lower = trimmed.toLowerCase();
  if (existing.any((r) => r.toLowerCase() == lower)) {
    return 'Room $trimmed already exists.';
  }
  return null;
}

String? validateCheckInTime(DateTime? value, {DateTime? now}) {
  if (value == null) return 'Check-in date & time is required.';
  final reference = now ?? DateTime.now();
  if (value.isAfter(reference.add(const Duration(hours: maxFutureHours)))) {
    return 'Check-in time cannot be more than $maxFutureHours hours in the future.';
  }
  if (value.year < 2000) return 'Check-in time is too far in the past.';
  return null;
}

/// Blank ([value] null) is valid — it means "still staying".
String? validateCheckOutTime(DateTime? value, DateTime? checkInValue, {DateTime? now}) {
  if (value == null) return null;
  final reference = now ?? DateTime.now();
  if (value.isAfter(reference.add(const Duration(hours: maxFutureHours)))) {
    return 'Check-out time cannot be more than $maxFutureHours hours in the future.';
  }
  if (checkInValue != null && value.isBefore(checkInValue)) {
    return 'Check-out cannot be before check-in.';
  }
  return null;
}

String? validateGuestName(String value) => validateName(value);

/// Optional — blank is valid.
String? validateGuestPhone(String value) {
  if (value.trim().isEmpty) return null;
  return validatePhone(value);
}

final _pinPattern = RegExp(r'^\d{4,8}$');

String? validatePin(String pin) {
  if (!_pinPattern.hasMatch(pin)) return 'PIN must be 4-8 digits.';
  return null;
}

enum CustomerField {
  name,
  address,
  phone,
  roomNumber,
  numberOfPersons,
  amount,
  checkIn,
  checkOut,
  idFront,
  idBack,
}

typedef FieldErrors<T> = Map<T, String>;

bool hasErrors(FieldErrors errors) => errors.values.any((v) => v.isNotEmpty);

/// Raw values coming out of the check-in / edit form widget, before
/// normalisation into a [CustomerInput]-shaped payload for the service layer.
class CustomerFormValues {
  final String name;
  final String address;
  final String phone;
  final String roomNumber;
  final String numberOfPersonsText;
  final String amountText;
  final DateTime? checkInAt;
  final DateTime? checkOutAt;

  const CustomerFormValues({
    required this.name,
    required this.address,
    required this.phone,
    required this.roomNumber,
    required this.numberOfPersonsText,
    required this.amountText,
    required this.checkInAt,
    required this.checkOutAt,
  });

  CustomerFormValues copyWith({
    String? name,
    String? address,
    String? phone,
    String? roomNumber,
    String? numberOfPersonsText,
    String? amountText,
    DateTime? checkInAt,
    bool clearCheckInAt = false,
    DateTime? checkOutAt,
    bool clearCheckOutAt = false,
  }) =>
      CustomerFormValues(
        name: name ?? this.name,
        address: address ?? this.address,
        phone: phone ?? this.phone,
        roomNumber: roomNumber ?? this.roomNumber,
        numberOfPersonsText: numberOfPersonsText ?? this.numberOfPersonsText,
        amountText: amountText ?? this.amountText,
        checkInAt: clearCheckInAt ? null : (checkInAt ?? this.checkInAt),
        checkOutAt: clearCheckOutAt ? null : (checkOutAt ?? this.checkOutAt),
      );
}

FieldErrors<CustomerField> validateCustomerForm(
  CustomerFormValues values, {
  required bool hasIdFront,
  required bool hasIdBack,
  bool canEditCheckOut = false,
}) {
  final errors = <CustomerField, String>{};
  void put(CustomerField field, String? error) {
    if (error != null) errors[field] = error;
  }

  put(CustomerField.name, validateName(values.name));
  put(CustomerField.address, validateAddress(values.address));
  put(CustomerField.phone, validatePhone(values.phone));
  put(CustomerField.roomNumber, validateRoomNumber(values.roomNumber));
  put(CustomerField.numberOfPersons, validatePersons(values.numberOfPersonsText));
  put(CustomerField.amount, validateAmount(values.amountText));
  put(CustomerField.checkIn, validateCheckInTime(values.checkInAt));
  if (canEditCheckOut) {
    put(CustomerField.checkOut, validateCheckOutTime(values.checkOutAt, values.checkInAt));
  }
  if (!hasIdFront) put(CustomerField.idFront, 'Front ID photo is required.');
  if (!hasIdBack) put(CustomerField.idBack, 'Back ID photo is required.');
  return errors;
}

/// Trims/collapses whitespace and parses numeric fields into a service-layer
/// payload. Assumes [values] already passed [validateCustomerForm].
class NormalisedCustomerForm {
  final String name;
  final String address;
  final String phone;
  final String roomNumber;
  final int numberOfPersons;
  final int? amountMinor;
  final DateTime? checkInAt;
  final DateTime? checkOutAt;

  const NormalisedCustomerForm({
    required this.name,
    required this.address,
    required this.phone,
    required this.roomNumber,
    required this.numberOfPersons,
    required this.amountMinor,
    required this.checkInAt,
    required this.checkOutAt,
  });
}

NormalisedCustomerForm normaliseCustomerInput(CustomerFormValues values) {
  final name = values.name.trim().replaceAll(RegExp(r'\s+'), ' ');
  final parsedAmount = parseAmountToMinor(values.amountText);
  return NormalisedCustomerForm(
    name: name,
    address: values.address.trim(),
    phone: values.phone.trim(),
    roomNumber: values.roomNumber.trim(),
    numberOfPersons: int.tryParse(values.numberOfPersonsText.trim()) ?? 1,
    amountMinor: parsedAmount.valid ? parsedAmount.minor : null,
    checkInAt: values.checkInAt,
    checkOutAt: values.checkOutAt,
  );
}

class GuestFormValues {
  final String name;
  final String phone;
  const GuestFormValues({required this.name, required this.phone});
}

FieldErrors<CustomerField> validateGuestForm(GuestFormValues values) {
  final errors = <CustomerField, String>{};
  final nameError = validateGuestName(values.name);
  if (nameError != null) errors[CustomerField.name] = nameError;
  final phoneError = validateGuestPhone(values.phone);
  if (phoneError != null) errors[CustomerField.phone] = phoneError;
  return errors;
}

class NormalisedGuestForm {
  final String name;
  final String? phone;
  const NormalisedGuestForm({required this.name, required this.phone});
}

NormalisedGuestForm normaliseGuestInput(GuestFormValues values) {
  final name = values.name.trim().replaceAll(RegExp(r'\s+'), ' ');
  final phone = values.phone.trim();
  return NormalisedGuestForm(name: name, phone: phone.isEmpty ? null : phone);
}
