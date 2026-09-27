// Response envelope shared by every API route and the client.

export const ERROR_STATUS = {
  VALIDATION_ERROR: 422,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  PRICE_MISSING: 422,
  INCOMPATIBLE_UNITS: 422,
  RATE_LIMITED: 429,
  INTERNAL: 500,
} as const;

export type ErrorCode = keyof typeof ERROR_STATUS;

/** Field path (e.g. "lines.0.quantity") -> messages */
export type FieldErrors = Record<string, string[]>;

export interface PageMeta {
  page: number;
  pageSize: number;
  total: number;
}

export interface ApiSuccess<T> {
  success: true;
  data: T;
  meta?: PageMeta;
  requestId: string;
}

export interface ApiFailure {
  success: false;
  code: ErrorCode;
  message: string;
  errors?: FieldErrors;
  requestId: string;
}

export type ApiEnvelope<T> = ApiSuccess<T> | ApiFailure;

/** Per-row outcome for batch endpoints (bulk prices etc.) */
export interface BatchRowResult<TStatus extends string = string> {
  index: number;
  status: TStatus | 'error';
  id?: number;
  errors?: FieldErrors;
}

export const REQUEST_ID_HEADER = 'x-request-id';
export const IDEMPOTENCY_HEADER = 'idempotency-key';
