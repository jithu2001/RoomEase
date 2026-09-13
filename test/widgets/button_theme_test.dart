import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:roomease/theme/app_theme.dart';

/// Regression test for a real crash: the app-wide button theme once used
/// `Size.fromHeight(48)` as a minimum size, which sets minimum *width* to
/// `double.infinity`. That's harmless when a button's parent hands it a
/// tight width constraint (a stretching Column, an explicit
/// `SizedBox(width: double.infinity, ...)`), but a `Row` hands a
/// non-Expanded/non-Flexible child *unbounded* width — nothing finite to
/// clamp an infinite minimum down to — which crashed the Rooms page's
/// "Add" button (a FilledButton next to a TextField in a Row) with
/// "RenderBox was not laid out". This pumps that exact shape for every
/// themed button type and asserts it renders without throwing.
void main() {
  Future<void> pumpRowButton(WidgetTester tester, Widget button) async {
    await tester.pumpWidget(MaterialApp(
      theme: appLightTheme,
      home: Scaffold(
        body: Row(
          children: [
            const Expanded(child: TextField()),
            const SizedBox(width: 12),
            button,
          ],
        ),
      ),
    ));
    await tester.pumpAndSettle();
  }

  testWidgets('FilledButton next to an Expanded field in a Row does not crash', (tester) async {
    await pumpRowButton(tester, FilledButton(onPressed: () {}, child: const Text('Add')));
    expect(tester.takeException(), isNull);
    expect(find.text('Add'), findsOneWidget);
  });

  testWidgets('OutlinedButton next to an Expanded field in a Row does not crash', (tester) async {
    await pumpRowButton(tester, OutlinedButton(onPressed: () {}, child: const Text('Add')));
    expect(tester.takeException(), isNull);
    expect(find.text('Add'), findsOneWidget);
  });

  testWidgets('a full-width FilledButton inside a stretching Column still fills the width', (tester) async {
    final key = GlobalKey();
    await tester.pumpWidget(MaterialApp(
      theme: appLightTheme,
      home: Scaffold(
        body: SizedBox(
          width: 300,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [FilledButton(key: key, onPressed: () {}, child: const Text('Save'))],
          ),
        ),
      ),
    ));
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
    expect(tester.getSize(find.byKey(key)).width, 300);
  });
}
