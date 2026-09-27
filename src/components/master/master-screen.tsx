'use client';

import { useMemo, useState } from 'react';
import { useMasters } from '@/client/queries/bootstrap';
import { useMasterList } from '@/client/queries/masters';
import { useDebouncedValue } from '@/client/use-debounced-value';
import type { BootstrapData } from '@/shared/bootstrap';
import { customFieldToMasterField } from '@/shared/master-schema';
import { getMaster, type MasterField, type MasterRow } from '@/shared/masters';
import { ChevronRightIcon } from '../icons';
import { Alert, Button, PageTitle, Skeleton } from '../ui';
import { lookupLabel } from './lookups';
import { MasterFormSheet } from './master-form';

const PAGE_SIZE = 25;
type ActiveFilter = 'all' | 'true' | 'false';

function cellText(bootstrap: BootstrapData, field: MasterField, value: unknown): string {
  if (field.kind === 'lookup' && field.lookup) return lookupLabel(bootstrap, field.lookup, value);
  if (field.kind === 'boolean') return value ? 'Yes' : 'No';
  if (Array.isArray(value)) return value.join(', ') || '—';
  if (value === null || value === undefined || value === '') return '—';
  if (field.kind === 'decimal') return String(Number(value));
  return String(value).replace(/_/g, ' ');
}

