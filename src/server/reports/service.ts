import 'server-only';
import Decimal from 'decimal.js';
import { formatBusinessDate } from '@/domain/business-date';
import type { ServerSupabase } from '@/lib/supabase/server';
import type { DailyTotalRow, DashboardStats, ItemSummaryRow, ReportKind, ReportResult } from '@/shared/reports';
import type { ExportTable } from '../export/table';
import { loadPriceHistory } from '../prices/service';

const money = (v: number | string | null) => (v === null ? null : new Decimal(v).toFixed(2));
const sum = (values: (string | number)[]) => values.reduce<Decimal>((s, v) => s.plus(v), new Decimal(0)).toFixed(2);

export async function loadDashboard(supabase: ServerSupabase, date: string): Promise<DashboardStats> {
  const { data, error } = await supabase.rpc('dashboard_stats', { p_date: date });
  if (error) throw error;
  return data as unknown as DashboardStats;
}

export async function loadItemSummary(supabase: ServerSupabase, from: string, to: string): Promise<ReportResult<ItemSummaryRow>> {
  const { data, error } = await supabase.rpc('report_item_summary', { p_from: from, p_to: to });
  if (error) throw error;
  const rows = (data ?? []).map((r) => ({
    itemId: r.item_id,
    itemName: r.item_name,
    categoryName: r.category_name,
    unitSymbol: r.unit_symbol,
    quantity: String(Number(r.quantity)),
    amount: money(r.amount)!,
    avgRate: money(r.avg_rate),
    lines: Number(r.lines),
    calculations: Number(r.calculations),
  }));
  return { from, to, rows, total: sum(rows.map((r) => r.amount)) };
}

export async function loadDailyTotals(supabase: ServerSupabase, from: string, to: string): Promise<ReportResult<DailyTotalRow>> {
  const { data, error } = await supabase.rpc('report_daily_totals', { p_from: from, p_to: to });
  if (error) throw error;
  const rows = (data ?? []).map((r) => ({
    day: r.day,
    calculations: Number(r.calculations),
    lines: Number(r.lines),
    total: money(r.total)!,
  }));
  return { from, to, rows, total: sum(rows.map((r) => r.total)) };
}

const EXPORT_ROW_LIMIT = 10_000;

/** Builds an export from the SAME queries the screens use — no separate calculation logic. */
export async function buildExportTable(
  supabase: ServerSupabase,
  kind: ReportKind,
  q: { from: string; to: string; itemId?: number; categoryId?: number },
): Promise<ExportTable> {
  const range = q.from === q.to ? formatBusinessDate(q.from) : `${formatBusinessDate(q.from)} – ${formatBusinessDate(q.to)}`;

  switch (kind) {
    case 'items': {
      const r = await loadItemSummary(supabase, q.from, q.to);
      return {
        title: `Items ${range}`,
        columns: [
          { key: 'itemName', label: 'Item', type: 'text' },
          { key: 'categoryName', label: 'Category', type: 'text' },
          { key: 'quantity', label: 'Quantity', type: 'number' },
          { key: 'unitSymbol', label: 'Unit', type: 'text' },
          { key: 'avgRate', label: 'Average rate', type: 'money' },
          { key: 'amount', label: 'Amount', type: 'money' },
          { key: 'calculations', label: 'Calculations', type: 'number' },
        ],
        rows: [
          ...r.rows.map((x) => ({ ...x })),
          { itemName: 'Total', categoryName: null, quantity: null, unitSymbol: null, avgRate: null, amount: r.total, calculations: null },
        ],
      };
    }
    case 'daily-totals': {
      const r = await loadDailyTotals(supabase, q.from, q.to);
      return {
        title: `Daily totals ${range}`,
        columns: [
          { key: 'day', label: 'Date', type: 'date' },
          { key: 'calculations', label: 'Calculations', type: 'number' },
          { key: 'lines', label: 'Item lines', type: 'number' },
          { key: 'total', label: 'Total', type: 'money' },
        ],
        rows: [...r.rows.map((x) => ({ ...x })), { day: 'Total', calculations: null, lines: null, total: r.total }],
      };
    }
    case 'price-history': {
      // PostgREST caps a response at 1,000 rows, so page through instead of trusting one request
      const PAGE = 1000;
      const rows: Awaited<ReturnType<typeof loadPriceHistory>>['rows'] = [];
      for (let page = 1; rows.length < EXPORT_ROW_LIMIT; page++) {
        const r = await loadPriceHistory(supabase, { from: q.from, to: q.to, itemId: q.itemId, categoryId: q.categoryId, page, pageSize: PAGE });
        rows.push(...r.rows);
        if (r.rows.length < PAGE || rows.length >= r.meta.total) break;
      }
      const r = { rows: rows.slice(0, EXPORT_ROW_LIMIT) };
      return {
        title: `Prices ${range}`,
        columns: [
          { key: 'date', label: 'Date', type: 'date' },
          { key: 'itemName', label: 'Item', type: 'text' },
          { key: 'price', label: 'Rate', type: 'money' },
          { key: 'unitSymbol', label: 'Per', type: 'text' },
          { key: 'revisions', label: 'Edits', type: 'number' },
          { key: 'notes', label: 'Notes', type: 'text' },
        ],
        rows: r.rows.map((x) => ({ ...x })),
      };
    }
  }
}
