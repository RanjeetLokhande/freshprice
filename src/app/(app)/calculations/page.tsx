'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useMoney } from '@/client/format';
import { useMasters } from '@/client/queries/bootstrap';
import { useCalculations } from '@/client/queries/calculations';
import { formatBusinessDate } from '@/domain/business-date';
import { StatusBadge } from '@/components/calc/status-badge';
import { ChevronRightIcon } from '@/components/icons';
import { Alert, Button, PageTitle, Skeleton } from '@/components/ui';

const PAGE_SIZE = 30;
const FIELD = 'min-h-12 w-full rounded-xl border border-border bg-surface px-4 text-base outline-none focus:border-brand';
type Status = 'draft' | 'finalized' | 'cancelled' | undefined;

export default function CalculationHistoryPage() {
  const money = useMoney();
  const { data: bootstrap } = useMasters();
  const [status, setStatus] = useState<Status>();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [itemId, setItemId] = useState<number | undefined>();
  const [page, setPage] = useState(1);

  const list = useCalculations({
    status,
    from: from || undefined,
    to: to || undefined,
    itemId,
    page,
    pageSize: PAGE_SIZE,
  });
  const rows = list.data?.data ?? [];
  const total = list.data?.meta?.total ?? 0;

  const chip = (v: Status, label: string) => (
    <button
      key={label}
      type="button"
      aria-pressed={status === v}
      onClick={() => {
        setStatus(v);
        setPage(1);
      }}
      className={`min-h-10 shrink-0 rounded-full px-4 text-sm font-medium ${
        status === v ? 'bg-brand text-brand-fg' : 'border border-border bg-surface text-muted'
      }`}
    >
      {label}
    </button>
  );

  return (
    <>
      <div className="flex items-start justify-between gap-4">
        <PageTitle title="Calculations" subtitle={list.data ? `${total} found` : undefined} />
        <Link
          href="/calculate"
          className="inline-flex min-h-12 shrink-0 items-center rounded-xl bg-brand px-4 font-semibold text-brand-fg hover:bg-brand-strong"
        >
          + New
        </Link>
      </div>

      <div className="-mx-4 mb-3 flex gap-2 overflow-x-auto px-4 pb-1" role="group" aria-label="Status">
        {chip(undefined, 'All')}
        {chip('draft', 'Drafts')}
        {chip('finalized', 'Finalized')}
        {chip('cancelled', 'Cancelled')}
      </div>
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-3">
        <label className="flex flex-col gap-1 text-xs font-medium text-muted">
          From
          <input type="date" className={FIELD} value={from} max={to || undefined} onChange={(e) => { setFrom(e.target.value); setPage(1); }} />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-muted">
          To
          <input type="date" className={FIELD} value={to} min={from || undefined} onChange={(e) => { setTo(e.target.value); setPage(1); }} />
        </label>
        <label className="col-span-2 flex flex-col gap-1 text-xs font-medium text-muted md:col-span-1">
          Contains item
          <select
            className={FIELD}
            value={itemId ?? ''}
            onChange={(e) => {
              setItemId(e.target.value ? Number(e.target.value) : undefined);
              setPage(1);
            }}
          >
            <option value="">Any item</option>
            {bootstrap?.items.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      {list.isError ? (
        <Alert>Could not load calculations. {list.error.message}</Alert>
      ) : list.isPending ? (
        <Skeleton className="h-64" />
      ) : rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-8 text-center text-muted">
          No calculations yet.{' '}
          <Link href="/calculate" className="font-semibold text-brand">
            Create one
          </Link>
        </div>
      ) : (
        <div className={list.isPlaceholderData ? 'opacity-60' : undefined}>
          <ul className="flex flex-col gap-2 lg:hidden">
            {rows.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/calculations/${c.id}`}
                  className="flex min-h-16 items-center gap-3 rounded-2xl border border-border bg-surface px-4 py-3 hover:bg-surface-2"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold num">{c.referenceNumber}</span>
                      <StatusBadge status={c.status} />
                    </div>
                    <div className="text-xs text-muted num">
                      {formatBusinessDate(c.date)} · {c.lineCount} item{c.lineCount === 1 ? '' : 's'}
                    </div>
                  </div>
                  <div className="shrink-0 text-lg font-semibold num">{money(c.grandTotal)}</div>
                  <ChevronRightIcon className="shrink-0 text-muted" />
                </Link>
              </li>
            ))}
          </ul>

          <div className="hidden overflow-hidden rounded-2xl border border-border bg-surface lg:block">
            <table className="w-full text-sm">
              <thead className="bg-surface-2 text-left text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-4 py-3 font-semibold">Date</th>
                  <th className="px-4 py-3 font-semibold">Reference</th>
                  <th className="px-4 py-3 font-semibold">Items</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 text-right font-semibold">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((c) => (
                  <tr key={c.id} className="hover:bg-surface-2">
                    <td className="px-4 py-3 num">{formatBusinessDate(c.date)}</td>
                    <td className="px-4 py-3 font-medium">
                      <Link href={`/calculations/${c.id}`} className="text-brand hover:underline">
                        {c.referenceNumber}
                      </Link>
                    </td>
                    <td className="px-4 py-3 num">{c.lineCount}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={c.status} />
                    </td>
                    <td className="px-4 py-3 text-right font-semibold num">{money(c.grandTotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {total > PAGE_SIZE && (
            <div className="mt-4 flex items-center justify-between text-sm">
              <span className="text-muted num">
                {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} of {total}
              </span>
              <div className="flex gap-2">
                <Button variant="secondary" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>
                  Previous
                </Button>
                <Button variant="secondary" disabled={page * PAGE_SIZE >= total} onClick={() => setPage((p) => p + 1)}>
                  Next
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}
