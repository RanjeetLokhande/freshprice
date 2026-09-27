import { cancelSchema } from '@/shared/calculations';
import { cancelCalculation } from '@/server/calculations/service';
import { ok, withApi } from '@/server/api/with-api';
import { parseCalcId } from '../../params';

// POST /api/calculations/:id/cancel { version, reason } — finalized only; the record is kept for audit
export const POST = withApi<typeof cancelSchema._output, undefined, { id: string }>(
  { permission: 'calculations.cancel', body: cancelSchema },
  async ({ supabase, params, body }) =>
    ok(await cancelCalculation(supabase, parseCalcId(params.id), body.version, body.reason)),
);
