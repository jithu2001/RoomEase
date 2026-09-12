import 'dart:io';
import 'dart:typed_data';

import 'package:pdf/pdf.dart';
import 'package:pdf/widgets.dart' as pw;

import '../services/image_service.dart';
import '../services/report_service.dart';
import '../utils/app_date.dart';

/// Builds a printable/shareable PDF of a [DayReport] — the Flutter
/// equivalent of `components/ReportDocument.tsx` (which the original app
/// then handed to Android's OS-level "print current screen" API). Building
/// real PDF bytes here is more portable and doesn't depend on a WebView.
/// Deliberately never renders `amountMinor` — [ReportService] already
/// stripped it, so there's nothing to leak even by mistake.
Future<Uint8List> buildReportPdf(DayReport report, ImageService images) async {
  final doc = pw.Document();
  final photoCache = <String, pw.MemoryImage?>{};

  Future<pw.MemoryImage?> loadPhoto(String? path) async {
    if (path == null || path.isEmpty) return null;
    if (photoCache.containsKey(path)) return photoCache[path];
    final resolved = await images.resolvePath(path);
    if (resolved == null) {
      photoCache[path] = null;
      return null;
    }
    try {
      final bytes = await File(resolved).readAsBytes();
      final image = pw.MemoryImage(bytes);
      photoCache[path] = image;
      return image;
    } catch (_) {
      photoCache[path] = null;
      return null;
    }
  }

  // Pre-load every photo referenced by the report before laying out pages —
  // pw.Document build callbacks must be synchronous.
  for (final booking in report.bookings) {
    await loadPhoto(booking.idFrontPath);
    await loadPhoto(booking.idBackPath);
    for (final guest in booking.guests) {
      await loadPhoto(guest.idFrontPath);
      await loadPhoto(guest.idBackPath);
    }
  }

  pw.Widget photoBox(String label, String? path) {
    final image = path != null ? photoCache[path] : null;
    return pw.Expanded(
      child: pw.Column(
        crossAxisAlignment: pw.CrossAxisAlignment.start,
        children: [
          pw.Text(label, style: const pw.TextStyle(fontSize: 8, color: PdfColors.grey700)),
          pw.SizedBox(height: 2),
          pw.Container(
            height: 90,
            decoration: pw.BoxDecoration(border: pw.Border.all(color: PdfColors.grey400, width: 0.5)),
            alignment: pw.Alignment.center,
            child: image != null
                ? pw.Image(image, fit: pw.BoxFit.contain)
                : pw.Text(path == null ? 'Not collected' : 'Photo unavailable', style: const pw.TextStyle(fontSize: 8, color: PdfColors.grey500)),
          ),
        ],
      ),
    );
  }

  pw.Widget fieldsTable(Map<String, String> fields) {
    return pw.Table(
      columnWidths: const {0: pw.FlexColumnWidth(1.1), 1: pw.FlexColumnWidth(2)},
      children: fields.entries
          .map((e) => pw.TableRow(children: [
                pw.Padding(padding: const pw.EdgeInsets.symmetric(vertical: 2), child: pw.Text(e.key, style: const pw.TextStyle(fontSize: 9, color: PdfColors.grey700))),
                pw.Padding(padding: const pw.EdgeInsets.symmetric(vertical: 2), child: pw.Text(e.value, style: const pw.TextStyle(fontSize: 9))),
              ]))
          .toList(),
    );
  }

  pw.Widget bookingBlock(ReportBooking booking) {
    final statusLabel = booking.departedOnDate
        ? 'Checked out this day'
        : booking.arrivedOnDate
            ? 'Arrived this day'
            : 'Continuing stay';
    return pw.Container(
      margin: const pw.EdgeInsets.only(bottom: 14),
      padding: const pw.EdgeInsets.all(10),
      decoration: pw.BoxDecoration(border: pw.Border.all(color: PdfColors.grey400, width: 0.75)),
      child: pw.Column(
        crossAxisAlignment: pw.CrossAxisAlignment.start,
        children: [
          pw.Row(
            mainAxisAlignment: pw.MainAxisAlignment.spaceBetween,
            children: [
              pw.Text('Room ${booking.roomNumber}  ·  ${booking.customerCode}', style: pw.TextStyle(fontSize: 11, fontWeight: pw.FontWeight.bold)),
              pw.Text(statusLabel, style: const pw.TextStyle(fontSize: 9, color: PdfColors.grey700)),
            ],
          ),
          pw.SizedBox(height: 6),
          fieldsTable({
            'Name': booking.name,
            'Address': booking.address,
            'Phone': booking.phone,
            'Number of persons': booking.numberOfPersons.toString(),
            'Checked in': formatDateTime(booking.checkInDate),
            'Checked out': booking.checkOutDate != null ? formatDateTime(booking.checkOutDate) : 'Still staying',
          }),
          pw.SizedBox(height: 8),
          pw.Text('ID proof — ${booking.name}', style: const pw.TextStyle(fontSize: 9, fontWeight: pw.FontWeight.bold)),
          pw.SizedBox(height: 4),
          pw.Row(children: [photoBox('Front', booking.idFrontPath), pw.SizedBox(width: 8), photoBox('Back', booking.idBackPath)]),
          if (booking.guests.isNotEmpty) ...[
            pw.SizedBox(height: 10),
            pw.Text('Other guests in this room (${booking.guests.length} recorded)', style: const pw.TextStyle(fontSize: 9, fontWeight: pw.FontWeight.bold)),
            ...booking.guests.asMap().entries.map((entry) {
              final index = entry.key;
              final guest = entry.value;
              return pw.Container(
                margin: const pw.EdgeInsets.only(top: 6),
                child: pw.Column(
                  crossAxisAlignment: pw.CrossAxisAlignment.start,
                  children: [
                    pw.Text('${index + 2}. ${guest.name}', style: const pw.TextStyle(fontSize: 9)),
                    pw.Text(guest.phone ?? 'No phone recorded', style: const pw.TextStyle(fontSize: 8, color: PdfColors.grey700)),
                    if (guest.idFrontPath != null || guest.idBackPath != null) ...[
                      pw.SizedBox(height: 4),
                      pw.Row(children: [photoBox('Front', guest.idFrontPath), pw.SizedBox(width: 8), photoBox('Back', guest.idBackPath)]),
                    ] else
                      pw.Text('No ID proof collected for this guest.', style: const pw.TextStyle(fontSize: 8, color: PdfColors.grey500)),
                  ],
                ),
              );
            }),
          ] else if (booking.numberOfPersons > 1)
            pw.Padding(
              padding: const pw.EdgeInsets.only(top: 8),
              child: pw.Text(
                'No details recorded for the other ${booking.numberOfPersons - 1} people in this room.',
                style: const pw.TextStyle(fontSize: 8, color: PdfColors.grey500),
              ),
            ),
        ],
      ),
    );
  }

  doc.addPage(
    pw.MultiPage(
      pageFormat: PdfPageFormat.a4.copyWith(marginLeft: 12 * PdfPageFormat.mm, marginRight: 12 * PdfPageFormat.mm, marginTop: 12 * PdfPageFormat.mm, marginBottom: 12 * PdfPageFormat.mm),
      header: (context) => context.pageNumber == 1
          ? pw.Column(
              crossAxisAlignment: pw.CrossAxisAlignment.start,
              children: [
                pw.Text(report.hotelName, style: pw.TextStyle(fontSize: 18, fontWeight: pw.FontWeight.bold)),
                if (report.hotelAddress.isNotEmpty) pw.Text(report.hotelAddress, style: const pw.TextStyle(fontSize: 9)),
                if (report.hotelPhone.isNotEmpty) pw.Text(report.hotelPhone, style: const pw.TextStyle(fontSize: 9)),
                pw.SizedBox(height: 8),
                pw.Text('Guest Report — ${report.dayLabel}', style: pw.TextStyle(fontSize: 13, fontWeight: pw.FontWeight.bold)),
                pw.SizedBox(height: 2),
                pw.Text(
                  '${report.totals.bookings} bookings · ${report.totals.rooms} rooms · ${report.totals.people} people · '
                  '${report.totals.arrivals} arrived · ${report.totals.departures} departed',
                  style: const pw.TextStyle(fontSize: 9, color: PdfColors.grey700),
                ),
                pw.SizedBox(height: 10),
                pw.Divider(color: PdfColors.grey400),
              ],
            )
          : pw.SizedBox(),
      footer: (context) => pw.Column(children: [
        pw.Divider(color: PdfColors.grey300),
        pw.Text('Generated ${formatDateTime(report.generatedAt)} · ${report.hotelName}', style: const pw.TextStyle(fontSize: 7, color: PdfColors.grey500)),
      ]),
      build: (context) => [
        if (report.bookings.isEmpty) pw.Text('No guests on this date.', style: const pw.TextStyle(fontSize: 10)) else ...report.bookings.map(bookingBlock),
      ],
    ),
  );

  return doc.save();
}
