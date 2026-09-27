'use client';

import { addDays, formatBusinessDate } from '@/domain/business-date';

/** ‹ date › control: big touch targets, native date picker in the middle. */
export function DateStepper({
  value,
  onChange,
  today,
}: {
  value: string;
  onChange: (date: string) => void;
  today: string;
}) {
  const btn =
    'flex size-12 items-center justify-center rounded-xl border border-border bg-surface text-xl text-muted hover:bg-surface-2';
  return (
    <div className="flex items-center gap-2">
      <button type="button" className={btn} onClick={() => onChange(addDays(value, -1))} aria-label="Previous day">
        ‹
      </button>
      <label className="relative flex min-h-12 flex-1 items-center justify-center rounded-xl border border-border bg-surface px-4 font-semibold sm:min-w-52 sm:flex-none">
        <span className="num">{formatBusinessDate(value)}</span>
        {value === today && <span className="ml-2 rounded-full bg-brand-soft px-2 py-0.5 text-xs text-brand-strong">Today</span>}
        <input
          type="date"
          value={value}
          onChange={(e) => e.target.value && onChange(e.target.value)}
          className="absolute inset-0 cursor-pointer opacity-0"
          aria-label="Choose date"
        />
      </label>
      <button type="button" className={btn} onClick={() => onChange(addDays(value, 1))} aria-label="Next day">
        ›
      </button>
      {value !== today && (
        <button type="button" onClick={() => onChange(today)} className="min-h-12 px-2 text-sm font-medium text-brand">
          Today
        </button>
      )}
    </div>
  );
}
