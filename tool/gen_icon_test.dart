// Generator for the app launcher icon's source PNGs: a white bed mark on the
// brand blue background, reproducing the original app's `ic_hotel_mark.xml`
// vector at 1024x1024. Not part of the normal test suite (lives outside
// test/, so `flutter test` never runs it); regenerate the icon with:
//   flutter test tool/gen_icon_test.dart && dart run flutter_launcher_icons
import 'dart:io';
import 'dart:typed_data';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

Future<void> _render({required bool withBackground, required String outPath}) async {
  const size = 1024.0;
  const scale = size / 108;
  final recorder = ui.PictureRecorder();
  final canvas = Canvas(recorder);

  if (withBackground) {
    canvas.drawRect(const Rect.fromLTWH(0, 0, size, size), Paint()..color = const Color(0xFF0F4C81));
  }

  final white = Paint()..color = Colors.white;
  void stadium(double x, double y, double w, double h, double r) {
    canvas.drawRRect(
      RRect.fromRectAndRadius(Rect.fromLTWH(x * scale, y * scale, w * scale, h * scale), Radius.circular(r * scale)),
      white,
    );
  }

  stadium(24, 34, 9, 38, 4.5); // headboard bar
  stadium(37, 42, 17, 11, 5.5); // pillow
  stadium(33, 53, 51, 13, 6.5); // mattress
  stadium(24, 66, 60, 6, 3); // base line

  final picture = recorder.endRecording();
  final image = await picture.toImage(size.toInt(), size.toInt());
  final bytes = await image.toByteData(format: ui.ImageByteFormat.png);
  File(outPath).writeAsBytesSync((bytes as ByteData).buffer.asUint8List());
}

void main() {
  testWidgets('generate launcher icon (flat, for legacy/web icons)', (tester) async {
    await _render(withBackground: true, outPath: 'assets/icon/icon.png');
  });

  testWidgets('generate launcher icon foreground (transparent, for adaptive icons)', (tester) async {
    await _render(withBackground: false, outPath: 'assets/icon/icon_foreground.png');
  });
}
