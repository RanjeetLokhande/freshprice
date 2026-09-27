'use client';

import { useCallback } from 'react';
import { formatMoney } from '@/domain/money';
import { useBootstrap } from './queries/bootstrap';

/** Money formatter bound to the currency/locale settings. */
export function useMoney() {
  const { data } = useBootstrap();
  const s = data?.settings;
  return useCallback(
    (value: string | number) =>
      formatMoney(value, { locale: s?.locale ?? 'en-IN', currency: s?.currencyCode ?? 'INR', scale: s?.money.scale ?? 2 }),
    [s],
  );
}
