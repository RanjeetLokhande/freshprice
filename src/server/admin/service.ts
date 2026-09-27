import 'server-only';
import type { z } from 'zod';
import type { ServerSupabase } from '@/lib/supabase/server';
import type { PageMeta } from '@/shared/api';
import { diffRows, type AuditEntryDto, type RoleDto, type UserDto, type updateUserSchema } from '@/shared/admin';
import { ApiError } from '../api/errors';

export async function listUsers(supabase: ServerSupabase): Promise<{ users: UserDto[]; roles: RoleDto[] }> {
  const [profiles, userRoles, roles] = await Promise.all([
    supabase.from('profiles').select('user_id, email, full_name, active, created_at, version').order('created_at'),
    supabase.from('user_roles').select('user_id, role_id'),
    supabase.from('roles').select('id, key, name').eq('active', true).order('sort_order'),
  ]);
  for (const r of [profiles, userRoles, roles]) if (r.error) throw r.error;

  const roleKey = new Map((roles.data ?? []).map((r) => [r.id, r.key]));
  const rolesByUser = new Map<string, string[]>();
  for (const ur of userRoles.data ?? []) {
    const key = roleKey.get(ur.role_id);
    if (key) rolesByUser.set(ur.user_id, [...(rolesByUser.get(ur.user_id) ?? []), key]);
  }

  return {
    users: (profiles.data ?? []).map((p) => ({
      userId: p.user_id,
      email: p.email,
      fullName: p.full_name,
      active: p.active,
      roles: (rolesByUser.get(p.user_id) ?? []).sort(),
      createdAt: p.created_at,
      version: p.version,
    })),
    roles: (roles.data ?? []).map((r) => ({ key: r.key, name: r.name })),
  };
}

export async function updateUser(supabase: ServerSupabase, userId: string, input: z.output<typeof updateUserSchema>) {
  const { data: current, error } = await supabase
    .from('profiles')
    .select('user_id, active, version')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  if (!current) throw new ApiError('NOT_FOUND', 'User not found.');
  if (current.version !== input.version) {
    throw new ApiError('CONFLICT', 'Someone else changed this user. Reload and try again.');
  }

  const { error: rolesError } = await supabase.rpc('set_user_roles', { p_user_id: userId, p_role_keys: input.roles });
  if (rolesError) throw rolesError;

  if (current.active !== input.active) {
    const { data, error: activeError } = await supabase
      .from('profiles')
      .update({ active: input.active })
      .eq('user_id', userId)
      .eq('version', input.version)
      .select('user_id')
      .maybeSingle();
    if (activeError) throw activeError;
    if (!data) throw new ApiError('CONFLICT', 'Someone else changed this user. Reload and try again.');
  }

  return (await listUsers(supabase)).users.find((u) => u.userId === userId)!;
}

const SUMMARY_FIELDS = ['name', 'label', 'key', 'reference_number', 'symbol', 'price'];

export async function listAudit(
  supabase: ServerSupabase,
  q: { entity?: string; page: number; pageSize: number },
): Promise<{ rows: AuditEntryDto[]; meta: PageMeta }> {
  let query = supabase.from('audit_logs').select('*', { count: 'exact' });
  if (q.entity) query = query.eq('entity', q.entity);
  const from = (q.page - 1) * q.pageSize;
  const { data, error, count } = await query.order('created_at', { ascending: false }).order('id', { ascending: false }).range(from, from + q.pageSize - 1);
  if (error) throw error;

  const userIds = [...new Set((data ?? []).map((r) => r.user_id).filter((x): x is string => Boolean(x)))];
  const emails = new Map<string, string | null>();
  if (userIds.length) {
    const { data: profiles, error: pErr } = await supabase.from('profiles').select('user_id, email').in('user_id', userIds);
    if (pErr) throw pErr;
    for (const p of profiles ?? []) emails.set(p.user_id, p.email);
  }

  return {
    rows: (data ?? []).map((r) => {
      const oldRow = r.old_data as Record<string, unknown> | null;
      const newRow = r.new_data as Record<string, unknown> | null;
      const row = newRow ?? oldRow ?? {};
      const summaryField = SUMMARY_FIELDS.find((f) => row[f] !== undefined && row[f] !== null);
      return {
        id: r.id,
        at: r.created_at,
        action: r.action as AuditEntryDto['action'],
        entity: r.entity,
        entityId: r.entity_id,
        userEmail: r.user_id ? (emails.get(r.user_id) ?? null) : null,
        summary: summaryField ? String(row[summaryField]) : null,
        changes: diffRows(r.action === 'insert' ? null : oldRow, r.action === 'delete' ? null : newRow),
      };
    }),
    meta: { page: q.page, pageSize: q.pageSize, total: count ?? 0 },
  };
}
