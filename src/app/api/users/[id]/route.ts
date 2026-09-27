import { z } from 'zod';
import { updateUserSchema } from '@/shared/admin';
import { ApiError } from '@/server/api/errors';
import { updateUser } from '@/server/admin/service';
import { ok, withApi } from '@/server/api/with-api';

// PUT /api/users/:id { roles, active, version } — the database keeps at least one active admin
export const PUT = withApi<z.output<typeof updateUserSchema>, undefined, { id: string }>(
  { permission: 'users.manage', body: updateUserSchema },
  async ({ supabase, params, body }) => {
    const id = z.uuid().safeParse(params.id);
    if (!id.success) throw new ApiError('NOT_FOUND', 'User not found.');
    return ok(await updateUser(supabase, id.data, body));
  },
);
