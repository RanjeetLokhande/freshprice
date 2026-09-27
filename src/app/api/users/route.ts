import { listUsers } from '@/server/admin/service';
import { ok, withApi } from '@/server/api/with-api';

export const GET = withApi({ permission: 'users.manage' }, async ({ supabase }) => ok(await listUsers(supabase)));
