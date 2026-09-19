import 'dart:typed_data';

import 'package:image_picker/image_picker.dart';
import 'package:permission_handler/permission_handler.dart';

import '../models/models.dart';
import '../utils/app_error.dart';
import '../utils/image_compression.dart';
import 'file_store.dart';

enum PhotoSide {
  front('front'),
  back('back');

  final String value;
  const PhotoSide(this.value);
}

class StoredIdImage {
  final String path;
  final String thumbPath;
  final int bytes;
  const StoredIdImage({required this.path, required this.thumbPath, required this.bytes});
}

({String full, String thumb}) _idImageNames(PhotoSide side) =>
    (full: 'id-${side.value}.jpg', thumb: 'id-${side.value}-thumb.jpg');

/// Capture, compression, and on-device storage of ID photos.
class ImageService {
  final FileStore files;
  final ImagePicker _picker;
  ImageService(this.files, {ImagePicker? picker}) : _picker = picker ?? ImagePicker();

  /// Null means the user cancelled — not an error.
  Future<PreparedImage?> captureIdImage(ImageSource source) async {
    if (source == ImageSource.camera) {
      final status = await Permission.camera.request();
      if (!status.isGranted) {
        throw const AppError(
          AppErrorCode.cameraPermission,
          'Camera access is off for this app. Enable it from Android Settings > Apps > '
          'Hotel Manager > Permissions to take ID photos.',
        );
      }
    }
    XFile? picked;
    try {
      // Pre-shrink to 1600px wide before the compression pass below — keeps
      // memory pressure down for a full-resolution phone camera photo.
      picked = await _picker.pickImage(source: source, maxWidth: 1600, imageQuality: 90);
    } catch (e) {
      throw AppError(
        source == ImageSource.camera ? AppErrorCode.cameraUnavailable : AppErrorCode.invalidImage,
        'The camera could not be opened. Please try again.',
        e,
      );
    }
    if (picked == null) return null;
    final bytes = await picked.readAsBytes();
    return compressImage(bytes);
  }

  Future<StoredIdImage> storeIdImage(String customerCode, PhotoSide side, PreparedImage image) async {
    final dir = customerDir(customerCode);
    final names = _idImageNames(side);
    final fullPath = '$dir/${names.full}';
    final thumbPath = '$dir/${names.thumb}';
    await files.write(fullPath, Uint8List.fromList(image.full));
    await files.write(thumbPath, Uint8List.fromList(image.thumb));
    return StoredIdImage(path: fullPath, thumbPath: thumbPath, bytes: image.bytes);
  }

  Future<StoredIdImage> storeGuestIdImage(
    String customerCode,
    int guestId,
    PhotoSide side,
    PreparedImage image,
  ) async {
    final dir = guestDir(customerCode, guestId);
    final names = _idImageNames(side);
    final fullPath = '$dir/${names.full}';
    final thumbPath = '$dir/${names.thumb}';
    await files.write(fullPath, Uint8List.fromList(image.full));
    await files.write(thumbPath, Uint8List.fromList(image.thumb));
    return StoredIdImage(path: fullPath, thumbPath: thumbPath, bytes: image.bytes);
  }

  /// Copies a returning guest's stored ID photos into the new booking's
  /// folder. Throws [AppErrorCode.missingFile] if the source file is gone.
  Future<void> copyIdImages(Customer from, String toCustomerCode) async {
    await _copyOneSide(from.idFrontPath, toCustomerCode, PhotoSide.front);
    await _copyOneSide(from.idBackPath, toCustomerCode, PhotoSide.back);
  }

  Future<void> _copyOneSide(String sourcePath, String toCustomerCode, PhotoSide side) async {
    late final Uint8List fullBytes;
    try {
      fullBytes = await files.read(sourcePath);
    } catch (e) {
      throw AppError(
        AppErrorCode.missingFile,
        'A previous ID photo could not be found on this device. Please retake it.',
        e,
      );
    }
    final names = _idImageNames(side);
    final dir = customerDir(toCustomerCode);
    await files.write('$dir/${names.full}', fullBytes);

    Uint8List thumbBytes;
    final sourceThumbPath = sourcePath.replaceAll(RegExp(r'\.jpg$'), '-thumb.jpg');
    try {
      thumbBytes = await files.read(sourceThumbPath);
    } catch (_) {
      // Pre-thumbnail records (or a missing thumb): fall back to the full image.
      thumbBytes = fullBytes;
    }
    await files.write('$dir/${names.thumb}', thumbBytes);
  }

  Future<void> removeGuestImages(String customerCode, int guestId) =>
      files.removeDir(guestDir(customerCode, guestId));

  Future<void> removeCustomerImages(String customerCode, [List<String> extraPaths = const []]) async {
    for (final path in extraPaths) {
      await files.remove(path);
    }
    await files.removeDir(customerDir(customerCode));
  }

  Future<bool> exists(String path) => files.exists(path);

  /// Absolute path for `Image.file`, or null if the file is missing. Never throws.
  Future<String?> resolvePath(String? path) async {
    if (path == null || path.isEmpty) return null;
    try {
      return await files.resolveForDisplay(path);
    } catch (_) {
      return null;
    }
  }

  /// Prefers the thumbnail, falling back to the full image.
  Future<String?> previewPath(String? thumbPath, String? fullPath) async {
    final thumb = await resolvePath(thumbPath);
    if (thumb != null) return thumb;
    return resolvePath(fullPath);
  }
}
