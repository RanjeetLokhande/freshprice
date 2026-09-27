'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { ApiClientError } from '@/client/api-client';
import { useMoney } from '@/client/format';
import { useMasters } from '@/client/queries/bootstrap';
import {
  useCalculation,
  useCancelCalculation,
  useDeleteDraft,
  useFinalizeCalculation,
} from '@/client/queries/calculations';
import { formatBusinessDate } from '@/domain/business-date';
import { StatusBadge } from '@/components/calc/status-badge';
import { Sheet } from '@/components/sheet';
import { useToast } from '@/components/toast';
import { Alert, Button, Skeleton } from '@/components/ui';

export default function CalculationDetailPage() {
  const params = useParams<{ id: string }>();
  const id = Number(params.id) || null;
  const router = useRouter();
  const toast = useToast();
  const money = useMoney();
  const { data: bootstrap, derived } = useMasters();
  const calc = useCalculation(id);
  const finalize = useFinalizeCalculation();
  const cancel = useCancelCalculation();
  const del = useDeleteDraft();
  const [cancelling, setCancelling] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  if (calc.isPending || !derived || !bootstrap) return <Skeleton className="h-96" />;
  if (calc.isError) return <Alert>{calc.error.message}</Alert>;
  const c = calc.data;
  const isOwner = c.createdBy === bootstrap.user.id;

  async function run(action: () => Promise<unknown>, success: string): Promise<boolean> {
    setError(null);
    try {
      await action();
      toast.show(success);
      return true;
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : 'Something went wrong.');
      if (e instanceof ApiClientError && e.code === 'CONFLICT') void calc.refetch();
      return false;
    }
  }

  return (
    <article className="pb-6">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold num">{c.referenceNumber}</h1>
            <StatusBadge status={c.status} />
          </div>
          <p className="mt-1 text-sm text-muted">{formatBusinessDate(c.date)}</p>
        </div>
        <div className="text-right">
          <div className="text-xs text-muted">Total</div>
          <div className="text-3xl font-bold num">{money(c.grandTotal)}</div>
        </div>
      </div>

      {c.status === 'cancelled' && (
        <div className="mb-4">
          <Alert tone="warn">Cancelled{c.cancelReason ? `: ${c.cancelReason}` : ''}. Kept for audit.</Alert>
        </div>
      )}
      {error && (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      )}

      {/* Lines: cards on phones, table on desktop */}
      <ul className="flex flex-col gap-2 md:hidden">
        {c.lines.map((l) => (
          <li key={l.lineNo} className="rounded-2xl border border-border bg-surface px-4 py-3">
            <div className="flex justify-between gap-3">
              <span className="font-semibold">{l.itemName}</span>
              <span className="font-semibold num">{money(l.amount)}</span>
            </div>
            <div className="mt-0.5 text-sm text-muted num">
              {l.quantity} {l.unitSymbol} × {money(l.price)}/{l.priceUnitSymbol}
            </div>
          </li>
        ))}
      </ul>
      <div className="hidden overflow-hidden rounded-2xl border border-border bg-surface md:block print:block">
        <table className="w-full text-sm">
          <thead className="bg-surface-2 text-left text-xs uppercase tracking-wide text-muted">
            <tr>
              <th className="px-4 py-3 font-semibold">Item</th>
              <th className="px-4 py-3 text-right font-semibold">Quantity</th>
              <th className="px-4 py-3 text-right font-semibold">Rate</th>
              <th className="px-4 py-3 text-right font-semibold">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {c.lines.map((l) => (
              <tr key={l.lineNo}>
                <td className="px-4 py-3 font-medium">{l.itemName}</td>
                <td className="px-4 py-3 text-right num">
                  {l.quantity} {l.unitSymbol}
                </td>
                <td className="px-4 py-3 text-right num">
                  {money(l.price)}/{l.priceUnitSymbol}
                </td>
                <td className="px-4 py-3 text-right font-semibold num">{money(l.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <dl className="mt-4 ml-auto flex max-w-xs flex-col gap-1 text-sm">
        <div className="flex justify-between">
          <dt className="text-muted">Subtotal</dt>
          <dd className="num">{money(c.subtotal)}</dd>
        </div>
        {c.adjustment !== '0.00' && (
          <div className="flex justify-between">
            <dt className="text-muted">Adjustment</dt>
            <dd className="num">{money(c.adjustment)}</dd>
          </div>
        )}
        <div className="flex justify-between border-t border-border pt-1 text-base font-bold">
          <dt>Total</dt>
          <dd className="num">{money(c.grandTotal)}</dd>
        </div>
      </dl>
      {c.notes && <p className="mt-4 whitespace-pre-wrap rounded-2xl bg-surface-2 p-4 text-sm">{c.notes}</p>}

      {/* Actions */}
      <div className="mt-6 flex flex-wrap gap-2 print:hidden">
        {c.status === 'draft' && isOwner && (
          <>
            <Link
              href={`/calculate?id=${c.id}`}
              className="inline-flex min-h-12 items-center rounded-xl border border-border bg-surface px-5 font-semibold hover:bg-surface-2"
            >
              Edit
            </Link>
            {derived.can('calculations.finalize') && (
              <Button
                loading={finalize.isPending}
                onClick={() =>
                  window.confirm('Finalize? It can’t be edited afterwards.') &&
                  run(() => finalize.mutateAsync({ id: c.id, version: c.version }), `${c.referenceNumber} finalized`)
                }
              >
                Finalize
              </Button>
            )}
            <Button
              variant="ghost"
              className="text-danger"
              loading={del.isPending}
              onClick={async () => {
                if (!window.confirm('Delete this draft?')) return;
                if (await run(() => del.mutateAsync(c.id), 'Draft deleted')) router.replace('/calculations');
              }}
            >
              Delete draft
            </Button>
          </>
        )}
        {c.status === 'finalized' && (
          <>
            <Button variant="secondary" onClick={() => window.print()}>
              Print
            </Button>
            {derived.can('calculations.cancel') && (
              <Button variant="ghost" className="text-danger" onClick={() => setCancelling(true)}>
                Cancel calculation
              </Button>
            )}
          </>
        )}
        <Link href="/calculations" className="inline-flex min-h-12 items-center px-3 text-sm font-medium text-brand">
          ← All calculations
        </Link>
      </div>

      {cancelling && (
        <Sheet
          open
          onClose={() => setCancelling(false)}
          title={`Cancel ${c.referenceNumber}`}
          footer={
            <Button
              variant="danger"
              className="w-full"
              loading={cancel.isPending}
              disabled={reason.trim().length < 3}
              onClick={async () => {
                if (await run(() => cancel.mutateAsync({ id: c.id, version: c.version, reason: reason.trim() }), `${c.referenceNumber} cancelled`)) {
                  setCancelling(false);
                }
              }}
            >
              Cancel calculation
            </Button>
          }
        >
          <p className="mb-3 text-sm text-muted">The calculation stays in history, marked as cancelled.</p>
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            Reason
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              maxLength={300}
              className="rounded-xl border border-border bg-surface px-4 py-3 text-base font-normal outline-none focus:border-brand"
            />
          </label>
        </Sheet>
      )}
    </article>
  );
}
