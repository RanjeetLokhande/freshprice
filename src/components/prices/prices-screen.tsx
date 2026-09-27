'use client';

import Decimal from 'decimal.js';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ApiClientError } from '@/client/api-client';
import { useMoney } from '@/client/format';
import { useMasters } from '@/client/queries/bootstrap';
import { useDailyPrices, useSaveBulkPrices } from '@/client/queries/prices';
import { formatBusinessDate, isIsoDate } from '@/domain/business-date';
import type { BootstrapData } from '@/shared/bootstrap';
import { PRICE_PATTERN, type DailyPriceRow } from '@/shared/prices';
import { DateStepper } from '../date-stepper';
import { Alert, Button, PageTitle, Skeleton } from '../ui';
import { useToast } from '../toast';

type View = 'all' | 'missing' | 'changed';

const normalize = (v: string) => (PRICE_PATTERN.test(v.trim()) ? new Decimal(v.trim()).toFixed(2) : v.trim());

export function PricesScreen() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const { data: bootstrap, derived } = useMasters();

  const today = bootstrap?.businessDate;
  const requested = params.get('date');
  const date = requested && isIsoDate(requested) ? requested : today;

  const daily = useDailyPrices(date ?? '');
  const dirtyRef = useRef(false);

  const changeDate = useCallback(
    (next: string) => {
      if (dirtyRef.current && !window.confirm('Discard unsaved price changes?')) return;
      router.replace(`${pathname}?date=${next}`, { scroll: false });
    },
    [router, pathname],
  );

  if (!bootstrap || !derived || !date || !today) return <Skeleton className="h-96" />;

  return (
    <>
      <div className="flex items-start justify-between gap-4">
        <PageTitle title="Daily prices" subtitle={`Prices for ${formatBusinessDate(date)}`} />
        <Link href="/prices/history" className="min-h-11 shrink-0 pt-1 text-sm font-medium text-brand">
          History →
        </Link>
      </div>
      <div className="mb-4">
        <DateStepper value={date} onChange={changeDate} today={today} />
      </div>

      {daily.isError ? (
        <Alert>
          Could not load prices. {daily.error.message}{' '}
          <button className="font-semibold underline" onClick={() => daily.refetch()}>
            Retry
          </button>
        </Alert>
      ) : daily.isPending ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-20" />
          ))}
        </div>
      ) : (
        // key={date}: drafts never leak from one date into another
        <PriceEditor
          key={date}
          date={date}
          rows={daily.data.rows}
          bootstrap={bootstrap}
          canWrite={derived.can('prices.write')}
          onDirtyChange={(d) => (dirtyRef.current = d)}
        />
      )}
    </>
  );
}

