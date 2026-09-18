import 'package:url_launcher/url_launcher.dart';

import '../models/models.dart';
import '../utils/app_date.dart';
import '../utils/message_template.dart';
import '../utils/phone.dart';
import 'settings_service.dart';

/// What came of trying to hand a message off to WhatsApp.
enum WhatsAppSendResult {
  /// WhatsApp (or the browser) opened with the message pre-filled.
  opened,

  /// The guest's stored phone number can't be turned into a dialable number.
  invalidNumber,

  /// Nothing on the device could handle the link — WhatsApp isn't installed.
  unavailable,
}

/// Opens WhatsApp with a welcome message pre-filled, using the free `wa.me`
/// click-to-chat link.
///
/// Nothing is sent by this app: the link hands the number and text to
/// WhatsApp, and staff tap Send there. That keeps RoomEase offline — no API
/// credentials, no network calls, no INTERNET permission.
class WhatsAppService {
  final SettingsService _settings;
  WhatsAppService(this._settings);

  /// The rendered welcome message for [customer], or null when the guest's
  /// number is unusable. Used for the pre-send preview.
  Future<String?> previewWelcome(Customer customer) async {
    final hotel = await _settings.get();
    if (whatsappNumber(customer.phone, defaultCountryCode: hotel.whatsappCountryCode) == null) {
      return null;
    }
    return _render(hotel, customer);
  }

  /// The number the message would go to, formatted for display, or null when
  /// the guest's stored number can't be used.
  Future<String?> targetNumber(Customer customer) async {
    final hotel = await _settings.get();
    final digits = whatsappNumber(customer.phone, defaultCountryCode: hotel.whatsappCountryCode);
    return digits == null ? null : '+$digits';
  }

  /// The click-to-chat link for [customer], or null when their number is
  /// unusable. Exposed so the exact URL can be asserted in tests.
  Future<Uri?> welcomeUri(Customer customer) async {
    final hotel = await _settings.get();
    final digits = whatsappNumber(customer.phone, defaultCountryCode: hotel.whatsappCountryCode);
    if (digits == null) return null;
    return Uri.parse('https://wa.me/$digits?text=${Uri.encodeComponent(_render(hotel, customer))}');
  }

  /// Renders the welcome template for [customer] and opens WhatsApp with it.
  ///
  /// Never throws — a messaging failure must not be mistaken for a check-in
  /// failure by the caller.
  Future<WhatsAppSendResult> sendWelcome(Customer customer) async {
    final uri = await welcomeUri(customer);
    if (uri == null) return WhatsAppSendResult.invalidNumber;
    try {
      final launched = await launchUrl(uri, mode: LaunchMode.externalApplication);
      return launched ? WhatsAppSendResult.opened : WhatsAppSendResult.unavailable;
    } catch (_) {
      return WhatsAppSendResult.unavailable;
    }
  }

  String _render(HotelSettings hotel, Customer customer) => renderTemplate(
        hotel.whatsappWelcomeTemplate,
        {
          'guest': customer.name,
          'room': customer.roomNumber,
          'hotel': hotel.hotelName,
          'hotel_phone': hotel.hotelPhone,
          'checkin': formatDateTime(customer.checkInDate),
          'code': customer.customerCode,
        },
      );
}
