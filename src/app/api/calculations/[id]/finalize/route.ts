import { versionSchema } from '@/shared/calculations';
import { finalizeCalculation } from '@/server/calculations/service';
import { ok, withApi } from '@/server/api/with-api';
import { parseCalcId } from '../../params';

// POST /api/calculations/:id/finalize { version } — re-verifies every price, then freezes the calculation
export const POST = withApi<typeof versionSchema._output, undefined, { id: string }>(
  { permission: 'calculations.finalize', body: versionSchema },
  async ({ supabase, params, body }) => ok(await finalizeCalculation(supabase, parseCalcId(params.id), body.version)),
);
