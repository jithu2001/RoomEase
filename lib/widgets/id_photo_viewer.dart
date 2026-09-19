import 'dart:io';

import 'package:flutter/material.dart';

import '../services/image_service.dart';
import 'full_screen_image_viewer.dart';

/// Read-only ID photo viewer for a detail screen — a 2-column thumbnail
/// grid that opens a full-screen viewer on tap. Mirrors
/// `components/IdPhotoViewer.tsx`.
class IdPhotoViewer extends StatelessWidget {
  final ImageService images;
  final String? frontPath;
  final String? frontThumbPath;
  final String? backPath;
  final String? backThumbPath;

  const IdPhotoViewer({
    super.key,
    required this.images,
    required this.frontPath,
    required this.frontThumbPath,
    required this.backPath,
    required this.backThumbPath,
  });

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Expanded(child: _Thumb(images: images, label: 'ID Front', path: frontPath, thumbPath: frontThumbPath)),
        const SizedBox(width: 12),
        Expanded(child: _Thumb(images: images, label: 'ID Back', path: backPath, thumbPath: backThumbPath)),
      ],
    );
  }
}

class _Thumb extends StatelessWidget {
  final ImageService images;
  final String label;
  final String? path;
  final String? thumbPath;
  const _Thumb({required this.images, required this.label, required this.path, required this.thumbPath});

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(label, style: Theme.of(context).textTheme.labelMedium),
        const SizedBox(height: 6),
        AspectRatio(
          aspectRatio: 4 / 3,
          child: Material(
            color: scheme.surfaceContainerHighest.withValues(alpha: 0.4),
            borderRadius: BorderRadius.circular(12),
            clipBehavior: Clip.antiAlias,
            child: InkWell(
              onTap: () => _openViewer(context),
              child: FutureBuilder<String?>(
                future: images.previewPath(thumbPath, path),
                builder: (context, snapshot) {
                  if (!snapshot.hasData) return const Center(child: CircularProgressIndicator());
                  final resolved = snapshot.data;
                  if (resolved == null) {
                    return Center(
                      child: Padding(
                        padding: const EdgeInsets.all(8),
                        child: Text('Photo missing on this device',
                            textAlign: TextAlign.center, style: TextStyle(color: scheme.onSurfaceVariant, fontSize: 12)),
                      ),
                    );
                  }
                  return Image.file(File(resolved), fit: BoxFit.cover);
                },
              ),
            ),
          ),
        ),
      ],
    );
  }

  void _openViewer(BuildContext context) {
    FullScreenImageViewer.show(
      context,
      label: label,
      child: FutureBuilder<String?>(
        future: images.resolvePath(path),
        builder: (context, snapshot) {
          if (!snapshot.hasData) return const CircularProgressIndicator(color: Colors.white);
          final resolved = snapshot.data;
          if (resolved == null) {
            return const Text('This photo is no longer stored on this device.', style: TextStyle(color: Colors.white70));
          }
          return Image.file(File(resolved));
        },
      ),
    );
  }
}
