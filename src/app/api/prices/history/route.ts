import { priceHistoryQuerySchema } from '@/shared/prices';
import { loadPriceHistory } from '@/server/prices/service';
import { ok, withApi } from '@/server/api/with-api';

// GET /api/prices/history?itemId=&categoryId=&from=&to=&page=&pageSize=
export const GET = withApi({ permission: 'prices.read', query: priceHistoryQuerySchema }, async ({ supabase, query }) => {
  const { rows, meta } = await loadPriceHistory(supabase, query);
  return ok(rows, { meta });
});
