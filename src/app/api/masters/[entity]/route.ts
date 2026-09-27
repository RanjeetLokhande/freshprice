import { createMaster, listMasters, listQuerySchema, requireMaster } from '@/server/masters/service';
import { ok, readJson, withApi } from '@/server/api/with-api';

type Params = { entity: string };

// GET /api/masters/:entity?q=&active=true|false|all&page=&pageSize=&sort=-name
export const GET = withApi<undefined, typeof listQuerySchema._output, Params>(
  { query: listQuerySchema },
  async ({ supabase, params, query }) => {
    const def = requireMaster(params.entity);
    const { rows, meta } = await listMasters(supabase, def, query);
    return ok(rows, { meta });
  },
);

// POST /api/masters/:entity
export const POST = withApi<undefined, undefined, Params>({}, async ({ req, supabase, params, require }) => {
  const def = requireMaster(params.entity);
  await require(def.permission);
  const row = await createMaster(supabase, def, await readJson(req));
  return ok(row, { status: 201 });
});
