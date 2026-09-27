'use client';

import { useFormContext, type FieldErrors } from 'react-hook-form';
import type { MasterField } from '@/shared/masters';
import type { LookupOption } from './lookups';

const INPUT =
  'min-h-12 w-full rounded-xl border bg-surface px-4 text-base outline-none focus:border-brand aria-[invalid=true]:border-danger border-border';

const toNumberOrNull = (v: unknown) => (v === '' || v === null || v === undefined ? null : Number(v));
const toStringOrNull = (v: unknown) => (v === '' || v === null || v === undefined ? null : String(v));

export function getErrorMessage(errors: FieldErrors, path: string): string | undefined {
  let node: unknown = errors;
  for (const part of path.split('.')) {
    if (!node || typeof node !== 'object') return undefined;
    node = (node as Record<string, unknown>)[part];
  }
  const message = (node as { message?: unknown } | undefined)?.message;
  return typeof message === 'string' ? message : undefined;
}

/** Renders the right mobile-friendly input for a field's kind. */
export function DynamicField({
  field,
  name,
  lookupOptions,
}: {
  field: MasterField;
  /** Form path, e.g. "name" or "attributes.origin" */
  name: string;
  lookupOptions?: LookupOption[];
}) {
  const {
    register,
    formState: { errors },
  } = useFormContext();
  const error = getErrorMessage(errors, name);
  const id = `f-${name.replace(/\./g, '-')}`;
  const describedBy = error ? `${id}-error` : field.help ? `${id}-help` : undefined;
  const common = { id, 'aria-invalid': error ? true : undefined, 'aria-describedby': describedBy } as const;

  if (field.kind === 'boolean') {
    return (
      <div className="flex flex-col gap-1">
        <label htmlFor={id} className="flex min-h-12 cursor-pointer items-center justify-between gap-4 rounded-xl border border-border bg-surface px-4">
          <span className="text-base">{field.label}</span>
          <input type="checkbox" className="peer sr-only" {...common} {...register(name)} />
          <span
            aria-hidden
            className="relative h-7 w-12 shrink-0 rounded-full bg-border transition-colors after:absolute after:left-0.5 after:top-0.5 after:size-6 after:rounded-full after:bg-white after:shadow after:transition-transform peer-checked:bg-brand peer-checked:after:translate-x-5 peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[var(--focus)]"
          />
        </label>
        <FieldHint id={id} error={error} help={field.help} />
      </div>
    );
  }

  let control: React.ReactNode;
  switch (field.kind) {
    case 'integer':
    case 'number':
      control = (
        <input
          type="text"
          inputMode={field.kind === 'integer' ? 'numeric' : 'decimal'}
          autoComplete="off"
          className={`${INPUT} num`}
          {...common}
          {...register(name, { setValueAs: toNumberOrNull })}
        />
      );
      break;
    case 'decimal':
      control = (
        <input
          type="text"
          inputMode="decimal"
          autoComplete="off"
          className={`${INPUT} num`}
          {...common}
          {...register(name, { setValueAs: (v) => (typeof v === 'string' ? v.trim() : v) })}
        />
      );
      break;
    case 'date':
      control = <input type="date" className={INPUT} {...common} {...register(name, { setValueAs: toStringOrNull })} />;
      break;
    case 'select':
      control = (
        <select className={INPUT} {...common} {...register(name, { setValueAs: toStringOrNull })}>
          {!field.required && <option value="">—</option>}
          {field.required && <option value="">Choose…</option>}
          {(field.options ?? []).map((o) => (
            <option key={o} value={o}>
              {o.replace(/_/g, ' ')}
            </option>
          ))}
        </select>
      );
      break;
    case 'lookup':
      control = (
        <select className={INPUT} {...common} {...register(name, { setValueAs: toNumberOrNull })}>
          <option value="">{field.required ? 'Choose…' : '— None —'}</option>
          {(lookupOptions ?? []).map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      );
      break;
    case 'string_list':
      control = <textarea rows={4} className={`${INPUT} py-3`} {...common} {...register(name)} />;
      break;
    default:
      control = (
        <input
          type="text"
          autoComplete="off"
          maxLength={field.maxLength}
          className={INPUT}
          {...common}
          {...register(name, { setValueAs: (v) => (typeof v === 'string' ? v.trim() : v) })}
        />
      );
  }

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {field.label}
        {field.required && <span className="text-danger"> *</span>}
      </label>
      {control}
      <FieldHint id={id} error={error} help={field.help} />
    </div>
  );
}

function FieldHint({ id, error, help }: { id: string; error?: string; help?: string }) {
  if (error)
    return (
      <p id={`${id}-error`} className="text-sm text-danger">
        {error}
      </p>
    );
  if (help)
    return (
      <p id={`${id}-help`} className="text-sm text-muted">
        {help}
      </p>
    );
  return null;
}
