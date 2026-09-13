import 'package:flutter/material.dart';

/// A full-screen, pinch-to-zoom photo viewer — shared by [IdPhotoViewer]
/// (read-only photos on Customer Details) and [IdPhotoField] (the
/// check-in/edit form's own preview), so staff can always zoom in to check
/// small print on an ID document, whether it's a saved photo or one just
/// captured.
class FullScreenImageViewer extends StatelessWidget {
  final String label;
  final Widget child;
  const FullScreenImageViewer({super.key, required this.label, required this.child});

  /// Pushes the viewer as a full-screen route. [child] should resolve to an
  /// `Image` (wrap in a `FutureBuilder` first if the source needs async
  /// resolution, e.g. a stored file path).
  static void show(BuildContext context, {required String label, required Widget child}) {
    Navigator.of(context).push(MaterialPageRoute<void>(
      fullscreenDialog: true,
      builder: (context) => FullScreenImageViewer(label: label, child: child),
    ));
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      appBar: AppBar(
        backgroundColor: Colors.black,
        foregroundColor: Colors.white,
        title: Text(label),
      ),
      body: Center(
        child: InteractiveViewer(
          minScale: 1,
          maxScale: 6,
          child: child,
        ),
      ),
    );
  }
}
