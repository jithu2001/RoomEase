import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

/// Small, deliberately restrained motion helpers.
///
/// Page-to-page navigation uses [noTransitionPage] — an instant swap with no
/// fade/slide — because this is a front-desk tool staff use quickly and
/// repeatedly; a cross-fade page transition (tried first) reads as a
/// distracting "flash" on every tap rather than polish. The remaining
/// animation in the app is scoped to within a single screen (list items
/// easing in, the PIN dots filling in), never a full-screen transition.
class AppMotion {
  static const Duration duration = Duration(milliseconds: 300);
  static const Curve curve = Curves.easeInOutCubicEmphasized;

  /// Stagger delay between successive items in a list's entrance animation.
  static const Duration listStagger = Duration(milliseconds: 40);
  static const Duration listItemDuration = Duration(milliseconds: 260);
}

/// An instant route transition — no fade, no slide, no flash.
Page<void> noTransitionPage({required LocalKey key, required Widget child}) {
  return CustomTransitionPage<void>(
    key: key,
    child: child,
    transitionDuration: Duration.zero,
    reverseTransitionDuration: Duration.zero,
    transitionsBuilder: (context, animation, secondaryAnimation, child) => child,
  );
}

/// A single list item's entrance: fades and slides up slightly, staggered
/// by [index] so a freshly-loaded list animates in as a cascade rather than
/// popping in all at once. Purely cosmetic — safe to wrap around anything.
class StaggeredEntrance extends StatelessWidget {
  final int index;
  final Widget child;
  const StaggeredEntrance({super.key, required this.index, required this.child});

  @override
  Widget build(BuildContext context) {
    // Cap the stagger so a long list (paginated "load more", etc.) doesn't
    // make late items wait several seconds to appear.
    final delay = AppMotion.listStagger * index.clamp(0, 10);
    return TweenAnimationBuilder<double>(
      key: ValueKey(index),
      tween: Tween(begin: 0, end: 1),
      duration: AppMotion.listItemDuration + delay,
      curve: Interval(
        (delay.inMilliseconds / (AppMotion.listItemDuration + delay).inMilliseconds).clamp(0.0, 0.9),
        1.0,
        curve: Curves.easeOutCubic,
      ),
      builder: (context, value, child) => Opacity(
        opacity: value,
        child: Transform.translate(offset: Offset(0, (1 - value) * 16), child: child),
      ),
      child: child,
    );
  }
}
