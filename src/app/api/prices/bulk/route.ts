import { bulkPricesSchema } from '@/shared/prices';
import { saveBulkPrices } from '@/server/prices/service';
import { ok, withApi } from '@/server/api/with-api';

/**
 * POST /api/prices/bulk — one transaction, one result per row.
 * mode "atomic" (default): any invalid row → nothing saved, good rows report "skipped".
 * mode "partial": valid rows saved, invalid rows reported.
 * Always 200 with per-row results; the client reads data.rolledBack / summary.failed.
 */
export const POST = withApi({ permission: 'prices.write', body: bulkPricesSchema }, async ({ supabase, body }) =>
  ok(await saveBulkPrices(supabase, body)),
);
