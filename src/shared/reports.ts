import { z } from 'zod';
import { isoDateSchema } from './prices';

export const reportRangeSchema = z
  .object({ from: isoDateSchema, to: isoDateSchema })
  .refine((v) => v.from <= v.to, { path: ['to'], message: '"To" must be on or after "From".' });

export const REPORT_KINDS = ['items', 'daily-totals', 'price-history'] as const;
export type ReportKind = (typeof REPORT_KINDS)[number];

export const exportQuerySchema = z.object({
  from: isoDateSchema,
  to: isoDateSchema,
  format: z.enum(['csv', 'xlsx']).default('csv'),
  itemId: z.coerce.number().int().positive().optional(),
  categoryId: z.coerce.number().int().positive().optional(),
});

export interface DashboardStats {
  date: string;
  todayTotal: number;
  todayCalculations: number;
  todayDrafts: number;
  todayLines: number;
  yesterdayTotal: number;
  weekTotal: number;
  monthTotal: number;
  pricesSet: number;
  activeItems: number;
  missingPrices: number;
}

export interface ItemSummaryRow {
  itemId: number;
  itemName: string;
  categoryName: string | null;
  unitSymbol: string;
  quantity: string;
  amount: string;
  avgRate: string | null;
  lines: number;
  calculations: number;
}

export interface DailyTotalRow {
  day: string;
  calculations: number;
  lines: number;
  total: string;
}

export interface ReportResult<T> {
  from: string;
  to: string;
  rows: T[];
  total: string;
}
