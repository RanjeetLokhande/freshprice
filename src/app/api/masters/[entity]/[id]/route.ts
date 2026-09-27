import { z } from 'zod';
import { ApiError } from '@/server/api/errors';
import { deleteMaster, getMasterRow, requireMaster, updateMaster } from '@/server/masters/service';
import { ok, readJson, withApi } from '@/server/api/with-api';

type Params = { entity: string; id: string };

function parseId(raw: string): number {
  const id = z.coerce.number().int().positive().safeParse(raw);
  if (!id.success) throw new ApiError('NOT_FOUND', 'Record not found.');
  return id.data;
}

export const GET = withApi<undefined, undefined, Params>({}, async ({ supabase, params }) => {
  const def = requireMaster(params.entity);
  return ok(await getMasterRow(supabase, def, parseId(params.id)));
});

// PUT requires the row's current `version`; a stale version answers 409 CONFLICT.
export const PUT = withApi<undefined, undefined, Params>({}, async ({ req, supabase, params, require }) => {
  const def = requireMaster(params.entity);
  await require(def.permission);
  return ok(await updateMaster(supabase, def, parseId(params.id), await readJson(req)));
});

export const DELETE = withApi<undefined, undefined, Params>({}, async ({ supabase, params, require }) => {
  const def = requireMaster(params.entity);
  await require(def.permission);
  return ok(await deleteMaster(supabase, def, parseId(params.id)));
});
