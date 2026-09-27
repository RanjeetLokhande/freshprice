import { z } from 'zod';
import { isoDateSchema } from './prices';

export type CalculationStatus = 'draft' | 'finalized' | 'cancelled';

const QTY_PATTERN = /^\d{1,10}(\.\d{1,4})?$/;
const ADJ_PATTERN = /^-?\d{1,10}(\.\d{1,2})?$/;

export const calculationLineInputSchema = z.object({
  itemId: z.number({ error: 'Choose an item.' }).int().positive(),
  unitId: z.number({ error: 'Choose a unit.' }).int().positive(),
  quantity: z
    .union([z.string(), z.number()])
    .transform((v) => String(v).trim())
    .pipe(
      z
        .string()
        .regex(QTY_PATTERN, 'Enter a quantity like 1, 0.5 or 2.25.')
        .refine((v) => Number(v) > 0, 'Quantity must be greater than zero.'),
    ),
});
export type CalculationLineInput = z.input<typeof calculationLineInputSchema>;

export const calculationInputSchema = z.object({
  date: isoDateSchema,
  notes: z.string().trim().max(500).nullish(),
  adjustment: z
    .union([z.string(), z.number()])
    .transform((v) => String(v).trim() || '0')
    .pipe(z.string().regex(ADJ_PATTERN, 'Enter an amount like -50 or 25.50.'))
    .default('0'),
  lines: z.array(calculationLineInputSchema).min(1, 'Add at least one item.').max(300, 'At most 300 lines.'),
  finalize: z.boolean().default(false),
});
export type CalculationInput = z.input<typeof calculationInputSchema>;

export const calculationUpdateSchema = calculationInputSchema.extend({
  version: z.number().int().positive(),
});

export const versionSchema = z.object({ version: z.number().int().positive() });
export const cancelSchema = versionSchema.extend({
  reason: z.string().trim().min(3, 'Give a reason (at least 3 characters).').max(300),
});

export interface CalculationLineDto {
  lineNo: number;
  itemId: number;
  itemName: string;
  categoryName: string | null;
  quantity: string;
  unitId: number;
  unitSymbol: string;
  normalizedQuantity: string;
  price: string;
  priceUnitId: number;
  priceUnitSymbol: string;
  amount: string;
}

export interface CalculationDto {
  id: number;
  referenceNumber: string;
  date: string;
  status: CalculationStatus;
  subtotal: string;
  adjustment: string;
  grandTotal: string;
  notes: string | null;
  version: number;
  createdBy: string;
  createdAt: string;
  finalizedAt: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  lines: CalculationLineDto[];
  /** true when the same idempotency key was already used (double tap) */
  replayed?: boolean;
}

export interface CalculationSummaryDto {
  id: number;
  referenceNumber: string;
  date: string;
  status: CalculationStatus;
  grandTotal: string;
  lineCount: number;
  createdAt: string;
}

export const calculationListQuerySchema = z.object({
  from: isoDateSchema.optional(),
  to: isoDateSchema.optional(),
  status: z.enum(['draft', 'finalized', 'cancelled']).optional(),
  itemId: z.coerce.number().int().positive().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(30),
});
export type CalculationListQuery = z.infer<typeof calculationListQuerySchema>;
