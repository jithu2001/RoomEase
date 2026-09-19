import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import '../../models/models.dart';
import '../../services/customer_service.dart';
import '../../state/app_state.dart';
import '../../widgets/app_scaffold.dart';
import '../../widgets/feedback.dart';
import '../check_in/customer_form.dart';

class EditCustomerPage extends StatefulWidget {
  final int customerId;
  const EditCustomerPage({super.key, required this.customerId});

  @override
  State<EditCustomerPage> createState() => _EditCustomerPageState();
}

class _EditCustomerPageState extends State<EditCustomerPage> {
  late Future<Customer> _future;

  @override
  void initState() {
    super.initState();
    _future = context.read<AppState>().services.customers.get(widget.customerId);
  }

  @override
  Widget build(BuildContext context) {
    final appState = context.watch<AppState>();
    return AppScaffold(
      tab: AppTab.customers,
      title: 'Edit Customer',
      showBack: true,
      body: FutureBuilder<Customer>(
        future: _future,
        builder: (context, snapshot) {
          if (snapshot.connectionState != ConnectionState.done) return const InlineLoading();
          if (snapshot.hasError) {
            return ErrorState(
              message: snapshot.error.toString(),
              onRetry: () => setState(() => _future = appState.services.customers.get(widget.customerId)),
            );
          }
          final customer = snapshot.data!;
          return CustomerForm(
            services: appState.services,
            existing: customer,
            submitLabel: 'Save Changes',
            onSubmit: (values, {front, back}) async {
              await appState.services.customers.update(customer.id, values, UpdateImages(front: front, back: back));
              appState.invalidateData();
              if (!mounted) return;
              // ignore: use_build_context_synchronously
              context.showSuccessToast('Customer details updated');
              // ignore: use_build_context_synchronously
              context.go('/customers/${customer.id}');
            },
          );
        },
      ),
    );
  }
}
