'use client';

import Link from 'next/link';
import { useState } from 'react';
import { downloadFile } from '@/client/api-client';
import { useMoney } from '@/client/format';
import { useMasters } from '@/client/queries/bootstrap';
import { useDailyTotals, useItemSummary } from '@/client/queries/reports';
import { addDays, formatBusinessDate } from '@/domain/business-date';
import type { ReportKind } from '@/shared/reports';
import { Alert, Button, PageTitle, Skeleton } from '@/components/ui';
import { useToast } from '@/components/toast';

type Preset = 'today' | 'yesterday' | 'week' | 'month' | 'custom';
const FIELD = 'min-h-12 w-full rounded-xl border border-border bg-surface px-4 text-base outline-none focus:border-brand';

function presetRange(preset: Exclude<Preset, 'custom'>, today: string): [string, string] {
  switch (preset) {
    case 'today':
      return [today, today];
    case 'yesterday':
      return [addDays(today, -1), addDays(today, -1)];
    case 'week':
      return [addDays(today, -6), today];
    case 'month':
      return [`${today.slice(0, 8)}01`, today];
  }
}

export default function ReportsPage() {
  const { data: bootstrap, derived } = useMasters();
  const toast = useToast();
  const money = useMoney();
  const [tab, setTab] = useState<ReportKind>('items');
  const [preset, setPreset] = useState<Preset>('today');
  const [custom, setCustom] = useState<[string, string]>(['', '']);
  const [itemId, setItemId] = useState<number | undefined>();
  const [downloading, setDownloading] = useState<string | null>(null);

  const today = bootstrap?.businessDate ?? '';
  const [from, to] = preset === 'custom' ? custom : presetRange(preset, today);
  const validRange = Boolean(from && to && from <= to);
  const allowed = derived?.can('reports.read') ?? false;

  const items = useItemSummary(from, to, allowed && validRange && tab === 'items');
  const daily = useDailyTotals(from, to, allowed && validRange && tab === 'daily-totals');

  if (!bootstrap || !derived) return <Skeleton className="h-96" />;
  if (!allowed) return <Alert tone="info">Reports are available to users with report permission.</Alert>;

  async function exportAs(format: 'csv' | 'xlsx') {
    setDownloading(format);
    try {
      await downloadFile(`/reports/${tab}/export`, { from, to, format, itemId }, `${tab}.${format}`);
    } catch (e) {
      toast.error(e, 'Export failed.');
    } finally {
      setDownloading(null);
    }
  }

  const rangeLabel = !validRange
    ? 'Choose a date range'
    : from === to
      ? formatBusinessDate(from)
      : `${formatBusinessDate(from)} – ${formatBusinessDate(to)}`;

  const pill = (active: boolean) =>
    `min-h-10 shrink-0 rounded-full px-4 text-sm font-medium ${active ? 'bg-brand text-brand-fg' : 'border border-border bg-surface text-muted'}`;

  return (
    <>
      <PageTitle title="Reports" subtitle={rangeLabel} />

      {/* Report type */}
      <div className="mb-3 grid grid-cols-3 gap-1 rounded-2xl bg-surface-2 p-1 print:hidden" role="tablist">
        {(
          [
            ['items', 'Items'],
            ['daily-totals', 'Daily totals'],
            ['price-history', 'Prices'],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            role="tab"
            aria-selected={tab === k}
            onClick={() => setTab(k)}
            className={`min-h-11 rounded-xl text-sm font-semibold ${tab === k ? 'bg-surface shadow-sm' : 'text-muted'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Range */}
      <div className="-mx-4 mb-3 flex gap-2 overflow-x-auto px-4 pb-1 print:hidden" role="group" aria-label="Date range">
        {(
          [
            ['today', 'Today'],
            ['yesterday', 'Yesterday'],
            ['week', 'Last 7 days'],
            ['month', 'This month'],
            ['custom', 'Custom'],
          ] as const
        ).map(([p, label]) => (
          <button
            key={p}
            type="button"
            aria-pressed={preset === p}
            className={pill(preset === p)}
            onClick={() => {
              if (p === 'custom' && !custom[0]) setCustom([from, to]);
              setPreset(p);
            }}
          >
            {label}
          </button>
        ))}
      </div>
      {preset === 'custom' && (
        <div className="mb-3 grid grid-cols-2 gap-3 print:hidden">
          <label className="flex flex-col gap-1 text-xs font-medium text-muted">
            From
            <input type="date" className={FIELD} value={custom[0]} onChange={(e) => setCustom([e.target.value, custom[1]])} />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-muted">
            To
            <input type="date" className={FIELD} value={custom[1]} min={custom[0]} onChange={(e) => setCustom([custom[0], e.target.value])} />
          </label>
        </div>
      )}
      {tab === 'price-history' && (
        <div className="mb-3 print:hidden">
          <select
            aria-label="Item"
            className={`${FIELD} md:w-64`}
            value={itemId ?? ''}
            onChange={(e) => setItemId(e.target.value ? Number(e.target.value) : undefined)}
          >
            <option value="">All items</option>
            {bootstrap.items.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Export */}
      <div className="mb-4 flex flex-wrap gap-2 print:hidden">
        <Button variant="secondary" disabled={!validRange} loading={downloading === 'csv'} onClick={() => exportAs('csv')}>
          CSV
        </Button>
        <Button variant="secondary" disabled={!validRange} loading={downloading === 'xlsx'} onClick={() => exportAs('xlsx')}>
          Excel
        </Button>
        {tab !== 'price-history' && (
          <Button variant="secondary" disabled={!validRange} onClick={() => window.print()}>
            Print
          </Button>
        )}
      </div>

      {!validRange ? null : tab === 'items' ? (
        <ItemsReport query={items} money={money} />
      ) : tab === 'daily-totals' ? (
        <DailyReport query={daily} money={money} />
      ) : (
        <div className="rounded-2xl border border-border bg-surface p-4 text-sm text-muted">
          Export every price in the range (with edit counts), or{' '}
          <Link href="/prices/history" className="font-semibold text-brand">
            browse price history
          </Link>
          .
        </div>
      )}
    </>
  );
}

function ItemsReport({ query, money }: { query: ReturnType<typeof useItemSummary>; money: ReturnType<typeof useMoney> }) {
  if (query.isError) return <Alert>{query.error.message}</Alert>;
  if (query.isPending) return <Skeleton className="h-64" />;
  const r = query.data;
  if (r.rows.length === 0) {
    return <div className="rounded-2xl border border-dashed border-border p-8 text-center text-muted">No finalized calculations in this range.</div>;
  }
  return (
    <div className={query.isPlaceholderData ? 'opacity-60' : undefined}>
      <ul className="flex flex-col gap-2 md:hidden print:hidden">
        {r.rows.map((x) => (
          <li key={`${x.itemId}:${x.unitSymbol}`} className="rounded-2xl border border-border bg-surface px-4 py-3">
            <div className="flex justify-between gap-3">
              <span className="font-semibold">{x.itemName}</span>
              <span className="font-semibold num">{money(x.amount)}</span>
            </div>
            <div className="text-sm text-muted num">
              {x.quantity} {x.unitSymbol}
              {x.avgRate && ` · avg ${money(x.avgRate)}/${x.unitSymbol}`}
            </div>
          </li>
        ))}
        <li className="flex justify-between rounded-2xl bg-surface-2 px-4 py-3 font-bold">
          <span>Total</span>
          <span className="num">{money(r.total)}</span>
        </li>
      </ul>
      <div className="hidden overflow-hidden rounded-2xl border border-border bg-surface md:block print:block">
        <table className="w-full text-sm">
          <thead className="bg-surface-2 text-left text-xs uppercase tracking-wide text-muted">
            <tr>
              <th className="px-4 py-3 font-semibold">Item</th>
              <th className="px-4 py-3 font-semibold">Category</th>
              <th className="px-4 py-3 text-right font-semibold">Quantity</th>
              <th className="px-4 py-3 text-right font-semibold">Avg rate</th>
              <th className="px-4 py-3 text-right font-semibold">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {r.rows.map((x) => (
              <tr key={`${x.itemId}:${x.unitSymbol}`}>
                <td className="px-4 py-3 font-medium">{x.itemName}</td>
                <td className="px-4 py-3 text-muted">{x.categoryName ?? '—'}</td>
                <td className="px-4 py-3 text-right num">
                  {x.quantity} {x.unitSymbol}
                </td>
                <td className="px-4 py-3 text-right num">{x.avgRate ? `${money(x.avgRate)}/${x.unitSymbol}` : '—'}</td>
                <td className="px-4 py-3 text-right font-semibold num">{money(x.amount)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-border font-bold">
              <td className="px-4 py-3" colSpan={4}>
                Total
              </td>
              <td className="px-4 py-3 text-right num">{money(r.total)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

function DailyReport({ query, money }: { query: ReturnType<typeof useDailyTotals>; money: ReturnType<typeof useMoney> }) {
  if (query.isError) return <Alert>{query.error.message}</Alert>;
  if (query.isPending) return <Skeleton className="h-64" />;
  const r = query.data;
  return (
    <div className={`overflow-hidden rounded-2xl border border-border bg-surface ${query.isPlaceholderData ? 'opacity-60' : ''}`}>
      <table className="w-full text-sm">
        <thead className="bg-surface-2 text-left text-xs uppercase tracking-wide text-muted">
          <tr>
            <th className="px-4 py-3 font-semibold">Date</th>
            <th className="px-4 py-3 text-right font-semibold">Calcs</th>
            <th className="hidden px-4 py-3 text-right font-semibold sm:table-cell">Lines</th>
            <th className="px-4 py-3 text-right font-semibold">Total</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {r.rows.map((d) => (
            <tr key={d.day} className={d.calculations === 0 ? 'text-muted' : undefined}>
              <td className="px-4 py-3 num">{formatBusinessDate(d.day)}</td>
              <td className="px-4 py-3 text-right num">{d.calculations}</td>
              <td className="hidden px-4 py-3 text-right num sm:table-cell">{d.lines}</td>
              <td className="px-4 py-3 text-right font-semibold num">{money(d.total)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-border font-bold">
            <td className="px-4 py-3" colSpan={2}>
              Total
            </td>
            <td className="hidden sm:table-cell" />
            <td className="px-4 py-3 text-right num">{money(r.total)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
