'use client';

import type { BootstrapData } from '@/shared/bootstrap';
import type { LookupEntity, LookupFilter } from '@/shared/masters';

export interface LookupOption {
  value: number;
  label: string;
}

/** Choices for a lookup field, from the cached bootstrap (no extra request). */
export function lookupOptions(data: BootstrapData, entity: LookupEntity, filter?: LookupFilter): LookupOption[] {
  switch (entity) {
    case 'categories':
      return data.categories.map((c) => ({ value: c.id, label: c.name }));
    case 'unit_types':
      return data.unitTypes.map((t) => ({ value: t.id, label: t.name }));
    case 'units':
      return data.units
        .filter((u) => (filter === 'baseUnits' ? u.baseUnitId === null : true))
        .map((u) => ({ value: u.id, label: `${u.name} (${u.symbol})` }));
    case 'items':
      return data.items.map((i) => ({ value: i.id, label: i.name }));
  }
}

/** Short display text for a lookup id in lists (units show their symbol). */
export function lookupLabel(data: BootstrapData, entity: LookupEntity, id: unknown): string {
  if (id === null || id === undefined || id === '') return '—';
  const n = Number(id);
  switch (entity) {
    case 'categories':
      return data.categories.find((c) => c.id === n)?.name ?? `#${n} (inactive)`;
    case 'unit_types':
      return data.unitTypes.find((t) => t.id === n)?.name ?? `#${n} (inactive)`;
    case 'units':
      return data.units.find((u) => u.id === n)?.symbol ?? `#${n} (inactive)`;
    case 'items':
      return data.items.find((i) => i.id === n)?.name ?? `#${n} (inactive)`;
  }
}
