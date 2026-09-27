'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { useBootstrap } from '@/client/queries/bootstrap';
import { formatBusinessDate } from '@/domain/business-date';
import { CalculatorIcon, HistoryIcon, HomeIcon, LeafIcon, MenuIcon, TagIcon } from './icons';

const NAV = [
  { href: '/', label: 'Home', icon: HomeIcon },
  { href: '/calculate', label: 'Calculate', icon: CalculatorIcon },
  { href: '/prices', label: 'Prices', icon: TagIcon },
  { href: '/calculations', label: 'History', icon: HistoryIcon },
  { href: '/more', label: 'More', icon: MenuIcon },
] as const;

function isActive(pathname: string, href: string) {
  return href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * Mobile-first shell: bottom tab bar on phones, left sidebar from md up.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { data } = useBootstrap();

  return (
    <div className="min-h-dvh md:flex">
      {/* Sidebar (md+) */}
      <aside className="hidden print:hidden md:flex md:w-56 md:shrink-0 md:flex-col md:border-r md:border-border md:bg-surface">
        <div className="flex items-center gap-2 px-5 py-5 text-lg font-semibold">
          <LeafIcon className="text-brand" />
          Fresh Price
        </div>
        <nav className="flex flex-col gap-1 px-3" aria-label="Main">
          {NAV.map(({ href, label, icon: Icon }) => {
            const active = isActive(pathname, href);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? 'page' : undefined}
                className={`flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium ${
                  active ? 'bg-brand-soft text-brand-strong' : 'text-muted hover:bg-surface-2 hover:text-text'
                }`}
              >
                <Icon width={20} height={20} />
                {label}
              </Link>
            );
          })}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top bar */}
        <header className="print:hidden sticky top-0 z-20 flex items-center justify-between border-b border-border bg-surface/95 px-4 pb-3 pt-[calc(0.75rem+env(safe-area-inset-top))] backdrop-blur md:px-8">
          <div className="flex items-center gap-2 font-semibold md:hidden">
            <LeafIcon className="text-brand" width={22} height={22} />
            Fresh Price
          </div>
          <div className="hidden md:block" />
          {data && (
            <span className="rounded-full bg-surface-2 px-3 py-1 text-xs font-medium text-muted num">
              {formatBusinessDate(data.businessDate, data.settings.locale)}
            </span>
          )}
        </header>

        <main className="pb-safe-nav mx-auto w-full max-w-5xl flex-1 px-4 pt-4 md:px-8 md:pt-6">{children}</main>
      </div>

      {/* Bottom tab bar (phones) */}
      <nav
        aria-label="Main"
        className="print:hidden fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-border bg-surface pb-[env(safe-area-inset-bottom)] md:hidden"
      >
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = isActive(pathname, href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? 'page' : undefined}
              className={`flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-medium ${
                active ? 'text-brand' : 'text-muted'
              }`}
            >
              <Icon width={22} height={22} />
              {label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
