import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:image/image.dart' as img;
import 'package:roomease/utils/app_error.dart';
import 'package:roomease/utils/image_compression.dart';

Uint8List _syntheticJpeg(int width, int height) {
  final image = img.Image(width: width, height: height);
  img.fill(image, color: img.ColorRgb8(200, 100, 50));
  // A little variance so JPEG compression has real work to do.
  for (var y = 0; y < height; y += 4) {
    for (var x = 0; x < width; x += 4) {
      image.setPixelRgb(x, y, (x * 37) % 255, (y * 53) % 255, (x + y) % 255);
    }
  }
  return Uint8List.fromList(img.encodeJpg(image, quality: 95));
}

void main() {
  test('never upscales a small source image', () {
    final source = _syntheticJpeg(100, 80);
    final prepared = compressImage(source);
    expect(prepared.width, lessThanOrEqualTo(100));
    expect(prepared.height, lessThanOrEqualTo(80));
  });

  test('downscales a large landscape photo to at most 800x600', () {
    final source = _syntheticJpeg(4000, 3000);
    final prepared = compressImage(source);
    expect(prepared.width, lessThanOrEqualTo(800));
    expect(prepared.height, lessThanOrEqualTo(600));
    // Aspect ratio preserved (4:3 source -> 4:3 output).
    expect((prepared.width / prepared.height - 4 / 3).abs() < 0.02, isTrue);
  });

  test('downscales a tall portrait photo preserving aspect ratio', () {
    final source = _syntheticJpeg(1200, 2400);
    final prepared = compressImage(source);
    expect(prepared.height, lessThanOrEqualTo(600));
    expect(prepared.width, lessThanOrEqualTo(800));
  });

  test('produces a full image and a smaller boxed thumbnail', () {
    final source = _syntheticJpeg(2000, 1500);
    final prepared = compressImage(source);
    expect(prepared.thumb.length, lessThan(prepared.full.length));
  });

  test('rejects an empty source', () {
    expect(() => compressImage(Uint8List(0)), throwsA(isA<AppError>()));
  });

  test('rejects unsupported/garbage bytes', () {
    expect(() => compressImage(Uint8List.fromList([1, 2, 3, 4, 5])), throwsA(isA<AppError>()));
  });
}
