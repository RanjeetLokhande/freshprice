'use client';

import { useState } from 'react';
import { useMasters } from '@/client/queries/bootstrap';
import { useAudit } from '@/client/queries/admin';
import { Alert, Button, PageTitle, Skeleton } from '@/components/ui';

const ENTITIES = [
  ['', 'Everything'],
  ['item_prices', 'Prices'],
  ['calculations', 'Calculations'],
  ['items', 'Items'],
  ['units', 'Units'],
  ['categories', 'Categories'],
  ['app_settings', 'Settings'],
  ['field_definitions', 'Custom fields'],
  ['item_unit_conversions', 'Item conversions'],
] as const;

const ACTION_STYLE = {
  insert: 'bg-brand-soft text-brand-strong',
  update: 'bg-warn-soft text-warn',
  delete: 'bg-danger-soft text-danger',
} as const;

const show = (v: unknown) => (v === null || v === undefined ? '—' : typeof v === 'object' ? JSON.stringify(v) : String(v));

export default function AuditPage() {
  const { derived } = useMasters();
  const [entity, setEntity] = useState('');
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<number | null>(null);
  const audit = useAudit({ entity: entity || undefined, page });

  if (!derived) return <Skeleton className="h-96" />;
  if (!derived.can('audit.read')) return <Alert tone="info">Only administrators can view the audit log.</Alert>;

  const rows = audit.data?.data ?? [];
  const total = audit.data?.meta?.total ?? 0;

  return (
    <>
      <PageTitle title="Audit log" subtitle="Every change to masters, prices and calculations." />
      <select
        aria-label="What changed"
        value={entity}
        onChange={(e) => {
          setEntity(e.target.value);
          setPage(1);
        }}
        className="mb-4 min-h-12 w-full rounded-xl border border-border bg-surface px-4 text-base md:w-64"
      >
        {ENTITIES.map(([v, label]) => (
          <option key={v} value={v}>
            {label}
          </option>
        ))}
      </select>

      {audit.isError ? (
        <Alert>{audit.error.message}</Alert>
      ) : audit.isPending ? (
        <Skeleton className="h-64" />
      ) : rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-8 text-center text-muted">No entries.</div>
      ) : (
        <ul className={`flex flex-col gap-2 ${audit.isPlaceholderData ? 'opacity-60' : ''}`}>
          {rows.map((r) => (
            <li key={r.id} className="rounded-2xl border border-border bg-surface">
              <button
                type="button"
                aria-expanded={open === r.id}
                onClick={() => setOpen(open === r.id ? null : r.id)}
                className="flex min-h-14 w-full items-start gap-3 px-4 py-3 text-left"
              >
                <span className={`mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${ACTION_STYLE[r.action]}`}>{r.action}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">
                    {r.entity.replace(/_/g, ' ')}
                    {r.summary && ` · ${r.summary}`}
                  </span>
                  <span className="block text-xs text-muted num">
                    {new Date(r.at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })} · {r.userEmail ?? 'system'}
                  </span>
                </span>
              </button>
              {open === r.id && (
                <div className="border-t border-border px-4 py-3">
                  {r.changes.length === 0 ? (
                    <p className="text-sm text-muted">No field changes.</p>
                  ) : (
                    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
                      {r.changes.map((c) => (
                        <div key={c.field} className="contents">
                          <dt className="font-medium text-muted">{c.field}</dt>
                          <dd className="break-all num">
                            {r.action === 'update' ? (
                              <>
                                <span className="text-danger line-through">{show(c.from)}</span> → <span className="text-brand-strong">{show(c.to)}</span>
                              </>
                            ) : (
                              show(r.action === 'delete' ? c.from : c.to)
                            )}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {total > 30 && (
        <div className="mt-4 flex items-center justify-between text-sm">
          <span className="text-muted num">
            {(page - 1) * 30 + 1}–{Math.min(page * 30, total)} of {total}
          </span>
          <div className="flex gap-2">
            <Button variant="secondary" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>
              Previous
            </Button>
            <Button variant="secondary" disabled={page * 30 >= total} onClick={() => setPage((p) => p + 1)}>
              Next
            </Button>
          </div>
        </div>
      )}
    </>
  );
}
