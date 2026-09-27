import type { CalculationStatus } from '@/shared/calculations';

const STYLES: Record<CalculationStatus, string> = {
  draft: 'bg-warn-soft text-warn',
  finalized: 'bg-brand-soft text-brand-strong',
  cancelled: 'bg-surface-2 text-muted line-through',
};

export function StatusBadge({ status }: { status: CalculationStatus }) {
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ${STYLES[status]}`}>{status}</span>
  );
}
