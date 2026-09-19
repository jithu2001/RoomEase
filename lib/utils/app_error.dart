import 'dart:developer' as developer;

/// Error codes used throughout the data/service layer. Mirrors the original
/// `src/utils/errors.ts`.
enum AppErrorCode {
  dbInit,
  dbQuery,
  validation,
  roomOccupied,
  roomUnknown,
  roomInUse,
  duplicateRoom,
  cameraPermission,
  cameraUnavailable,
  invalidImage,
  imageCompression,
  filesystem,
  missingFile,
  backupFailed,
  restoreFailed,
  corruptBackup,
  notFound,
  unknown,
}

/// An error safe to show to hotel staff: [message] must never embed customer
/// personal data or ID image paths. [cause] is for logs only, never rendered.
class AppError implements Exception {
  final AppErrorCode code;
  final String message;
  final Object? cause;

  const AppError(this.code, this.message, [this.cause]);

  @override
  String toString() => 'AppError(${code.name}): $message';
}

/// Converts any thrown error into a message safe to show in the UI.
String toUserMessage(Object error) {
  if (error is AppError) return error.message;
  if (error is Error) return error.toString();
  return 'Something went wrong. Please try again.';
}

/// Logs only a short, PII-free line: never the full object or stack of
/// customer data.
void logError(String context, Object error) {
  final code = error is AppError ? error.code.name.toUpperCase() : 'UNKNOWN';
  final message = error is AppError ? error.message : error.toString();
  developer.log('[$context] $code: $message', name: 'roomease', level: 900);
}
