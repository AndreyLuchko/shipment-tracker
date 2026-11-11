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
