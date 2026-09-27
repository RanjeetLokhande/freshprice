'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useMasters } from '@/client/queries/bootstrap';
import { Button, PageTitle, Skeleton } from '@/components/ui';
import { ChevronRightIcon } from '@/components/icons';
import { getBrowserSupabase } from '@/lib/supabase/browser';

// Admin links appear only for users holding the matching permission.
const MASTER_LINKS = [
  { href: '/reports', label: 'Reports & exports', permission: 'reports.read' },
  { href: '/masters/items', label: 'Items', permission: 'masters.items.write' },
  { href: '/masters/categories', label: 'Categories', permission: 'masters.categories.write' },
  { href: '/masters/units', label: 'Units', permission: 'masters.units.write' },
  { href: '/masters/unit_types', label: 'Unit types', permission: 'masters.unit_types.write' },
  { href: '/masters/item_unit_conversions', label: 'Item conversions', permission: 'masters.item_unit_conversions.write' },
  { href: '/masters/field_definitions', label: 'Custom fields', permission: 'masters.field_definitions.write' },
  { href: '/settings', label: 'Settings', permission: 'settings.write' },
  { href: '/users', label: 'Users & roles', permission: 'users.manage' },
  { href: '/audit', label: 'Audit log', permission: 'audit.read' },
];

export default function MorePage() {
  const { data, derived, isPending } = useMasters();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [signingOut, setSigningOut] = useState(false);

  async function signOut() {
    setSigningOut(true);
    await getBrowserSupabase().auth.signOut();
    queryClient.clear();
    router.replace('/login');
    router.refresh();
  }

  const links = derived ? MASTER_LINKS.filter((l) => derived.can(l.permission)) : [];

  return (
    <>
      <PageTitle title="More" subtitle={data?.user.email ?? undefined} />

      {isPending ? (
        <Skeleton className="h-40" />
      ) : links.length > 0 ? (
        <>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">Administration</h2>
          <ul className="mb-6 divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
            {links.map((l) => (
              <li key={l.href}>
                <Link href={l.href} className="flex min-h-14 items-center justify-between px-4 hover:bg-surface-2">
                  {l.label}
                  <ChevronRightIcon className="text-muted" />
                </Link>
              </li>
            ))}
          </ul>
        </>
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row">
        <Link
          href="/reset-password"
          className="inline-flex min-h-12 items-center justify-center rounded-xl border border-border bg-surface px-5 font-semibold hover:bg-surface-2"
        >
          Change password
        </Link>
        <Button variant="secondary" className="w-full sm:w-auto" onClick={signOut} loading={signingOut}>
          Sign out
        </Button>
      </div>
    </>
  );
}
