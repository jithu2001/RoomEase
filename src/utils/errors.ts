/**
 * Error types used across the app.
 *
 * Rule: messages must be safe to show to hotel staff and must never embed
 * customer personal data or ID image paths (see §25 of the spec).
 */

export type AppErrorCode =
  | 'DB_INIT'
  | 'DB_QUERY'
  | 'VALIDATION'
  | 'ROOM_OCCUPIED'
  | 'ROOM_UNKNOWN'
  | 'ROOM_IN_USE'
  | 'DUPLICATE_ROOM'
  | 'CAMERA_PERMISSION'
  | 'CAMERA_UNAVAILABLE'
  | 'INVALID_IMAGE'
  | 'IMAGE_COMPRESSION'
  | 'FILESYSTEM'
  | 'MISSING_FILE'
  | 'BACKUP_FAILED'
  | 'RESTORE_FAILED'
  | 'CORRUPT_BACKUP'
  | 'NOT_FOUND'
  | 'UNKNOWN';

export class AppError extends Error {
  readonly code: AppErrorCode;
  /** Original error, kept for the console only — never rendered. */
  readonly cause?: unknown;

  constructor(code: AppErrorCode, message: string, cause?: unknown) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.cause = cause;
  }
}

export function isAppError(e: unknown): e is AppError {
  return e instanceof AppError;
}

/** Turns anything thrown into a message that is safe and useful on screen. */
export function toUserMessage(e: unknown): string {
  if (isAppError(e)) return e.message;
  if (e instanceof Error && e.message) return e.message;
  return 'Something went wrong. Please try again.';
}

/**
 * Logs an error without leaking personal data. Only the code and a short
 * developer message are printed.
 */
export function logError(context: string, e: unknown): void {
  const code = isAppError(e) ? e.code : 'UNKNOWN';
  console.error(`[${context}] ${code}: ${e instanceof Error ? e.message : String(e)}`);
}
