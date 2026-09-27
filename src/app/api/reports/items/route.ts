import { reportRangeSchema } from '@/shared/reports';
import { loadItemSummary } from '@/server/reports/service';
import { ok, withApi } from '@/server/api/with-api';

// GET /api/reports/items?from=&to= — daily report (from = to) or item consumption over a range
export const GET = withApi({ permission: 'reports.read', query: reportRangeSchema }, async ({ supabase, query }) =>
  ok(await loadItemSummary(supabase, query.from, query.to)),
);
