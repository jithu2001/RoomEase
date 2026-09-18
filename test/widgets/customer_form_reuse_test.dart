import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:roomease/models/models.dart';
import 'package:roomease/pages/check_in/customer_form.dart';
import 'package:roomease/services/services.dart';

import '../helpers/memory_file_store.dart';
import '../helpers/test_db.dart';

const _returningGuest = Customer(
  id: 7,
  customerCode: 'CUS-0007',
  name: 'Anita Menon',
  address: '12 Beach Road, Kochi',
  phone: '9847012345',
  roomNumber: '101',
  numberOfPersons: 2,
  idFrontPath: 'front.jpg',
  idBackPath: 'back.jpg',
  checkInDate: '2026-01-02T10:00:00.000+05:30',
  checkOutDate: '2026-01-04T10:00:00.000+05:30',
  status: CustomerStatus.checkedOut,
  createdAt: '2026-01-02T10:00:00.000+05:30',
  updatedAt: '2026-01-04T10:00:00.000+05:30',
  idFrontThumbPath: null,
  idBackThumbPath: null,
  amountMinor: 250000,
);

/// Mimics the Check-In screen: the form is already on screen, and a returning
/// guest gets picked afterwards.
class _Host extends StatefulWidget {
  final Services services;
  const _Host({super.key, required this.services});

  @override
  State<_Host> createState() => _HostState();
}

class _HostState extends State<_Host> {
  Customer? reuseFrom;

  void select(Customer? customer) => setState(() => reuseFrom = customer);

  @override
  Widget build(BuildContext context) => MaterialApp(
        home: Scaffold(
          body: CustomerForm(
            services: widget.services,
            reuseFrom: reuseFrom,
            submitLabel: 'Save Check-In',
            onSubmit: (_, {front, back}) async {},
          ),
        ),
      );
}

String _fieldText(WidgetTester tester, String label) {
  final field = tester.widget<TextField>(
    find.ancestor(of: find.text(label), matching: find.byType(TextField)).first,
  );
  return field.controller!.text;
}

/// Pumps the form and lets the room-list query actually finish. Without
/// [WidgetTester.runAsync] that future never completes under fake async, and
/// the loading spinner leaves a ticker pending at teardown.
Future<void> _pumpForm(WidgetTester tester, GlobalKey<_HostState> key, Services services) async {
  await tester.runAsync(() async {
    await tester.pumpWidget(_Host(key: key, services: services));
    await Future<void>.delayed(const Duration(milliseconds: 250));
  });
  await tester.pump();
}

void main() {
  late Services services;

  setUp(() async {
    final driver = await openTestDatabase();
    services = createServices(driver, MemoryFileStore());
  });

  testWidgets('picking a returning guest fills name, address and phone', (tester) async {
    final key = GlobalKey<_HostState>();
    await _pumpForm(tester, key, services);

    expect(_fieldText(tester, 'Name'), isEmpty, reason: 'form starts blank');

    key.currentState!.select(_returningGuest);
    await tester.pump();

    expect(_fieldText(tester, 'Name'), 'Anita Menon');
    expect(_fieldText(tester, 'Address'), '12 Beach Road, Kochi');
    expect(_fieldText(tester, 'Phone'), '9847012345');
  });

  testWidgets('clearing the reuse leaves the entered details in place', (tester) async {
    final key = GlobalKey<_HostState>();
    await _pumpForm(tester, key, services);

    key.currentState!.select(_returningGuest);
    await tester.pump();
    key.currentState!.select(null);
    await tester.pump();

    // Photo reuse can fail and clear reuseFrom on its own; wiping the typed
    // details in that case would make staff re-enter everything.
    expect(_fieldText(tester, 'Name'), 'Anita Menon');
  });
}
