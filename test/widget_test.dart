import 'package:flutter_test/flutter_test.dart';
import 'package:roomease/app.dart';

void main() {
  testWidgets('boots to the loading screen without throwing', (tester) async {
    await tester.pumpWidget(const RoomEaseApp());
    // The database opens asynchronously; the first frame should be the
    // boot-loading screen, not a crash.
    expect(find.text('Opening local database…'), findsOneWidget);
  });
}
