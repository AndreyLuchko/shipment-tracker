import type { ErrorCode, ErrorDetail } from '@shipment-tracker/shared';

/** An expected, client-facing failure. `errorHandlerPlugin` turns it into the standard error envelope. */
export class AppError extends Error {
  readonly statusCode: number;
  readonly code: ErrorCode;
  readonly details?: ErrorDetail[];

  constructor(statusCode: number, code: ErrorCode, message: string, details?: ErrorDetail[]) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    if (details !== undefined) {
      this.details = details;
    }
  }
}

/** The `message` of every `VALIDATION_ERROR` response; the field-level reasons live in `details`. */
export const VALIDATION_FAILED_MESSAGE = 'Request validation failed';

/** A `400 VALIDATION_ERROR` for a check a Zod schema cannot make (e.g. an unknown client, a time against the timeline). */
export function validationError(path: string, message: string): AppError {
  return new AppError(400, 'VALIDATION_ERROR', VALIDATION_FAILED_MESSAGE, [{ path, message }]);
}
