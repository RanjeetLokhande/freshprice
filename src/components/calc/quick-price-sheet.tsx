'use client';

import { useState } from 'react';
import { useSaveBulkPrices } from '@/client/queries/prices';
import { formatBusinessDate } from '@/domain/business-date';
import { PRICE_PATTERN } from '@/shared/prices';
import { Alert, Button } from '../ui';
import { Sheet } from '../sheet';
import { useToast } from '../toast';

/** Add a missing price for one item without leaving the calculation. */
export function QuickPriceSheet({
  date,
  itemId,
  itemName,
  unitId,
  unitSymbol,
  currencySymbol,
  initial,
  onClose,
}: {
  date: string;
  itemId: number;
  itemName: string;
  unitId: number;
  unitSymbol: string;
  currencySymbol: string;
  initial?: string;
  onClose: () => void;
}) {
  const [value, setValue] = useState(initial ?? '');
  const [error, setError] = useState<string | null>(null);
  const save = useSaveBulkPrices();
  const toast = useToast();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!PRICE_PATTERN.test(value.trim())) {
      setError('Enter a price like 30 or 30.50.');
      return;
    }
    try {
      const res = await save.mutateAsync({ date, rows: [{ itemId, unitId, price: value.trim() }] });
      const failed = res.results.find((r) => r.status === 'error');
      if (failed) {
        setError(Object.values(failed.errors ?? {}).flat().join(' '));
        return;
      }
      toast.show(`${itemName}: price saved for ${formatBusinessDate(date)}`);
      onClose();
    } catch (err) {
      toast.error(err, 'Could not save the price.');
    }
  }

  return (
    <Sheet open onClose={onClose} title={`Price for ${itemName}`}>
      <form onSubmit={submit} className="flex flex-col gap-4 pb-2">
        <p className="text-sm text-muted">Saved as the daily price for {formatBusinessDate(date)}.</p>
        {error && <Alert>{error}</Alert>}
        <label className="flex items-center gap-2">
          <span className="text-lg text-muted">{currencySymbol}</span>
          <input
            autoFocus
            type="text"
            inputMode="decimal"
            value={value}
            onChange={(e) => {
              setValue(e.target.value.replace(',', '.'));
              setError(null);
            }}
            aria-label={`Price per ${unitSymbol}`}
            className="num min-h-14 flex-1 rounded-xl border border-border bg-surface px-4 text-right text-2xl outline-none focus:border-brand"
          />
          <span className="text-muted">/{unitSymbol}</span>
        </label>
        <Button type="submit" loading={save.isPending}>
          Save price
        </Button>
      </form>
    </Sheet>
  );
}
