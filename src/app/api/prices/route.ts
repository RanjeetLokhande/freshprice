import { z } from 'zod';
import { isoDateSchema } from '@/shared/prices';
import { loadDailyPrices } from '@/server/prices/service';
import { ok, withApi } from '@/server/api/with-api';

// GET /api/prices?date=YYYY-MM-DD — every active item with its price for the date and the previous price
export const GET = withApi(
  { permission: 'prices.read', query: z.object({ date: isoDateSchema }) },
  async ({ supabase, query }) => ok(await loadDailyPrices(supabase, query.date)),
);
