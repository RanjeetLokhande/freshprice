import { reportRangeSchema } from '@/shared/reports';
import { loadDailyTotals } from '@/server/reports/service';
import { ok, withApi } from '@/server/api/with-api';

export const GET = withApi({ permission: 'reports.read', query: reportRangeSchema }, async ({ supabase, query }) =>
  ok(await loadDailyTotals(supabase, query.from, query.to)),
);
