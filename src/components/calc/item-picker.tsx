'use client';

import { useMemo, useState } from 'react';
import type { BootstrapData } from '@/shared/bootstrap';
import { Sheet } from '../sheet';

/** Bottom-sheet item search: autofocused, category chips, today's rate on each row. */
export function ItemPicker({
  bootstrap,
  priceText,
  inList,
  onPick,
  onClose,
}: {
  bootstrap: BootstrapData;
  /** e.g. "₹30.00/kg", or null when no price exists for the date */
  priceText: (itemId: number) => string | null;
  inList: Set<number>;
  onPick: (itemId: number) => void;
  onClose: () => void;
}) {
  const [search, setSearch] = useState('');
  const [rootCategory, setRootCategory] = useState<number | null>(null);

  const roots = bootstrap.categories.filter((c) => c.parentId === null);
  const rootOf = useMemo(() => {
    const byId = new Map(bootstrap.categories.map((c) => [c.id, c]));
    return (id: number) => {
      let c = byId.get(id);
      while (c?.parentId) c = byId.get(c.parentId);
      return c?.id ?? id;
    };
  }, [bootstrap.categories]);

  const term = search.trim().toLowerCase();
  const items = bootstrap.items.filter(
    (i) => (!term || i.name.toLowerCase().includes(term)) && (rootCategory === null || rootOf(i.categoryId) === rootCategory),
  );

  return (
    <Sheet open onClose={onClose} title="Add item">
      <input
        type="search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search items…"
        aria-label="Search items"
        enterKeyHint="search"
        onKeyDown={(e) => {
          if (e.key === 'Enter' && items.length > 0) {
            e.preventDefault();
            onPick(items[0].id);
          }
        }}
        className="sticky top-0 z-10 mb-3 min-h-12 w-full rounded-xl border border-border bg-surface px-4 text-base outline-none focus:border-brand"
      />
      <div className="-mx-5 mb-3 flex gap-2 overflow-x-auto px-5 pb-1">
        {[{ id: null as number | null, name: 'All' }, ...roots].map((c) => (
          <button
            key={c.id ?? 'all'}
            type="button"
            aria-pressed={rootCategory === c.id}
            onClick={() => setRootCategory(c.id)}
            className={`min-h-10 shrink-0 rounded-full px-4 text-sm font-medium ${
              rootCategory === c.id ? 'bg-brand text-brand-fg' : 'border border-border bg-surface text-muted'
            }`}
          >
            {c.name}
          </button>
        ))}
      </div>

      {items.length === 0 ? (
        <p className="py-8 text-center text-muted">No items match “{search}”.</p>
      ) : (
        <ul className="-mx-2 flex flex-col">
          {items.map((i) => {
            const price = priceText(i.id);
            return (
              <li key={i.id}>
                <button
                  type="button"
                  onClick={() => onPick(i.id)}
                  className="flex min-h-14 w-full items-center justify-between gap-3 rounded-xl px-3 text-left hover:bg-surface-2"
                >
                  <span className="font-medium">
                    {i.name}
                    {inList.has(i.id) && <span className="ml-2 text-xs font-normal text-brand">in list</span>}
                  </span>
                  <span className={`shrink-0 text-sm num ${price ? 'text-muted' : 'text-danger'}`}>{price ?? 'No price'}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Sheet>
  );
}