/** Generic, registry-driven admin screen for any master table. */
export function MasterScreen({ entity }: { entity: string }) {
  const def = getMaster(entity);
  const { data: bootstrap, derived, isPending: bootPending } = useMasters();

  const [search, setSearch] = useState('');
  const [active, setActive] = useState<ActiveFilter>('all');
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<{ row: MasterRow | null } | null>(null);
  const q = useDebouncedValue(search.trim(), 250);

  const list = useMasterList(entity, { q: q || undefined, active, page, pageSize: PAGE_SIZE });

  const customFields = useMemo(
    () =>
      def?.supportsAttributes && bootstrap
        ? bootstrap.fieldDefinitions
            .filter((d) => d.entity === entity)
            .sort((a, b) => a.listOrder - b.listOrder)
            .map((d) => ({ ...customFieldToMasterField(d), key: `attributes.${d.key}` }))
        : [],
    [def, bootstrap, entity],
  );

  if (!def) return <Alert>Unknown master “{entity}”.</Alert>;
  if (bootPending || !bootstrap || !derived) return <Skeleton className="h-64" />;

  const canWrite = derived.can(def.permission);
  const titleField = def.fields.find((f) => f.key === def.titleField)!;
  const listFields = [...def.fields.filter((f) => f.list && f.key !== def.titleField), ...customFields.filter((f) => f.list)];
  const mobileFields = [...def.fields.filter((f) => f.mobile), ...customFields.filter((f) => f.mobile)];

  const value = (row: MasterRow, key: string) =>
    key.startsWith('attributes.') ? (row.attributes as Record<string, unknown> | undefined)?.[key.slice(11)] : row[key];

  const rows = list.data?.data ?? [];
  const total = list.data?.meta?.total ?? 0;
  const from = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const to = Math.min(page * PAGE_SIZE, total);

  return (
    <>
      <div className="flex items-start justify-between gap-4">
        <PageTitle title={def.label} subtitle={list.data ? `${total} record${total === 1 ? '' : 's'}` : undefined} />
        {canWrite && (
          <Button className="hidden md:inline-flex" onClick={() => setEditing({ row: null })}>
            + New {def.singular.toLowerCase()}
          </Button>
        )}
      </div>

      {/* Filters */}
      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center">
        {def.searchColumns.length > 0 && (
          <input
            type="search"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder={`Search ${def.label.toLowerCase()}…`}
            aria-label={`Search ${def.label.toLowerCase()}`}
            className="min-h-12 w-full rounded-xl border border-border bg-surface px-4 text-base outline-none focus:border-brand md:max-w-xs"
          />
        )}
        <div className="flex gap-2" role="group" aria-label="Filter by status">
          {(
            [
              ['all', 'All'],
              ['true', 'Active'],
              ['false', 'Inactive'],
            ] as const
          ).map(([v, label]) => (
            <button
              key={v}
              type="button"
              aria-pressed={active === v}
              onClick={() => {
                setActive(v);
                setPage(1);
              }}
              className={`min-h-10 rounded-full px-4 text-sm font-medium ${
                active === v ? 'bg-brand text-brand-fg' : 'border border-border bg-surface text-muted'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {list.isError ? (
        <Alert>
          Could not load {def.label.toLowerCase()}. {list.error.message}{' '}
          <button className="font-semibold underline" onClick={() => list.refetch()}>
            Retry
          </button>
        </Alert>
      ) : list.isPending ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="h-16" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-8 text-center text-muted">
          {q ? `No ${def.label.toLowerCase()} match “${q}”.` : `No ${def.label.toLowerCase()} yet.`}
        </div>
      ) : (
        <div className={list.isPlaceholderData ? 'opacity-60 transition-opacity' : undefined}>
          {/* Phones & tablets: cards */}
          <ul className="flex flex-col gap-2 lg:hidden">
            {rows.map((row) => (
              <li key={row.id}>
                <button
                  type="button"
                  onClick={() => setEditing({ row })}
                  className="flex min-h-16 w-full items-center gap-3 rounded-2xl border border-border bg-surface px-4 py-3 text-left hover:bg-surface-2"
                >
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="truncate font-semibold">{cellText(bootstrap, titleField, row[def.titleField])}</span>
                      {!row.active && (
                        <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs font-medium text-muted">Inactive</span>
                      )}
                    </span>
                    {mobileFields.length > 0 && (
                      <span className="mt-0.5 block truncate text-sm text-muted">
                        {mobileFields.map((f) => cellText(bootstrap, f, value(row, f.key))).join(' · ')}
                      </span>
                    )}
                  </span>
                  <ChevronRightIcon className="shrink-0 text-muted" />
                </button>
              </li>
            ))}
          </ul>

          {/* Desktop: table */}
          <div className="hidden overflow-hidden rounded-2xl border border-border bg-surface lg:block">
            <table className="w-full text-sm">
              <thead className="bg-surface-2 text-left text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-4 py-3 font-semibold">{titleField.label}</th>
                  {listFields.map((f) => (
                    <th key={f.key} className="px-4 py-3 font-semibold">
                      {f.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((row) => (
                  <tr
                    key={row.id}
                    onClick={() => setEditing({ row })}
                    className={`cursor-pointer hover:bg-surface-2 ${row.active ? '' : 'text-muted'}`}
                  >
                    <td className="px-4 py-3 font-medium">
                      <button type="button" className="text-left" onClick={() => setEditing({ row })}>
                        {cellText(bootstrap, titleField, row[def.titleField])}
                      </button>
                    </td>
                    {listFields.map((f) => (
                      <td key={f.key} className={`px-4 py-3 ${f.kind === 'decimal' || f.kind === 'integer' ? 'num' : ''}`}>
                        {cellText(bootstrap, f, value(row, f.key))}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {total > PAGE_SIZE && (
            <div className="mt-4 flex items-center justify-between gap-3 text-sm">
              <span className="text-muted num">
                {from}–{to} of {total}
              </span>
              <div className="flex gap-2">
                <Button variant="secondary" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>
                  Previous
                </Button>
                <Button variant="secondary" disabled={to >= total} onClick={() => setPage((p) => p + 1)}>
                  Next
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Mobile floating add button */}
      {canWrite && (
        <button
          type="button"
          onClick={() => setEditing({ row: null })}
          aria-label={`New ${def.singular.toLowerCase()}`}
          className="fixed bottom-[calc(5rem+env(safe-area-inset-bottom))] right-4 z-20 flex size-14 items-center justify-center rounded-full bg-brand text-3xl leading-none text-brand-fg shadow-lg md:hidden"
        >
          +
        </button>
      )}

      {editing && (
        <MasterFormSheet
          key={editing.row?.id ?? 'new'}
          def={def}
          row={editing.row}
          bootstrap={bootstrap}
          canWrite={canWrite}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
}
