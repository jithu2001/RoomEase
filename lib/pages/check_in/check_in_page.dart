import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import '../../models/models.dart';
import '../../services/customer_service.dart';
import '../../state/app_state.dart';
import '../../widgets/app_scaffold.dart';
import '../../widgets/feedback.dart';
import '../../widgets/returning_guest_search.dart';
import 'customer_form.dart';

class CheckInPage extends StatefulWidget {
  const CheckInPage({super.key});

  @override
  State<CheckInPage> createState() => _CheckInPageState();
}

class _CheckInPageState extends State<CheckInPage> {
  String? _nextCode;
  Customer? _reuseFrom;

  @override
  void initState() {
    super.initState();
    _loadNextCode();
  }

  Future<void> _loadNextCode() async {
    final appState = context.read<AppState>();
    final code = await appState.services.customers.nextCode();
    if (mounted) setState(() => _nextCode = code);
  }

  Future<void> _onGuestSelected(GuestMatch match) async {
    final appState = context.read<AppState>();
    try {
      final customer = await appState.services.customers.get(match.customerId);
      if (!mounted) return;
      setState(() => _reuseFrom = customer);
      if (match.hasIdPhotos) {
        context.showInfoToast('Details filled in. ID photos will be reused from their last stay.');
      } else {
        context.showInfoToast('Details filled in, but no ID photos are on file — please capture new ones.');
      }
    } catch (e) {
      if (mounted) context.showErrorToast(e);
    }
  }

  @override
  Widget build(BuildContext context) {
    final appState = context.watch<AppState>();
    return AppScaffold(
      tab: AppTab.checkIn,
      title: 'New Check-In',
      subtitle: _nextCode,
      body: Column(
        children: [
          if (_reuseFrom == null)
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 0),
              child: ReturningGuestSearch(customers: appState.services.customers, onSelect: _onGuestSelected),
            ),
          Expanded(
            child: CustomerForm(
              services: appState.services,
              reuseFrom: _reuseFrom,
              onClearReuse: () => setState(() => _reuseFrom = null),
              onReuseMissingFile: () => setState(() => _reuseFrom = null),
              submitLabel: 'Save Check-In',
              onSubmit: (values, {front, back}) async {
                final customer = await appState.services.customers.checkIn(
                  values,
                  CheckInImages(front: front, back: back, reuseFromCustomerId: _reuseFrom?.id),
                );
                appState.invalidateData();
                if (!mounted) return;
                // ignore: use_build_context_synchronously
                context.showSuccessToast('${customer.name} checked in to room ${customer.roomNumber}');
                // ignore: use_build_context_synchronously
                context.go('/customers/${customer.id}');
              },
            ),
          ),
        ],
      ),
    );
  }
}