function PriceEditor({
  date,
  rows,
  bootstrap,
  canWrite,
  onDirtyChange,
}: {
  date: string;
  rows: DailyPriceRow[];
  bootstrap: BootstrapData;
  canWrite: boolean;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const toast = useToast();
  const money = useMoney();
  const save = useSaveBulkPrices();

  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const [rowErrors, setRowErrors] = useState<Record<number, string>>({});
  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [view, setView] = useState<View>('all');
  const inputs = useRef(new Map<number, HTMLInputElement>());

  const itemById = useMemo(() => new Map(bootstrap.items.map((i) => [i.id, i])), [bootstrap.items]);
  const unitById = useMemo(() => new Map(bootstrap.units.map((u) => [u.id, u])), [bootstrap.units]);
  const categoryById = useMemo(() => new Map(bootstrap.categories.map((c) => [c.id, c])), [bootstrap.categories]);

  // A parent category also matches its children (Vegetable ⊃ Leafy Vegetable)
  const categoryMatch = useMemo(() => {
    if (categoryId === null) return null;
    const ids = new Set([categoryId]);
    let grew = true;
    while (grew) {
      grew = false;
      for (const c of bootstrap.categories) {
        if (c.parentId !== null && ids.has(c.parentId) && !ids.has(c.id)) {
          ids.add(c.id);
          grew = true;
        }
      }
    }
    return ids;
  }, [categoryId, bootstrap.categories]);

  const state = useMemo(
    () =>
      rows.map((row) => {
        const saved = row.current?.price ?? null;
        const draft = drafts[row.itemId];
        const touched = draft !== undefined && draft.trim() !== '';
        const invalid = touched && !PRICE_PATTERN.test(draft.trim());
        const changed = touched && !invalid && normalize(draft) !== saved;
        const effective = changed ? normalize(draft) : saved;
        return { row, saved, draft, invalid, changed, effective, missing: effective === null };
      }),
    [rows, drafts],
  );

  const changes = state.filter((s) => s.changed);
  const invalidCount = state.filter((s) => s.invalid).length;
  const missingCount = state.filter((s) => s.missing).length;

  useEffect(() => {
    onDirtyChange(changes.length > 0);
    if (changes.length === 0) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [changes.length, onDirtyChange]);

  const term = search.trim().toLowerCase();
  const visible = state.filter((s) => {
    const item = itemById.get(s.row.itemId);
    if (!item) return false;
    if (term && !item.name.toLowerCase().includes(term)) return false;
    if (categoryMatch && !categoryMatch.has(item.categoryId)) return false;
    if (view === 'missing') return s.missing;
    if (view === 'changed') return s.changed || s.invalid;
    return true;
  });

  function setDraft(itemId: number, value: string) {
    setDrafts((d) => ({ ...d, [itemId]: value }));
    setRowErrors((e) => {
      if (!(itemId in e)) return e;
      const next = { ...e };
      delete next[itemId];
      return next;
    });
  }

  function focusNext(itemId: number) {
    const order = visible.map((s) => s.row.itemId);
    const next = order[order.indexOf(itemId) + 1];
    if (next !== undefined) inputs.current.get(next)?.focus();
    else inputs.current.get(itemId)?.blur();
  }

  function copyPrevious() {
    let filled = 0;
    const next = { ...drafts };
    for (const s of state) {
      if (s.saved === null && (next[s.row.itemId] ?? '').trim() === '' && s.row.previous) {
        next[s.row.itemId] = s.row.previous.price;
        filled++;
      }
    }
    setDrafts(next);
    if (filled === 0) toast.show('Nothing to copy — every priced item already has a value.', 'info');
    else toast.show(`Filled ${filled} price${filled === 1 ? '' : 's'} from earlier days. Review, then Save.`, 'info');
  }

  async function onSave() {
    if (invalidCount > 0) {
      setView('changed');
      toast.show(`Fix ${invalidCount} invalid price${invalidCount === 1 ? '' : 's'} first.`, 'error');
      return;
    }
    const batch = changes.map((s) => ({
      itemId: s.row.itemId,
      unitId: s.row.unitId,
      price: normalize(s.draft!),
      version: s.row.current?.version ?? null,
    }));

    try {
      const res = await save.mutateAsync({ date, mode: 'atomic', rows: batch });
      const errors: Record<number, string> = {};
      for (const r of res.results) {
        if (r.status === 'error' && r.itemId !== null) errors[r.itemId] = Object.values(r.errors ?? {}).flat().join(' ');
      }
      setRowErrors(errors);

      if (res.rolledBack) {
        setView('changed');
        toast.show(`Nothing saved — fix ${res.summary.failed} highlighted price${res.summary.failed === 1 ? '' : 's'}.`, 'error');
        return;
      }
      setDrafts({});
      const { created, updated } = res.summary;
      toast.show(`Saved: ${created} new, ${updated} updated`);
    } catch (e) {
      // Validation failures come back keyed by batch index ("rows.3.price")
      if (e instanceof ApiClientError && e.errors) {
        const errors: Record<number, string> = {};
        for (const [path, messages] of Object.entries(e.errors)) {
          const m = /^rows\.(\d+)\./.exec(path);
          const row = m ? batch[Number(m[1])] : undefined;
          if (row) errors[row.itemId] = messages.join(' ');
        }
        setRowErrors(errors);
      }
      toast.error(e, 'Could not save prices.');
    }
  }

  const diffBadge = (effective: string | null, previous: string | null) => {
    if (effective === null || previous === null) return null;
    const diff = new Decimal(effective).minus(previous);
    if (diff.isZero()) return <span className="text-muted">same</span>;
    const up = diff.isPositive();
    return (
      <span className={up ? 'text-danger' : 'text-brand-strong'}>
        {up ? '▲' : '▼'} {money(diff.abs().toString())}
      </span>
    );
  };

  const chip = (v: View, label: string, count?: number) => (
    <button
      type="button"
      aria-pressed={view === v}
      onClick={() => setView(v)}
      className={`min-h-10 shrink-0 rounded-full px-4 text-sm font-medium ${
        view === v ? 'bg-brand text-brand-fg' : 'border border-border bg-surface text-muted'
      }`}
    >
      {label}
      {count !== undefined && <span className="num"> ({count})</span>}
    </button>
  );

  return (
    <>
      {/* Summary + actions */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">
          <span className="num font-semibold text-text">{rows.length - missingCount}</span> of{' '}
          <span className="num">{rows.length}</span> items priced
          {missingCount > 0 && (
            <>
              {' · '}
              <span className="font-medium text-danger">{missingCount} missing</span>
            </>
          )}
        </p>
        {canWrite && bootstrap.settings.allowCopyPreviousPrice && missingCount > 0 && (
          <Button variant="secondary" onClick={copyPrevious}>
            Copy previous prices
          </Button>
        )}
      </div>

      {/* Filters */}
      <div className="mb-3 flex flex-col gap-3 md:flex-row md:items-center">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search items…"
          aria-label="Search items"
          className="min-h-12 w-full rounded-xl border border-border bg-surface px-4 text-base outline-none focus:border-brand md:max-w-xs"
        />
        <select
          value={categoryId ?? ''}
          onChange={(e) => setCategoryId(e.target.value ? Number(e.target.value) : null)}
          aria-label="Category"
          className="min-h-12 rounded-xl border border-border bg-surface px-4 text-base md:w-52"
        >
          <option value="">All categories</option>
          {bootstrap.categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.parentId ? `  ${c.name}` : c.name}
            </option>
          ))}
        </select>
      </div>
      <div className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1" role="group" aria-label="Show">
        {chip('all', 'All', rows.length)}
        {chip('missing', 'Missing', missingCount)}
        {chip('changed', 'Changed', changes.length + invalidCount)}
      </div>

      {!canWrite && (
        <div className="mb-3">
          <Alert tone="info">You can view prices. Only users with price permission can change them.</Alert>
        </div>
      )}

      {visible.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-8 text-center text-muted">No items to show.</div>
      ) : (
        <ul className="grid gap-2 lg:grid-cols-2">
          {visible.map((s) => {
            const item = itemById.get(s.row.itemId)!;
            const unit = unitById.get(s.row.unitId);
            const error = rowErrors[s.row.itemId] ?? (s.invalid ? 'Enter a price like 30 or 30.50.' : undefined);
            const status = error ? 'error' : s.changed ? 'changed' : s.missing ? 'missing' : 'saved';
            const bar = {
              error: 'border-l-danger',
              changed: 'border-l-warn',
              missing: 'border-l-danger',
              saved: 'border-l-brand',
            }[status];
            const inputId = `price-${s.row.itemId}`;

            return (
              <li
                key={s.row.itemId}
                className={`flex items-center gap-3 rounded-2xl border border-l-4 border-border bg-surface py-3 pl-3 pr-3 ${bar}`}
              >
                <div className="min-w-0 flex-1">
                  <label htmlFor={inputId} className="block truncate font-semibold">
                    {item.name}
                    <span className="sr-only">
                      {' '}
                      ({status === 'missing' ? 'price missing' : status === 'changed' ? 'unsaved change' : status})
                    </span>
                  </label>
                  <div className="mt-0.5 flex flex-wrap gap-x-2 text-xs text-muted">
                    <span>{categoryById.get(item.categoryId)?.name}</span>
                    {s.row.previous ? (
                      <span className="num">
                        Prev {money(s.row.previous.price)} · {formatBusinessDate(s.row.previous.date)}
                      </span>
                    ) : (
                      <span>No earlier price</span>
                    )}
                    <span className="num">{diffBadge(s.effective, s.row.previous?.price ?? null)}</span>
                  </div>
                  {error && (
                    <p id={`${inputId}-error`} className="mt-1 text-xs font-medium text-danger">
                      {error}
                    </p>
                  )}
                  {status === 'missing' && !error && (
                    <p className="mt-1 text-xs font-medium text-danger">Price not set for this date</p>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <span className="text-muted" aria-hidden>
                    {bootstrap.settings.currencySymbol}
                  </span>
                  <input
                    id={inputId}
                    ref={(el) => {
                      if (el) inputs.current.set(s.row.itemId, el);
                      else inputs.current.delete(s.row.itemId);
                    }}
                    type="text"
                    inputMode="decimal"
                    enterKeyHint="next"
                    autoComplete="off"
                    disabled={!canWrite}
                    value={s.draft ?? s.saved ?? ''}
                    placeholder={s.row.previous?.price ?? '0.00'}
                    onChange={(e) => setDraft(s.row.itemId, e.target.value.replace(',', '.'))}
                    onBlur={() => {
                      // Clearing a saved price is not a delete — restore it
                      if (s.saved !== null && (drafts[s.row.itemId] ?? '').trim() === '') {
                        setDrafts((d) => {
                          const next = { ...d };
                          delete next[s.row.itemId];
                          return next;
                        });
                      }
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        focusNext(s.row.itemId);
                      }
                    }}
                    aria-invalid={error ? true : undefined}
                    aria-describedby={error ? `${inputId}-error` : undefined}
                    className={`num min-h-12 w-24 rounded-xl border bg-surface px-3 text-right text-lg outline-none focus:border-brand disabled:bg-surface-2 ${
                      error ? 'border-danger' : s.changed ? 'border-warn' : 'border-border'
                    }`}
                  />
                  <span className="w-12 text-sm text-muted">/{unit?.symbol ?? ''}</span>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {/* Sticky save bar */}
      {canWrite && (changes.length > 0 || invalidCount > 0) && (
        <div className="fixed inset-x-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-20 border-t border-border bg-surface px-4 py-3 shadow-[0_-4px_12px_rgba(0,0,0,0.06)] md:bottom-0 md:left-56">
          <div className="mx-auto flex max-w-5xl items-center justify-between gap-3">
            <span className="text-sm">
              <span className="num font-semibold">{changes.length}</span> change{changes.length === 1 ? '' : 's'}
              {invalidCount > 0 && <span className="text-danger"> · {invalidCount} invalid</span>}
            </span>
            <div className="flex gap-2">
              <Button
                variant="secondary"
                onClick={() => {
                  setDrafts({});
                  setRowErrors({});
                }}
              >
                Discard
              </Button>
              <Button onClick={onSave} loading={save.isPending}>
                Save prices
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
