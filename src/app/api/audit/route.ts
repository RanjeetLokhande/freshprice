import { auditQuerySchema } from '@/shared/admin';
import { listAudit } from '@/server/admin/service';
import { ok, withApi } from '@/server/api/with-api';

// GET /api/audit?entity=&page= — who changed what, with field-level before/after
export const GET = withApi({ permission: 'audit.read', query: auditQuerySchema }, async ({ supabase, query }) => {
  const { rows, meta } = await listAudit(supabase, query);
  return ok(rows, { meta });
});
