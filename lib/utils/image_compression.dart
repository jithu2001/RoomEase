/// ID photo compression pipeline — mirrors `src/utils/imageCompression.ts`.
/// Resizes to at most 800x600 (never upscaling), then re-encodes as JPEG,
/// stepping quality down from 60 to a floor of 40 until the result is under
/// 150KB (best-effort — a very busy photo may still exceed it at the
/// floor). A separate ~240x240-boxed thumbnail is produced at a fixed
/// quality. Re-encoding through the `image` package drops all EXIF/GPS
/// metadata as a side effect — deliberate, for ID photo privacy.
library;

import 'dart:typed_data';

import 'package:image/image.dart' as img;

import '../models/models.dart';
import 'app_error.dart';

const maxWidth = 800;
const maxHeight = 600;
const startQuality = 60;
const minQuality = 40;
const maxBytes = 150 * 1024;
const thumbMaxWidth = 240;
const thumbQuality = 50;

/// Rejects a source file over this size before it's even decoded.
const maxSourceBytes = 40 * 1024 * 1024;

class _Size {
  final int width;
  final int height;
  const _Size(this.width, this.height);
}

/// Never upscales: `scale = min(1, maxW/w, maxH/h)`.
_Size _computeTargetSize(int sourceWidth, int sourceHeight, int boxWidth, int boxHeight) {
  if (sourceWidth <= 0 || sourceHeight <= 0) {
    throw const AppError(AppErrorCode.invalidImage, 'That photo could not be read.');
  }
  final scale = [1.0, boxWidth / sourceWidth, boxHeight / sourceHeight].reduce((a, b) => a < b ? a : b);
  final width = (sourceWidth * scale).floor().clamp(1, sourceWidth);
  final height = (sourceHeight * scale).floor().clamp(1, sourceHeight);
  return _Size(width, height);
}

String formatBytes(int bytes) {
  if (bytes < 1024) return '$bytes B';
  if (bytes < 1024 * 1024) return '${(bytes / 1024).toStringAsFixed(0)} KB';
  return '${(bytes / (1024 * 1024)).toStringAsFixed(1)} MB';
}

PreparedImage compressImage(Uint8List sourceBytes) {
  if (sourceBytes.isEmpty) {
    throw const AppError(AppErrorCode.invalidImage, 'That photo appears to be empty.');
  }
  if (sourceBytes.length > maxSourceBytes) {
    throw const AppError(AppErrorCode.invalidImage, 'That photo is too large to use.');
  }
  img.Image? decoded;
  try {
    decoded = img.decodeImage(sourceBytes);
  } catch (e) {
    throw AppError(AppErrorCode.invalidImage, 'That file is not a supported photo format.', e);
  }
  if (decoded == null) {
    throw const AppError(AppErrorCode.invalidImage, 'That file is not a supported photo format.');
  }
  decoded = img.bakeOrientation(decoded);

  final target = _computeTargetSize(decoded.width, decoded.height, maxWidth, maxHeight);
  final resized = img.copyResize(
    decoded,
    width: target.width,
    height: target.height,
    interpolation: img.Interpolation.average,
  );

  var quality = startQuality;
  var fullBytes = Uint8List.fromList(img.encodeJpg(resized, quality: quality));
  while (fullBytes.length > maxBytes && quality > minQuality) {
    quality = (quality - 5).clamp(minQuality, startQuality);
    fullBytes = Uint8List.fromList(img.encodeJpg(resized, quality: quality));
    if (quality == minQuality) break;
  }
  if (fullBytes.isEmpty) {
    throw const AppError(AppErrorCode.imageCompression, 'The photo could not be compressed.');
  }

  final thumbTarget = _computeTargetSize(decoded.width, decoded.height, thumbMaxWidth, thumbMaxWidth);
  final thumbResized = img.copyResize(
    decoded,
    width: thumbTarget.width,
    height: thumbTarget.height,
    interpolation: img.Interpolation.average,
  );
  final thumbBytes = Uint8List.fromList(img.encodeJpg(thumbResized, quality: thumbQuality));

  return PreparedImage(
    full: fullBytes,
    thumb: thumbBytes,
    width: target.width,
    height: target.height,
    bytes: fullBytes.length,
  );
}
