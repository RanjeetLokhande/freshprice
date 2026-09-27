'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ApiClientError } from '@/client/api-client';
import { useMoney } from '@/client/format';
import { useMasters } from '@/client/queries/bootstrap';
import { useCalculation, useSaveCalculation } from '@/client/queries/calculations';
import { useDailyPrices } from '@/client/queries/prices';
import { formatBusinessDate } from '@/domain/business-date';
import { calculateLine, calculateTotals, type LineResult } from '@/domain/calculate';
import { DomainError } from '@/domain/errors';
import { compatibleUnits, type UnitIndex } from '@/domain/units';
import type { BootstrapData } from '@/shared/bootstrap';
import type { CalculationDto } from '@/shared/calculations';
import type { DailyPriceRow } from '@/shared/prices';
import { DateStepper } from '../date-stepper';
import { Alert, Button, PageTitle, Skeleton } from '../ui';
import { useToast } from '../toast';
import { ItemPicker } from './item-picker';
import { QuickPriceSheet } from './quick-price-sheet';

interface Line {
  key: string;
  itemId: number;
  unitId: number;
  quantity: string;
}

const newKey = () => crypto.randomUUID();

export function CalculateScreen() {
  const params = useSearchParams();
  const editId = Number(params.get('id')) || null;
  const { data: bootstrap, derived } = useMasters();
  const draft = useCalculation(editId);

  if (!bootstrap || !derived || (editId && draft.isPending)) return <Skeleton className="h-96" />;
  if (editId && draft.isError) return <Alert>Could not load this calculation. {draft.error.message}</Alert>;
  if (draft.data && draft.data.status !== 'draft') {
    return (
      <Alert tone="info">
        {draft.data.referenceNumber} is {draft.data.status} and can’t be edited.{' '}
        <Link className="font-semibold underline" href={`/calculations/${draft.data.id}`}>
          View it
        </Link>
      </Alert>
    );
  }

  return (
    <CalculationEditor
      key={draft.data ? `${draft.data.id}:${draft.data.version}` : 'new'}
      bootstrap={bootstrap}
      unitIndex={derived.unitIndex}
      canFinalize={derived.can('calculations.finalize')}
      canWritePrices={derived.can('prices.write')}
      existing={draft.data ?? null}
    />
  );
}

type Computed =
  | { state: 'ok'; result: LineResult }
  | { state: 'pending' }
  | { state: 'missing-price' }
  | { state: 'error'; field: string; message: string };

