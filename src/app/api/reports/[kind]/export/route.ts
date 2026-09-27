import { ApiError } from '@/server/api/errors';
import { toCsv, toXlsx } from '@/server/export/table';
import { buildExportTable } from '@/server/reports/service';
import { withApi } from '@/server/api/with-api';
import { REPORT_KINDS, exportQuerySchema, type ReportKind } from '@/shared/reports';

const CONTENT_TYPES = {
  csv: 'text/csv; charset=utf-8',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
} as const;

// GET /api/reports/:kind/export?from=&to=&format=csv|xlsx
export const GET = withApi<undefined, typeof exportQuerySchema._output, { kind: string }>(
  { permission: 'reports.read', query: exportQuerySchema, rateLimit: { name: 'export', limit: 20, windowMs: 60_000 } },
  async ({ supabase, params, query }) => {
    if (!(REPORT_KINDS as readonly string[]).includes(params.kind)) throw new ApiError('NOT_FOUND', 'Unknown report.');
    if (query.to < query.from) throw new ApiError('VALIDATION_ERROR', '"To" must be on or after "From".', { to: ['Invalid range.'] });

    const table = await buildExportTable(supabase, params.kind as ReportKind, query);
    const bytes = query.format === 'xlsx' ? toXlsx(table) : toCsv(table);
    const filename = `${params.kind}_${query.from}_${query.to}.${query.format}`;

    return new Response(bytes as BodyInit, {
      headers: {
        'Content-Type': CONTENT_TYPES[query.format],
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'private, no-store',
      },
    });
  },
);
