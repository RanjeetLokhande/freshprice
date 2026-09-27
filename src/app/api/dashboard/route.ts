import { z } from 'zod';
import { isoDateSchema } from '@/shared/prices';
import { loadDashboard } from '@/server/reports/service';
import { ok, withApi } from '@/server/api/with-api';

// GET /api/dashboard?date= — figures respect RLS (users see their own work, admins everyone's)
export const GET = withApi({ query: z.object({ date: isoDateSchema }) }, async ({ supabase, query }) =>
  ok(await loadDashboard(supabase, query.date)),
);
