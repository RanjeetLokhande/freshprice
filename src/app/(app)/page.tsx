'use client';

import Link from 'next/link';
import { useMoney } from '@/client/format';
import { useMasters } from '@/client/queries/bootstrap';
import { useCalculations } from '@/client/queries/calculations';
import { useDashboard } from '@/client/queries/reports';
import { formatBusinessDate } from '@/domain/business-date';
import { StatusBadge } from '@/components/calc/status-badge';
import { CalculatorIcon, ChevronRightIcon, TagIcon } from '@/components/icons';
import { Alert, Card, Skeleton } from '@/components/ui';

export default function DashboardPage() {
  const { data: bootstrap, derived, isPending, error } = useMasters();
  const money = useMoney();
  const stats = useDashboard(bootstrap?.businessDate);
  const recent = useCalculations({ page: 1, pageSize: 5 });

  if (isPending) {
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-32" />
        <Skeleton className="h-24" />
      </div>
    );
  }
  if (error || !bootstrap || !derived) return <Alert>Could not load the app data. {error?.message}</Alert>;

  const everyone = derived.can('calculations.read_all');
  const s = stats.data;
  const name = bootstrap.user.fullName ?? bootstrap.user.email ?? '';

  return (
    <>
      <div className="mb-4">
        <h1 className="text-2xl font-semibold tracking-tight">Hello{name ? `, ${name}` : ''}</h1>
        <p className="mt-1 text-sm text-muted">
          {formatBusinessDate(bootstrap.businessDate)} · {everyone ? 'All users' : 'Your calculations'}
        </p>
      </div>

      {stats.isError && (
        <div className="mb-3">
          <Alert>Could not load today’s figures. {stats.error.message}</Alert>
        </div>
      )}

      {/* Today */}
      <Card className="mb-3">
        <div className="text-sm font-medium text-muted">Today’s total</div>
        <div className="mt-1 text-4xl font-bold tracking-tight num">
          {s ? money(s.todayTotal) : <Skeleton className="h-10 w-40" />}
        </div>
        <div className="mt-4 grid grid-cols-3 gap-3 border-t border-border pt-3">
          <Stat label="Calculations" value={s?.todayCalculations} />
          <Stat label="Item lines" value={s?.todayLines} />
          <Stat label="Drafts" value={s?.todayDrafts} href={s?.todayDrafts ? '/calculations' : undefined} />
        </div>
      </Card>

      <div className="mb-3 grid gap-3 sm:grid-cols-2">
        {/* Prices */}
        <Link href="/prices" className="rounded-2xl border border-border bg-surface p-4 hover:bg-surface-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-muted">Today’s prices</span>
            <ChevronRightIcon className="text-muted" />
          </div>
          {s ? (
            <>
              <div className="mt-1 text-2xl font-semibold num">
                {s.pricesSet} <span className="text-base font-normal text-muted">of {s.activeItems} set</span>
              </div>
              {s.missingPrices > 0 ? (
                <div className="mt-1 text-sm font-medium text-danger">{s.missingPrices} missing</div>
              ) : (
                <div className="mt-1 text-sm font-medium text-brand-strong">All prices set</div>
              )}
            </>
          ) : (
            <Skeleton className="mt-2 h-8" />
          )}
        </Link>

        {/* Periods */}
        <div className="rounded-2xl border border-border bg-surface p-4">
          <div className="text-sm font-medium text-muted">Finalized totals</div>
          <dl className="mt-2 flex flex-col gap-1 text-sm">
            {(
              [
                ['Yesterday', s?.yesterdayTotal],
                ['Last 7 days', s?.weekTotal],
                ['This month', s?.monthTotal],
              ] as const
            ).map(([label, value]) => (
              <div key={label} className="flex justify-between">
                <dt className="text-muted">{label}</dt>
                <dd className="font-semibold num">{value === undefined ? '…' : money(value)}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>

      {/* Quick actions */}
      <div className="mb-6 grid grid-cols-2 gap-3">
        <QuickAction href="/calculate" icon={<CalculatorIcon />} title="New calculation" />
        {derived.can('prices.write') ? (
          <QuickAction href="/prices" icon={<TagIcon />} title="Enter prices" />
        ) : (
          <QuickAction href="/prices" icon={<TagIcon />} title="View prices" />
        )}
      </div>

      {/* Recent */}
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Recent calculations</h2>
        <Link href="/calculations" className="min-h-10 content-center text-sm font-medium text-brand">
          See all
        </Link>
      </div>
      {recent.isPending ? (
        <Skeleton className="h-32" />
      ) : (recent.data?.data.length ?? 0) === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted">
          No calculations yet.
        </div>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
          {recent.data!.data.map((c) => (
            <li key={c.id}>
              <Link href={`/calculations/${c.id}`} className="flex min-h-14 items-center gap-3 px-4 py-2 hover:bg-surface-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium num">{c.referenceNumber}</span>
                    <StatusBadge status={c.status} />
                  </div>
                  <div className="text-xs text-muted num">{formatBusinessDate(c.date)}</div>
                </div>
                <span className="font-semibold num">{money(c.grandTotal)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function Stat({ label, value, href }: { label: string; value: number | undefined; href?: string }) {
  const body = (
    <>
      <div className="text-xl font-semibold num">{value ?? '…'}</div>
      <div className="text-xs text-muted">{label}</div>
    </>
  );
  return href ? (
    <Link href={href} className="rounded-lg hover:bg-surface-2">
      {body}
    </Link>
  ) : (
    <div>{body}</div>
  );
}

function QuickAction({ href, icon, title }: { href: string; icon: React.ReactNode; title: string }) {
  return (
    <Link
      href={href}
      className="flex min-h-16 items-center gap-3 rounded-2xl border border-border bg-surface p-4 font-semibold hover:bg-surface-2"
    >
      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-brand">{icon}</span>
      {title}
    </Link>
  );
}
