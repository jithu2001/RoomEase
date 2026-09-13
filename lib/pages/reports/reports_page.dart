import 'package:flutter/material.dart';
import 'package:printing/printing.dart';
import 'package:provider/provider.dart';

import '../../pdf/report_pdf.dart';
import '../../services/report_service.dart';
import '../../state/app_state.dart';
import '../../utils/app_date.dart';
import '../../widgets/app_scaffold.dart';
import '../../widgets/feedback.dart';

/// Printable guest register for a chosen date — mirrors `pages/Reports/Reports.tsx`.
class ReportsPage extends StatefulWidget {
  const ReportsPage({super.key});

  @override
  State<ReportsPage> createState() => _ReportsPageState();
}

class _ReportsPageState extends State<ReportsPage> {
  DateTime _date = DateTime.now();
  DayReport? _report;
  String? _error;
  bool _loading = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    final appState = context.read<AppState>();
    try {
      final report = await appState.services.reports.buildDayReport(toDayKey(_date));
      if (mounted) setState(() => _report = report);
    } catch (e) {
      if (mounted) setState(() => _error = e.toString());
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _pickDate() async {
    final picked = await showDatePicker(context: context, initialDate: _date, firstDate: DateTime(2000), lastDate: DateTime.now());
    if (picked != null) {
      setState(() => _date = picked);
      _load();
    }
  }

  @override
  Widget build(BuildContext context) {
    final appState = context.watch<AppState>();
    return AppScaffold(
      tab: AppTab.dashboard,
      title: 'Guest Report',
      showBack: true,
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                OutlinedButton.icon(
                  onPressed: _pickDate,
                  icon: const Icon(Icons.calendar_today_outlined, size: 18),
                  label: Text(formatDate(toIso(_date))),
                ),
                const SizedBox(height: 8),
                const Notice(message: 'Payment amounts are never included in this report.', kind: NoticeKind.info),
              ],
            ),
          ),
          Expanded(
            child: _error != null
                ? ErrorState(message: _error!, onRetry: _load)
                : _loading || _report == null
                    ? const InlineLoading()
                    : _report!.bookings.isEmpty
                        ? const EmptyState(glyph: '📄', title: 'No guests on this date')
                        : PdfPreview(
                            key: ValueKey(_report!.day),
                            build: (format) => buildReportPdf(_report!, appState.services.images),
                            allowPrinting: true,
                            allowSharing: true,
                            canChangePageFormat: false,
                            canChangeOrientation: false,
                            useActions: true,
                          ),
          ),
        ],
      ),
    );
  }
}
