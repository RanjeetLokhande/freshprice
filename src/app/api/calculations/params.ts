import { z } from 'zod';
import { ApiError } from '@/server/api/errors';

export function parseCalcId(raw: string): number {
  const id = z.coerce.number().int().positive().safeParse(raw);
  if (!id.success) throw new ApiError('NOT_FOUND', 'Calculation not found.');
  return id.data;
}
