import 'server-only';
import { ZodError } from 'zod';
import { DomainError } from '@/domain/errors';
import type { ErrorCode, FieldErrors } from '@/shared/api';

/** Throw from any handler; withApi() turns it into the error envelope. */
export class ApiError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly errors?: FieldErrors,
    readonly headers?: Record<string, string>,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export function zodToFieldErrors(error: ZodError, prefix = ''): FieldErrors {
  const out: FieldErrors = {};
  for (const issue of error.issues) {
    const path = [prefix, ...issue.path.map(String)].filter(Boolean).join('.') || '_';
    (out[path] ??= []).push(issue.message);
  }
  return out;
}

interface PgLikeError {
  code?: string;
  message?: string;
  details?: string | null;
}

function isPgLikeError(e: unknown): e is PgLikeError {
  return typeof e === 'object' && e !== null && 'code' in e && typeof (e as PgLikeError).code === 'string';
}

/**
 * Maps anything thrown by a handler to a safe ApiError. Unknown errors become
 * INTERNAL with a generic message — details only go to the server log.
 */
export function toApiError(e: unknown): ApiError {
  if (e instanceof ApiError) return e;

  if (e instanceof ZodError) {
    return new ApiError('VALIDATION_ERROR', 'Some fields are invalid.', zodToFieldErrors(e));
  }

  if (e instanceof DomainError) {
    const errors = e.field ? { [e.field]: [e.message] } : undefined;
    return new ApiError(e.code, e.message, errors);
  }

  if (isPgLikeError(e)) {
    switch (e.code) {
      case '23505':
        return new ApiError('CONFLICT', 'A record with the same values already exists.');
      case '23503':
        return new ApiError(
          'VALIDATION_ERROR',
          'This record is linked to other data. Deactivate it instead, or choose a valid reference.',
        );
      case '23514':
      case '23502':
      case '22P02':
      case '22003':
        // Messages raised by our own triggers are written for users; generic check failures are not.
        return new ApiError(
          'VALIDATION_ERROR',
          e.message && !/violates|constraint|syntax|out of range/i.test(e.message)
            ? e.message
            : 'Some values are invalid.',
        );
      case '42501':
        return new ApiError('FORBIDDEN', e.message && !/permission denied for/i.test(e.message) ? e.message : 'You do not have permission to do this.');
      // Codes raised by our calculation functions (messages are written for users)
      case 'FPC01': {
        const line = Number(e.details);
        return new ApiError(
          'VALIDATION_ERROR',
          e.message ?? 'A price changed.',
          Number.isInteger(line) ? { [`lines.${line}.price`]: [e.message ?? 'Price changed.'] } : undefined,
        );
      }
      case 'FPC02':
        return new ApiError('VALIDATION_ERROR', e.message ?? 'Invalid calculation.');
      case 'FPC03':
        return new ApiError('CONFLICT', e.message ?? 'Someone else changed this record.');
      case 'P0002':
        return new ApiError('NOT_FOUND', e.message ?? 'Record not found.');
      case 'PGRST116':
        return new ApiError('NOT_FOUND', 'Record not found.');
    }
  }

  return new ApiError('INTERNAL', 'Something went wrong. Please try again.');
}
