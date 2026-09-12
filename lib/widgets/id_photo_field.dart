import 'dart:io';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';

import '../models/models.dart';
import '../services/image_service.dart';
import '../utils/image_compression.dart' as compression;
import 'feedback.dart';

/// One side of an ID photo capture control (front/back) — mirrors
/// `components/IdPhotoField.tsx`. Shows either a freshly-captured preview, an
/// already-stored photo, or an empty placeholder; offers camera/gallery
/// capture and, only for a fresh capture, a way to discard it.
class IdPhotoField extends StatefulWidget {
  final String label;
  final ImageService images;
  final String? existingPath;
  final String? existingThumbPath;
  final bool required;
  final bool disabled;
  final ValueChanged<PreparedImage?> onChanged;

  const IdPhotoField({
    super.key,
    required this.label,
    required this.images,
    required this.onChanged,
    this.existingPath,
    this.existingThumbPath,
    this.required = true,
    this.disabled = false,
  });

  @override
  State<IdPhotoField> createState() => _IdPhotoFieldState();
}

class _IdPhotoFieldState extends State<IdPhotoField> {
  PreparedImage? _captured;
  bool _busy = false;

  bool get _hasExisting => (widget.existingPath ?? '').isNotEmpty;

  Future<void> _capture(ImageSource source) async {
    if (_busy || widget.disabled) return;
    setState(() => _busy = true);
    try {
      final image = await widget.images.captureIdImage(source);
      if (!mounted) return;
      if (image != null) {
        setState(() => _captured = image);
        widget.onChanged(image);
        context.showSuccessToast('${widget.label} captured (${compression.formatBytes(image.bytes)})');
      }
    } catch (e) {
      if (mounted) context.showErrorToast(e);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  void _discard() {
    setState(() => _captured = null);
    widget.onChanged(null);
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text.rich(
          TextSpan(
            text: widget.label,
            style: Theme.of(context).textTheme.labelLarge,
            children: widget.required ? const [TextSpan(text: ' *', style: TextStyle(color: Colors.red))] : null,
          ),
        ),
        const SizedBox(height: 8),
        AspectRatio(
          aspectRatio: 4 / 3,
          child: Container(
            decoration: BoxDecoration(
              color: scheme.surfaceContainerHighest.withValues(alpha: 0.4),
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: scheme.outlineVariant),
            ),
            clipBehavior: Clip.antiAlias,
            child: _buildPreview(),
          ),
        ),
        const SizedBox(height: 4),
        if (_captured != null)
          Text('Compressed to ${_captured!.width}×${_captured!.height} · ${compression.formatBytes(_captured!.bytes)}',
              style: Theme.of(context).textTheme.bodySmall)
        else if (_hasExisting)
          Text('Saved photo', style: Theme.of(context).textTheme.bodySmall),
        const SizedBox(height: 8),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            OutlinedButton.icon(
              onPressed: _busy || widget.disabled ? null : () => _capture(ImageSource.camera),
              icon: const Icon(Icons.photo_camera_outlined, size: 18),
              label: Text(_hasExisting || _captured != null ? 'Retake' : 'Take Photo'),
              style: OutlinedButton.styleFrom(minimumSize: const Size(0, 40)),
            ),
            OutlinedButton.icon(
              onPressed: _busy || widget.disabled ? null : () => _capture(ImageSource.gallery),
              icon: const Icon(Icons.image_outlined, size: 18),
              label: Text(_hasExisting || _captured != null ? 'Reselect' : 'Choose Photo'),
              style: OutlinedButton.styleFrom(minimumSize: const Size(0, 40)),
            ),
            if (_captured != null)
              TextButton(onPressed: widget.disabled ? null : _discard, child: const Text('Discard this photo')),
          ],
        ),
      ],
    );
  }

  Widget _buildPreview() {
    if (_busy) return const Center(child: CircularProgressIndicator());
    if (_captured != null) {
      return Image.memory(Uint8List.fromList(_captured!.full), fit: BoxFit.cover);
    }
    if (_hasExisting) {
      return FutureBuilder<String?>(
        future: widget.images.previewPath(widget.existingThumbPath, widget.existingPath),
        builder: (context, snapshot) {
          if (!snapshot.hasData) return const Center(child: CircularProgressIndicator());
          final path = snapshot.data;
          if (path == null) return const _MissingPhoto();
          return Image.file(File(path), fit: BoxFit.cover);
        },
      );
    }
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Text(
          'No photo yet. Take or choose the ${widget.label.toLowerCase()} photo.',
          textAlign: TextAlign.center,
          style: TextStyle(color: Theme.of(context).colorScheme.onSurfaceVariant),
        ),
      ),
    );
  }
}

class _MissingPhoto extends StatelessWidget {
  const _MissingPhoto();

  @override
  Widget build(BuildContext context) => Center(
        child: Text('Photo missing on this device', style: TextStyle(color: Theme.of(context).colorScheme.onSurfaceVariant)),
      );
}