function CalculationEditor({
  bootstrap,
  unitIndex,
  canFinalize,
  canWritePrices,
  existing,
}: {
  bootstrap: BootstrapData;
  unitIndex: UnitIndex;
  canFinalize: boolean;
  canWritePrices: boolean;
  existing: CalculationDto | null;
}) {
  const router = useRouter();
  const toast = useToast();
  const money = useMoney();
  const save = useSaveCalculation();

  const [date, setDate] = useState(existing?.date ?? bootstrap.businessDate);
  const [lines, setLines] = useState<Line[]>(
    () => existing?.lines.map((l) => ({ key: newKey(), itemId: l.itemId, unitId: l.unitId, quantity: l.quantity })) ?? [],
  );
  const [adjustment, setAdjustment] = useState(existing && existing.adjustment !== '0.00' ? existing.adjustment : '');
  const [notes, setNotes] = useState(existing?.notes ?? '');
  const [showMore, setShowMore] = useState(Boolean(existing?.notes || (existing && existing.adjustment !== '0.00')));
  const [serverErrors, setServerErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const [pricing, setPricing] = useState<{ itemId: number; initial?: string } | null>(null);
  // One key per new calculation: a double tap or retry can't create two
  const [idempotencyKey] = useState(newKey);
  const qtyInputs = useRef(new Map<string, HTMLInputElement>());
  const focusKey = useRef<string | null>(null);
  const saved = useRef(false);

  const daily = useDailyPrices(date);
  const priceRows = useMemo(() => new Map((daily.data?.rows ?? []).map((r) => [r.itemId, r])), [daily.data]);
  const itemById = useMemo(() => new Map(bootstrap.items.map((i) => [i.id, i])), [bootstrap.items]);
  const unitById = useMemo(() => new Map(bootstrap.units.map((u) => [u.id, u])), [bootstrap.units]);

  // Instant local preview with the SAME engine the server uses; the server re-computes on save.
  const computed = useMemo(
    () =>
      lines.map((line): Computed => {
        const item = itemById.get(line.itemId);
        if (!item) return { state: 'error', field: 'itemId', message: 'This item is no longer available.' };
        if (!daily.data) return { state: 'pending' };
        const row = priceRows.get(line.itemId);
        if (!row?.current) return { state: 'missing-price' };
        if (line.quantity.trim() === '') return { state: 'pending' };
        try {
          return {
            state: 'ok',
            result: calculateLine(
              {
                quantity: line.quantity,
                unitId: line.unitId,
                price: row.current.price,
                priceUnitId: item.pricingUnitId,
                itemConversions: item.conversions,
              },
              unitIndex,
              bootstrap.settings.money,
            ),
          };
        } catch (e) {
          if (e instanceof DomainError) return { state: 'error', field: e.field ?? 'quantity', message: e.message };
          throw e;
        }
      }),
    [lines, itemById, priceRows, daily.data, unitIndex, bootstrap.settings.money],
  );

  const adjustmentValid = adjustment.trim() === '' || /^-?\d{1,10}(\.\d{1,2})?$/.test(adjustment.trim());
  const totals = calculateTotals(
    computed.flatMap((c) => (c.state === 'ok' ? [c.result.amount] : [])),
    adjustmentValid && adjustment.trim() ? adjustment.trim() : '0',
    bootstrap.settings.money,
  );
  const problems = computed.filter((c) => c.state !== 'ok').length;
  const dirty = !saved.current && (lines.length > 0 || notes.trim() !== '' || adjustment.trim() !== '');

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  // Focus the quantity of a just-added line once it renders
  useEffect(() => {
    if (focusKey.current) {
      qtyInputs.current.get(focusKey.current)?.focus();
      focusKey.current = null;
    }
  }, [lines]);

  function pick(itemId: number) {
    setPicking(false);
    const existingLine = lines.find((l) => l.itemId === itemId);
    if (existingLine && bootstrap.settings.duplicateLinePolicy === 'merge') {
      // Prevent accidental duplicates: jump to the existing line instead
      toast.show(`${itemById.get(itemId)?.name} is already in the list — update its quantity.`, 'info');
      const el = qtyInputs.current.get(existingLine.key);
      el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      el?.focus({ preventScroll: true });
      return;
    }
    const item = itemById.get(itemId)!;
    const key = newKey();
    focusKey.current = key;
    setLines((ls) => [...ls, { key, itemId, unitId: item.defaultUnitId, quantity: '' }]);
  }

  function update(key: string, patch: Partial<Line>) {
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
    setServerErrors({});
  }

  function remove(key: string) {
    setLines((ls) => ls.filter((l) => l.key !== key));
    setServerErrors({});
  }

  async function submit(finalize: boolean) {
    setFormError(null);
    if (lines.length === 0) return setFormError('Add at least one item.');
    if (problems > 0) return setFormError('Fix the highlighted lines first.');
    if (!adjustmentValid) return setFormError('Adjustment must be an amount like -50 or 25.50.');
    if (finalize && !window.confirm('Finalize this calculation? It can’t be edited afterwards.')) return;

    const input = {
      date,
      notes: notes.trim() || null,
      adjustment: adjustment.trim() || '0',
      lines: lines.map((l) => ({ itemId: l.itemId, unitId: l.unitId, quantity: l.quantity.trim() })),
      finalize,
    };
    try {
      const calc = await save.mutateAsync(
        existing ? { id: existing.id, version: existing.version, input } : { input, idempotencyKey },
      );
      saved.current = true;
      toast.show(
        calc.replayed ? `${calc.referenceNumber} was already saved` : `${calc.referenceNumber} ${finalize ? 'finalized' : 'saved as draft'}`,
      );
      router.push(`/calculations/${calc.id}`);
    } catch (e) {
      if (e instanceof ApiClientError && e.errors) {
        const errs: Record<string, string> = {};
        for (const [path, msgs] of Object.entries(e.errors)) {
          const m = /^lines\.(\d+)\./.exec(path);
          const line = m ? lines[Number(m[1])] : undefined;
          if (line) errs[line.key] = msgs.join(' ');
        }
        setServerErrors(errs);
      }
      setFormError(e instanceof ApiClientError ? e.message : 'Could not save.');
      // A price changed on the server: refresh rates so the preview matches
      if (e instanceof ApiClientError && /price/i.test(e.message)) void daily.refetch();
    }
  }

  const priceText = (itemId: number) => {
    const row = priceRows.get(itemId);
    const item = itemById.get(itemId);
    if (!row?.current || !item) return null;
    return `${money(row.current.price)}/${unitById.get(item.pricingUnitId)?.symbol ?? ''}`;
  };

  const pricingItem = pricing ? itemById.get(pricing.itemId) : null;

  return (
    <>
      <PageTitle
        title={existing ? `Edit ${existing.referenceNumber}` : 'New calculation'}
        subtitle={existing ? 'Draft' : undefined}
      />
      <div className="mb-4">
        <DateStepper value={date} onChange={setDate} today={bootstrap.businessDate} />
      </div>

      {daily.isError && (
        <div className="mb-3">
          <Alert>Could not load prices for this date. {daily.error.message}</Alert>
        </div>
      )}

      {lines.length === 0 ? (
        <button
          type="button"
          onClick={() => setPicking(true)}
          className="flex min-h-40 w-full flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-border text-muted hover:bg-surface-2"
        >
          <span className="text-4xl leading-none text-brand">+</span>
          <span className="font-medium">Add your first item</span>
        </button>
      ) : (
        <ul className="flex flex-col gap-2">
          {lines.map((line, index) => (
            <LineCard
              key={line.key}
              index={index}
              line={line}
              computed={computed[index]}
              serverError={serverErrors[line.key]}
              bootstrap={bootstrap}
              unitIndex={unitIndex}
              priceRow={priceRows.get(line.itemId)}
              date={date}
              canWritePrices={canWritePrices}
              money={money}
              inputRef={(el) => {
                if (el) qtyInputs.current.set(line.key, el);
                else qtyInputs.current.delete(line.key);
              }}
              onChange={(patch) => update(line.key, patch)}
              onRemove={() => remove(line.key)}
              onAddPrice={(initial) => setPricing({ itemId: line.itemId, initial })}
              onEnter={() => {
                const next = lines[index + 1];
                if (next) qtyInputs.current.get(next.key)?.focus();
                else setPicking(true);
              }}
            />
          ))}
        </ul>
      )}

      {lines.length > 0 && (
        <Button variant="secondary" className="mt-3 w-full" onClick={() => setPicking(true)}>
          + Add item
        </Button>
      )}

      {/* Adjustment & notes */}
      <div className="mt-4">
        {showMore ? (
          <div className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4">
            <label className="flex flex-col gap-1.5 text-sm font-medium">
              Adjustment (discount as negative)
              <input
                type="text"
                inputMode="decimal"
                value={adjustment}
                onChange={(e) => setAdjustment(e.target.value.replace(',', '.'))}
                placeholder="0.00"
                aria-invalid={!adjustmentValid || undefined}
                className={`num min-h-12 rounded-xl border bg-surface px-4 text-base font-normal outline-none focus:border-brand ${
                  adjustmentValid ? 'border-border' : 'border-danger'
                }`}
              />
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-medium">
              Notes
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                maxLength={500}
                className="rounded-xl border border-border bg-surface px-4 py-3 text-base font-normal outline-none focus:border-brand"
              />
            </label>
          </div>
        ) : (
          <button type="button" className="min-h-11 text-sm font-medium text-brand" onClick={() => setShowMore(true)}>
            + Adjustment or notes
          </button>
        )}
      </div>

      {formError && (
        <div className="mt-4">
          <Alert>{formError}</Alert>
        </div>
      )}

      {/* Space so the sticky bar never covers the last line */}
      <div className="h-28" aria-hidden />

      {/* Sticky total + actions */}
      <div className="fixed inset-x-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-20 border-t border-border bg-surface px-4 py-3 shadow-[0_-4px_12px_rgba(0,0,0,0.06)] md:bottom-0 md:left-56">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-xs text-muted">
              {lines.length} item{lines.length === 1 ? '' : 's'}
              {problems > 0 && <span className="text-danger"> · {problems} need attention</span>}
            </div>
            <div className="text-2xl font-bold num" aria-live="polite">
              {money(totals.grandTotal)}
            </div>
          </div>
          <div className="flex shrink-0 gap-2">
            <Button variant="secondary" onClick={() => submit(false)} loading={save.isPending && !save.variables?.input.finalize}>
              Save draft
            </Button>
            {canFinalize && (
              <Button onClick={() => submit(true)} loading={save.isPending && Boolean(save.variables?.input.finalize)}>
                Finalize
              </Button>
            )}
          </div>
        </div>
      </div>

      {picking && (
        <ItemPicker
          bootstrap={bootstrap}
          priceText={priceText}
          inList={new Set(lines.map((l) => l.itemId))}
          onPick={pick}
          onClose={() => setPicking(false)}
        />
      )}

      {pricing && pricingItem && (
        <QuickPriceSheet
          date={date}
          itemId={pricingItem.id}
          itemName={pricingItem.name}
          unitId={pricingItem.pricingUnitId}
          unitSymbol={unitById.get(pricingItem.pricingUnitId)?.symbol ?? ''}
          currencySymbol={bootstrap.settings.currencySymbol}
          initial={pricing.initial}
          onClose={() => setPricing(null)}
        />
      )}
    </>
  );
}

function LineCard({
  index,
  line,
  computed,
  serverError,
  bootstrap,
  unitIndex,
  priceRow,
  date,
  canWritePrices,
  money,
  inputRef,
  onChange,
  onRemove,
  onAddPrice,
  onEnter,
}: {
  index: number;
  line: Line;
  computed: Computed;
  serverError?: string;
  bootstrap: BootstrapData;
  unitIndex: UnitIndex;
  priceRow?: DailyPriceRow;
  date: string;
  canWritePrices: boolean;
  money: (v: string | number) => string;
  inputRef: (el: HTMLInputElement | null) => void;
  onChange: (patch: Partial<Line>) => void;
  onRemove: () => void;
  onAddPrice: (initial?: string) => void;
  onEnter: () => void;
}) {
  const item = bootstrap.items.find((i) => i.id === line.itemId);
  const pricingUnit = bootstrap.units.find((u) => u.id === item?.pricingUnitId);
  const units = item ? compatibleUnits(item.pricingUnitId, unitIndex, item.conversions) : [];
  const qtyId = `qty-${line.key}`;
  const localError = computed.state === 'error' ? computed.message : undefined;
  const error = serverError ?? localError;
  const missing = computed.state === 'missing-price';

  return (
    <li
      className={`rounded-2xl border bg-surface p-4 ${error || missing ? 'border-danger' : 'border-border'}`}
      aria-label={`Line ${index + 1}: ${item?.name ?? 'Unknown item'}`}
    >
      <div className="flex items-start justify-between gap-3">
        <label htmlFor={qtyId} className="min-w-0 flex-1 truncate text-lg font-semibold">
          {item?.name ?? 'Unknown item'}
        </label>
        <div className="text-right">
          <div className="text-lg font-semibold num">{computed.state === 'ok' ? money(computed.result.amount) : '—'}</div>
        </div>
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove ${item?.name ?? 'line'}`}
          className="-mr-2 -mt-1 flex size-10 shrink-0 items-center justify-center rounded-full text-muted hover:bg-surface-2 hover:text-danger"
        >
          ×
        </button>
      </div>

      <div className="mt-2 flex items-center gap-2">
        <input
          id={qtyId}
          ref={inputRef}
          type="text"
          inputMode="decimal"
          enterKeyHint="next"
          autoComplete="off"
          value={line.quantity}
          placeholder="Qty"
          onChange={(e) => onChange({ quantity: e.target.value.replace(',', '.') })}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              onEnter();
            }
          }}
          aria-invalid={error && computed.state === 'error' && computed.field === 'quantity' ? true : undefined}
          className="num min-h-12 w-28 rounded-xl border border-border bg-surface px-3 text-right text-lg outline-none focus:border-brand"
        />
        {units.length > 1 ? (
          <div className="flex flex-wrap gap-1" role="radiogroup" aria-label="Unit">
            {units.map((u) => (
              <button
                key={u.id}
                type="button"
                role="radio"
                aria-checked={line.unitId === u.id}
                onClick={() => onChange({ unitId: u.id })}
                className={`min-h-12 min-w-12 rounded-xl px-3 text-sm font-semibold ${
                  line.unitId === u.id ? 'bg-brand text-brand-fg' : 'border border-border bg-surface text-muted'
                }`}
              >
                {u.symbol}
              </button>
            ))}
          </div>
        ) : (
          <span className="px-2 font-semibold text-muted">{unitIndex.get(line.unitId)?.symbol}</span>
        )}
      </div>

      <div className="mt-2 flex flex-wrap items-center justify-between gap-x-3 text-sm text-muted">
        <span className="num">
          {priceRow?.current ? `@ ${money(priceRow.current.price)}/${pricingUnit?.symbol ?? ''}` : ''}
        </span>
        {computed.state === 'ok' && computed.result.unitId !== computed.result.priceUnitId && (
          <span className="num">
            = {Number(computed.result.normalizedQuantity)} {pricingUnit?.symbol}
          </span>
        )}
      </div>

      {missing && (
        <div className="mt-3 rounded-xl bg-danger-soft p-3 text-sm text-danger" role="alert">
          <p className="font-medium">
            Price not available for {item?.name} on {formatBusinessDate(date)}.
          </p>
          {canWritePrices ? (
            <div className="mt-2 flex flex-wrap gap-2">
              <button type="button" onClick={() => onAddPrice()} className="min-h-10 rounded-lg bg-danger px-3 font-semibold text-white">
                Add today’s price
              </button>
              {priceRow?.previous && bootstrap.settings.allowCopyPreviousPrice && (
                <button
                  type="button"
                  onClick={() => onAddPrice(priceRow.previous!.price)}
                  className="min-h-10 rounded-lg border border-danger px-3 font-semibold"
                >
                  Use previous: {money(priceRow.previous.price)} ({formatBusinessDate(priceRow.previous.date)})
                </button>
              )}
            </div>
          ) : (
            <p className="mt-1">Ask an admin to add this price.</p>
          )}
        </div>
      )}
      {error && <p className="mt-2 text-sm font-medium text-danger">{error}</p>}
    </li>
  );
}
