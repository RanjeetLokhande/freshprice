import { z } from 'zod';
import { isIsoDate } from '@/domain/business-date';
import type { BatchRowResult } from './api';

export const isoDateSchema = z.string().refine(isIsoDate, 'Enter a valid date (YYYY-MM-DD).');

/** Money input as typed by users: "30", "30.5", "30.50" */
export const PRICE_PATTERN = /^\d{1,10}(\.\d{1,2})?$/;
export const priceInputSchema = z
  .union([z.string(), z.number()])
  .transform((v) => String(v).trim())
  .pipe(z.string().regex(PRICE_PATTERN, 'Enter a price like 30 or 30.50.'));

export const bulkPricesSchema = z.object({
  date: isoDateSchema,
  mode: z.enum(['atomic', 'partial']).default('atomic'),
  rows: z
    .array(
      z.object({
        itemId: z.number().int().positive(),
        unitId: z.number().int().positive(),
        price: priceInputSchema,
        notes: z.string().trim().max(200).nullish(),
        version: z.number().int().positive().nullish(),
      }),
    )
    .min(1, 'Nothing to save.')
    .max(500, 'At most 500 prices per save.'),
});
export type BulkPricesInput = z.input<typeof bulkPricesSchema>;

export type BulkPriceStatus = 'created' | 'updated' | 'unchanged' | 'skipped';

export interface BulkPricesResult {
  results: (BatchRowResult<BulkPriceStatus> & { itemId: number | null })[];
  rolledBack: boolean;
  summary: { created: number; updated: number; unchanged: number; failed: number };
}

/** One line of the daily price entry screen. */
export interface DailyPriceRow {
  itemId: number;
  unitId: number;
  current: { id: number; price: string; version: number; notes: string | null; updatedAt: string } | null;
  previous: { date: string; price: string } | null;
}

export interface DailyPrices {
  date: string;
  rows: DailyPriceRow[];
}

export const priceHistoryQuerySchema = z.object({
  itemId: z.coerce.number().int().positive().optional(),
  categoryId: z.coerce.number().int().positive().optional(),
  from: isoDateSchema.optional(),
  to: isoDateSchema.optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});
export type PriceHistoryQuery = z.infer<typeof priceHistoryQuerySchema>;

export interface PriceHistoryRow {
  id: number;
  date: string;
  itemId: number;
  itemName: string;
  categoryId: number;
  price: string;
  unitSymbol: string;
  notes: string | null;
  revisions: number;
  updatedAt: string;
}
