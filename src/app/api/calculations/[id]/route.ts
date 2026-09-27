import { calculationUpdateSchema } from '@/shared/calculations';
import { deleteDraft, getCalculation, saveCalculation } from '@/server/calculations/service';
import { ok, withApi } from '@/server/api/with-api';
import { parseCalcId } from '../params';

type Params = { id: string };

export const GET = withApi<undefined, undefined, Params>({}, async ({ supabase, params }) =>
  ok(await getCalculation(supabase, parseCalcId(params.id))),
);

// PUT — replace a draft's date/lines/adjustment/notes (optionally finalize). Needs the current version.
export const PUT = withApi<typeof calculationUpdateSchema._output, undefined, Params>(
  { permission: 'calculations.write', body: calculationUpdateSchema },
  async ({ supabase, params, body, require }) => {
    if (body.finalize) await require('calculations.finalize');
    const { version, ...input } = body;
    return ok(await saveCalculation(supabase, input, { id: parseCalcId(params.id), version }));
  },
);

export const DELETE = withApi<undefined, undefined, Params>({ permission: 'calculations.write' }, async ({ supabase, params }) =>
  ok(await deleteDraft(supabase, parseCalcId(params.id))),
);
