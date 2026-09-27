import {
  IDEMPOTENCY_HEADER,
  type ApiEnvelope,
  type ErrorCode,
  type FieldErrors,
  type PageMeta,
} from '@/shared/api';

export type ClientErrorCode = ErrorCode | 'NETWORK' | 'ABORTED';

export class ApiClientError extends Error {
  constructor(
    readonly code: ClientErrorCode,
    message: string,
    readonly status: number,
    readonly errors?: FieldErrors,
    readonly requestId?: string,
  ) {
    super(message);
    this.name = 'ApiClientError';
  }

  /** 4xx errors are the caller's fault — retrying won't help. */
  get isClientError() {
    return this.status >= 400 && this.status < 500;
  }
}

type QueryValue = string | number | boolean | null | undefined;

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  query?: Record<string, QueryValue>;
  /** Pass TanStack Query's signal so stale requests are cancelled. */
  signal?: AbortSignal;
  /** Same key on retry/double-tap → server returns the first result. */
  idempotencyKey?: string;
}

export interface ApiResponse<T> {
  data: T;
  meta?: PageMeta;
  requestId: string;
}

function buildUrl(path: string, query?: Record<string, QueryValue>) {
  const url = new URL(path.startsWith('/api') ? path : `/api${path}`, window.location.origin);
  for (const [k, v] of Object.entries(query ?? {})) {
    if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
  }
  return url;
}

/** Single fetch path for the app: unwraps the envelope and throws ApiClientError on failure. */
export async function apiRequest<T>(path: string, opts: RequestOptions = {}): Promise<ApiResponse<T>> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  if (opts.idempotencyKey) headers[IDEMPOTENCY_HEADER] = opts.idempotencyKey;

  let res: Response;
  try {
    res = await fetch(buildUrl(path, opts.query), {
      method: opts.method ?? 'GET',
      headers,
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      signal: opts.signal,
      credentials: 'same-origin',
    });
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') {
      throw new ApiClientError('ABORTED', 'Request cancelled.', 0);
    }
    throw new ApiClientError('NETWORK', 'Network error. Check your connection and try again.', 0);
  }

  let envelope: ApiEnvelope<T>;
  try {
    envelope = (await res.json()) as ApiEnvelope<T>;
  } catch {
    throw new ApiClientError('INTERNAL', 'Unexpected response from server.', res.status);
  }

  if (!envelope.success) {
    throw new ApiClientError(envelope.code, envelope.message, res.status, envelope.errors, envelope.requestId);
  }
  return { data: envelope.data, meta: envelope.meta, requestId: envelope.requestId };
}

export const api = {
  get: <T>(path: string, opts: Omit<RequestOptions, 'method' | 'body'> = {}) =>
    apiRequest<T>(path, { ...opts, method: 'GET' }).then((r) => r.data),
  post: <T>(path: string, body?: unknown, opts: Omit<RequestOptions, 'method' | 'body'> = {}) =>
    apiRequest<T>(path, { ...opts, method: 'POST', body }).then((r) => r.data),
  put: <T>(path: string, body?: unknown, opts: Omit<RequestOptions, 'method' | 'body'> = {}) =>
    apiRequest<T>(path, { ...opts, method: 'PUT', body }).then((r) => r.data),
  delete: <T>(path: string, opts: Omit<RequestOptions, 'method' | 'body'> = {}) =>
    apiRequest<T>(path, { ...opts, method: 'DELETE' }).then((r) => r.data),
};

/**
 * Downloads a file endpoint. Errors come back as the JSON envelope and are
 * thrown as ApiClientError instead of being saved as a broken file.
 */
export async function downloadFile(path: string, query: Record<string, QueryValue>, fallbackName: string) {
  let res: Response;
  try {
    res = await fetch(buildUrl(path, query), { credentials: 'same-origin' });
  } catch {
    throw new ApiClientError('NETWORK', 'Network error. Check your connection and try again.', 0);
  }
  if (!res.ok) {
    const envelope = (await res.json().catch(() => null)) as ApiEnvelope<never> | null;
    if (envelope && !envelope.success) {
      throw new ApiClientError(envelope.code, envelope.message, res.status, envelope.errors, envelope.requestId);
    }
    throw new ApiClientError('INTERNAL', 'Download failed.', res.status);
  }
  const name = /filename="([^"]+)"/.exec(res.headers.get('content-disposition') ?? '')?.[1] ?? fallbackName;
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/**
 * Puts server field errors onto a react-hook-form instance.
 * Returns the messages that had no matching field (show them in a toast/banner).
 */
export function applyFieldErrors(
  error: unknown,
  setError: (name: never, e: { type: string; message: string }) => void,
  knownFields?: (path: string) => boolean,
): string[] {
  if (!(error instanceof ApiClientError)) return ['Something went wrong.'];
  const leftovers: string[] = [];
  for (const [path, messages] of Object.entries(error.errors ?? {})) {
    if (!knownFields || knownFields(path)) {
      setError(path as never, { type: 'server', message: messages.join(' ') });
    } else {
      leftovers.push(...messages);
    }
  }
  if (!error.errors) leftovers.push(error.message);
  return leftovers;
}
