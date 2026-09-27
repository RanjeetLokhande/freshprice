import { z } from 'zod';
import { IDEMPOTENCY_HEADER } from '@/shared/api';
import { calculationInputSchema, calculationListQuerySchema } from '@/shared/calculations';
import { ApiError } from '@/server/api/errors';
import { listCalculations, saveCalculation } from '@/server/calculations/service';
import { ok, withApi } from '@/server/api/with-api';

export const GET = withApi({ query: calculationListQuerySchema }, async ({ supabase, query }) => {
  const { rows, meta } = await listCalculations(supabase, query);
  return ok(rows, { meta });
});

/**
 * POST /api/calculations — creates a draft (or finalizes with finalize: true).
 * Send an Idempotency-Key header: retries / double taps return the first result (200, replayed: true).
 */
export const POST = withApi(
  { permission: 'calculations.write', body: calculationInputSchema },
  async ({ req, supabase, body, require }) => {
    const rawKey = req.headers.get(IDEMPOTENCY_HEADER);
    const key = rawKey ? z.uuid().safeParse(rawKey) : null;
    if (key && !key.success) throw new ApiError('VALIDATION_ERROR', 'Idempotency-Key must be a UUID.');
    if (body.finalize) await require('calculations.finalize');

    const calc = await saveCalculation(supabase, body, { idempotencyKey: key?.data ?? null });
    return ok(calc, { status: calc.replayed ? 200 : 201 });
  },
);
