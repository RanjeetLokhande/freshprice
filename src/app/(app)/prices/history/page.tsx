'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useMoney } from '@/client/format';
import { useMasters } from '@/client/queries/bootstrap';
import { usePriceHistory } from '@/client/queries/prices';
import { formatBusinessDate } from '@/domain/business-date';
import { Alert, Button, PageTitle, Skeleton } from '@/components/ui';

const PAGE_SIZE = 50;
const FIELD = 'min-h-12 w-full rounded-xl border border-border bg-surface px-4 text-base outline-none focus:border-brand';

export default function PriceHistoryPage() {
  const { data: bootstrap } = useMasters();
  const money = useMoney();

  const [itemId, setItemId] = useState<number | undefined>();
  const [categoryId, setCategoryId] = useState<number | undefined>();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);

  const history = usePriceHistory({
    itemId,
    categoryId,
    from: from || undefined,
    to: to || undefined,
    page,
    pageSize: PAGE_SIZE,
  });

  const resetPage = <T,>(fn: (v: T) => void) => (v: T) => {
    fn(v);
    setPage(1);
  };

  if (!bootstrap) return <Skeleton className="h-96" />;

  const rows = history.data?.data ?? [];
  const total = history.data?.meta?.total ?? 0;
  const categoryName = new Map(bootstrap.categories.map((c) => [c.id, c.name]));
  const hasFilters = itemId || categoryId || from || to;

  return (
    <>
      <div className="flex items-start justify-between gap-4">
        <PageTitle title="Price history" subtitle={history.data ? `${total} price record${total === 1 ? '' : 's'}` : undefined} />
        <Link href="/prices" className="min-h-11 shrink-0 pt-1 text-sm font-medium text-brand">
          ← Enter prices
        </Link>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <select
          className={`${FIELD} col-span-2 md:col-span-1`}
          aria-label="Item"
          value={itemId ?? ''}
          onChange={(e) => resetPage(setItemId)(e.target.value ? Number(e.target.value) : undefined)}
        >
          <option value="">All items</option>
          {bootstrap.items.map((i) => (
            <option key={i.id} value={i.id}>
              {i.name}
            </option>
          ))}
        </select>
        <select
          className={`${FIELD} col-span-2 md:col-span-1`}
          aria-label="Category"
          value={categoryId ?? ''}
          onChange={(e) => resetPage(setCategoryId)(e.target.value ? Number(e.target.value) : undefined)}
        >
          <option value="">All categories</option>
          {bootstrap.categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <label className="flex flex-col gap-1 text-xs font-medium text-muted">
          From
          <input type="date" className={FIELD} value={from} max={to || undefined} onChange={(e) => resetPage(setFrom)(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-muted">
          To
          <input type="date" className={FIELD} value={to} min={from || undefined} onChange={(e) => resetPage(setTo)(e.target.value)} />
        </label>
      </div>
      {hasFilters && (
        <button
          type="button"
          className="-mt-2 mb-3 min-h-10 text-sm font-medium text-brand"
          onClick={() => {
            setItemId(undefined);
            setCategoryId(undefined);
            setFrom('');
            setTo('');
            setPage(1);
          }}
        >
          Clear filters
        </button>
      )}

      {history.isError ? (
        <Alert>Could not load price history. {history.error.message}</Alert>
      ) : history.isPending ? (
        <Skeleton className="h-64" />
      ) : rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-8 text-center text-muted">No prices found.</div>
      ) : (
        <div className={history.isPlaceholderData ? 'opacity-60' : undefined}>
          {/* Phones: cards */}
          <ul className="flex flex-col gap-2 lg:hidden">
            {rows.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-surface px-4 py-3">
                <div className="min-w-0">
                  <div className="truncate font-semibold">{r.itemName}</div>
                  <div className="text-xs text-muted num">
                    {formatBusinessDate(r.date)} · {categoryName.get(r.categoryId)}
                    {r.revisions > 0 && ` · edited ${r.revisions}×`}
                  </div>
                </div>
                <div className="shrink-0 text-right font-semibold num">
                  {money(r.price)}
                  <span className="text-sm font-normal text-muted">/{r.unitSymbol}</span>
                </div>
              </li>
            ))}
          </ul>

          {/* Desktop: table */}
          <div className="hidden overflow-hidden rounded-2xl border border-border bg-surface lg:block">
            <table className="w-full text-sm">
              <thead className="bg-surface-2 text-left text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-4 py-3 font-semibold">Date</th>
                  <th className="px-4 py-3 font-semibold">Item</th>
                  <th className="px-4 py-3 font-semibold">Category</th>
                  <th className="px-4 py-3 text-right font-semibold">Rate</th>
                  <th className="px-4 py-3 font-semibold">Edits</th>
                  <th className="px-4 py-3 font-semibold">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td className="px-4 py-3 num">{formatBusinessDate(r.date)}</td>
                    <td className="px-4 py-3 font-medium">{r.itemName}</td>
                    <td className="px-4 py-3 text-muted">{categoryName.get(r.categoryId)}</td>
                    <td className="px-4 py-3 text-right num">
                      {money(r.price)}/{r.unitSymbol}
                    </td>
                    <td className="px-4 py-3 num text-muted">{r.revisions || '—'}</td>
                    <td className="px-4 py-3 text-muted">{r.notes ?? '—'}</td>
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
