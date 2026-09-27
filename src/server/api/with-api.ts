import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import type { User } from '@supabase/supabase-js';
import type { ZodType } from 'zod';
import { getServerSupabase, type ServerSupabase } from '@/lib/supabase/server';
import {
  ERROR_STATUS,
  REQUEST_ID_HEADER,
  type ApiFailure,
  type ApiSuccess,
  type PageMeta,
} from '@/shared/api';
import { ApiError, toApiError, zodToFieldErrors } from './errors';
import { rateLimiter, WRITE_LIMIT, type RateLimitRule } from './rate-limit';

export interface ApiContext<TBody, TQuery, TParams> {
  req: NextRequest;
  requestId: string;
  supabase: ServerSupabase;
  /** null only when the route is declared `auth: false` */
  user: User | null;
  body: TBody;
  query: TQuery;
  params: TParams;
  /** Loads the caller's permission keys once per request. */
  permissions: () => Promise<Set<string>>;
  /** Throws FORBIDDEN unless the caller holds the permission. */
  require: (permission: string) => Promise<void>;
}

export interface ApiResult<T> {
  data: T;
  meta?: PageMeta;
  status?: number;
  headers?: HeadersInit;
}

/** For handlers whose schema is only known at runtime (e.g. registry-driven masters). */
export async function readJson(req: NextRequest): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    throw new ApiError('VALIDATION_ERROR', 'Request body must be valid JSON.');
  }
}

/** Wraps a handler's data for the envelope. */
export function ok<T>(data: T, extra: Omit<ApiResult<T>, 'data'> = {}): ApiResult<T> {
  return { data, ...extra };
}

interface Options<TBody, TQuery> {
  /** Default true */
  auth?: boolean;
  permission?: string;
  body?: ZodType<TBody>;
  query?: ZodType<TQuery>;
  /** Per-user limit. Writes default to WRITE_LIMIT; set for expensive GETs (exports). */
  rateLimit?: RateLimitRule & { name: string };
}

type RouteContext = { params: Promise<Record<string, string | string[]>> };

/**
 * The only place that builds HTTP responses:
 * auth → permission → validation → handler → success/error envelope (+ requestId).
 */
export function withApi<TBody = undefined, TQuery = undefined, TParams = Record<string, string>>(
  options: Options<TBody, TQuery>,
  handler: (ctx: ApiContext<TBody, TQuery, TParams>) => Promise<ApiResult<unknown> | Response>,
) {
  return async (req: NextRequest, route: RouteContext): Promise<Response> => {
    const requestId = req.headers.get(REQUEST_ID_HEADER) ?? `req_${crypto.randomUUID()}`;

    try {
      const supabase = await getServerSupabase();

      let user: User | null = null;
      if (options.auth !== false) {
        const { data } = await supabase.auth.getUser();
        if (!data.user) throw new ApiError('UNAUTHENTICATED', 'Please sign in.');
        user = data.user;
      }

      const rule = options.rateLimit ?? (req.method === 'GET' ? null : { ...WRITE_LIMIT, name: 'write' });
      if (rule) {
        const who = user?.id ?? req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'anon';
        const retryAfter = rateLimiter.hit(`${who}:${rule.name}`, rule);
        if (retryAfter !== null) {
          throw new ApiError('RATE_LIMITED', `Too many requests. Try again in ${retryAfter} s.`, undefined, {
            'Retry-After': String(retryAfter),
          });
        }
      }

      let permissionCache: Promise<Set<string>> | undefined;
      const permissions = () =>
        (permissionCache ??= (async () => {
          const { data, error } = await supabase.rpc('my_permissions');
          if (error) throw error;
          return new Set<string>((data ?? []) as string[]);
        })());
      const requirePermission = async (permission: string) => {
        if (!(await permissions()).has(permission)) {
          throw new ApiError('FORBIDDEN', 'You do not have permission to do this.');
        }
      };

      if (options.permission) await requirePermission(options.permission);

      let query = undefined as TQuery;
      if (options.query) {
        const raw = Object.fromEntries(req.nextUrl.searchParams.entries());
        const parsed = options.query.safeParse(raw);
        if (!parsed.success) {
          throw new ApiError('VALIDATION_ERROR', 'Invalid query parameters.', zodToFieldErrors(parsed.error));
        }
        query = parsed.data;
      }

      let body = undefined as TBody;
      if (options.body) {
        let json: unknown;
        try {
          json = await req.json();
        } catch {
          throw new ApiError('VALIDATION_ERROR', 'Request body must be valid JSON.');
        }
        const parsed = options.body.safeParse(json);
        if (!parsed.success) {
          throw new ApiError('VALIDATION_ERROR', 'Some fields are invalid.', zodToFieldErrors(parsed.error));
        }
        body = parsed.data;
      }

      const params = (route?.params ? await route.params : {}) as TParams;

      const result = await handler({
        req,
        requestId,
        supabase,
        user,
        body,
        query,
        params,
        permissions,
        require: requirePermission,
      });

      if (result instanceof Response) {
        result.headers.set(REQUEST_ID_HEADER, requestId);
        return result;
      }

      const envelope: ApiSuccess<unknown> = {
        success: true,
        data: result.data,
        ...(result.meta ? { meta: result.meta } : {}),
        requestId,
      };
      const res = NextResponse.json(envelope, { status: result.status ?? 200, headers: result.headers });
      res.headers.set(REQUEST_ID_HEADER, requestId);
      return res;
    } catch (e) {
      const apiError = toApiError(e);
      if (apiError.code === 'INTERNAL') {
        console.error(`[${requestId}] ${req.method} ${req.nextUrl.pathname}`, e);
      }
      const envelope: ApiFailure = {
        success: false,
        code: apiError.code,
        message: apiError.message,
        ...(apiError.errors ? { errors: apiError.errors } : {}),
        requestId,
      };
      const res = NextResponse.json(envelope, { status: ERROR_STATUS[apiError.code], headers: apiError.headers });
      res.headers.set(REQUEST_ID_HEADER, requestId);
      return res;
    }
  };
}
