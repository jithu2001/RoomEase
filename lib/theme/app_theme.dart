import 'package:flutter/material.dart';

/// The brand seed color from the original app's hand-rolled palette
/// (`--brand: #0f4c81`), now driving a full Material 3 dynamic color scheme.
const _seedColor = Color(0xFF0F4C81);

/// Status colors Material 3's [ColorScheme] doesn't define on its own
/// (it has error, but not a distinct "success"/"warning"). Mirrors the
/// original palette's `--accent` (available/positive) and `--warn` tokens.
class StatusColors extends ThemeExtension<StatusColors> {
  final Color success;
  final Color onSuccess;
  final Color successContainer;
  final Color onSuccessContainer;
  final Color warning;
  final Color onWarning;
  final Color warningContainer;
  final Color onWarningContainer;

  const StatusColors({
    required this.success,
    required this.onSuccess,
    required this.successContainer,
    required this.onSuccessContainer,
    required this.warning,
    required this.onWarning,
    required this.warningContainer,
    required this.onWarningContainer,
  });

  static const light = StatusColors(
    success: Color(0xFF0F8A5F),
    onSuccess: Color(0xFFFFFFFF),
    successContainer: Color(0xFFD3F3E3),
    onSuccessContainer: Color(0xFF00210F),
    warning: Color(0xFF8A6300),
    onWarning: Color(0xFFFFFFFF),
    warningContainer: Color(0xFFFFDEA1),
    onWarningContainer: Color(0xFF2A1800),
  );

  static const dark = StatusColors(
    success: Color(0xFF8CD9B3),
    onSuccess: Color(0xFF00391E),
    successContainer: Color(0xFF00522C),
    onSuccessContainer: Color(0xFFAEF4CA),
    warning: Color(0xFFFFC26B),
    onWarning: Color(0xFF462B00),
    warningContainer: Color(0xFF643F00),
    onWarningContainer: Color(0xFFFFDEA1),
  );

  @override
  StatusColors copyWith({
    Color? success,
    Color? onSuccess,
    Color? successContainer,
    Color? onSuccessContainer,
    Color? warning,
    Color? onWarning,
    Color? warningContainer,
    Color? onWarningContainer,
  }) =>
      StatusColors(
        success: success ?? this.success,
        onSuccess: onSuccess ?? this.onSuccess,
        successContainer: successContainer ?? this.successContainer,
        onSuccessContainer: onSuccessContainer ?? this.onSuccessContainer,
        warning: warning ?? this.warning,
        onWarning: onWarning ?? this.onWarning,
        warningContainer: warningContainer ?? this.warningContainer,
        onWarningContainer: onWarningContainer ?? this.onWarningContainer,
      );

  @override
  StatusColors lerp(ThemeExtension<StatusColors>? other, double t) {
    if (other is! StatusColors) return this;
    return StatusColors(
      success: Color.lerp(success, other.success, t)!,
      onSuccess: Color.lerp(onSuccess, other.onSuccess, t)!,
      successContainer: Color.lerp(successContainer, other.successContainer, t)!,
      onSuccessContainer: Color.lerp(onSuccessContainer, other.onSuccessContainer, t)!,
      warning: Color.lerp(warning, other.warning, t)!,
      onWarning: Color.lerp(onWarning, other.onWarning, t)!,
      warningContainer: Color.lerp(warningContainer, other.warningContainer, t)!,
      onWarningContainer: Color.lerp(onWarningContainer, other.onWarningContainer, t)!,
    );
  }
}

extension StatusColorsContext on BuildContext {
  StatusColors get statusColors => Theme.of(this).extension<StatusColors>() ?? StatusColors.light;
}

ThemeData _buildTheme(Brightness brightness) {
  final colorScheme = ColorScheme.fromSeed(seedColor: _seedColor, brightness: brightness);
  final status = brightness == Brightness.light ? StatusColors.light : StatusColors.dark;
  return ThemeData(
    useMaterial3: true,
    colorScheme: colorScheme,
    brightness: brightness,
    extensions: [status],
    appBarTheme: AppBarTheme(
      backgroundColor: colorScheme.surface,
      foregroundColor: colorScheme.onSurface,
      surfaceTintColor: colorScheme.surfaceTint,
      centerTitle: false,
      scrolledUnderElevation: 2,
    ),
    navigationBarTheme: NavigationBarThemeData(
      labelBehavior: NavigationDestinationLabelBehavior.alwaysShow,
    ),
    cardTheme: CardThemeData(
      elevation: 0,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(16),
        side: BorderSide(color: colorScheme.outlineVariant),
      ),
      margin: EdgeInsets.zero,
    ),
    inputDecorationTheme: InputDecorationTheme(
      border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
      filled: true,
      fillColor: colorScheme.surfaceContainerHighest.withValues(alpha: 0.3),
    ),
    // A finite minimum width (not Size.fromHeight, which sets width to
    // double.infinity): that minimum silently crashes any button placed as
    // a plain — not Expanded/Flexible — child of a Row (Row hands
    // non-flexible children unbounded width, so an infinite *minimum*
    // width has nothing finite to clamp to). Buttons meant to be full-width
    // get there because their parent (a stretching Column, or a ListView
    // item at full width) already hands them a tight width constraint,
    // which wins over this minimum regardless.
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        minimumSize: const Size(64, 48),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        minimumSize: const Size(64, 48),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      ),
    ),
    listTileTheme: ListTileThemeData(
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
    ),
    snackBarTheme: const SnackBarThemeData(behavior: SnackBarBehavior.floating),
    visualDensity: VisualDensity.standard,
  );
}

final ThemeData appLightTheme = _buildTheme(Brightness.light);
final ThemeData appDarkTheme = _buildTheme(Brightness.dark);
