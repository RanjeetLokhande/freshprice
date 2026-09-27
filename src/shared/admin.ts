import { z } from 'zod';

export interface UserDto {
  userId: string;
  email: string | null;
  fullName: string | null;
  active: boolean;
  roles: string[];
  createdAt: string;
  version: number;
}

export interface RoleDto {
  key: string;
  name: string;
}

export const updateUserSchema = z.object({
  roles: z.array(z.string().min(1)).min(1, 'Choose at least one role.').max(10),
  active: z.boolean(),
  version: z.number().int().positive(),
});

export interface AuditChange {
  field: string;
  from: unknown;
  to: unknown;
}

export interface AuditEntryDto {
  id: number;
  at: string;
  action: 'insert' | 'update' | 'delete';
  entity: string;
  entityId: string | null;
  userEmail: string | null;
  summary: string | null;
  changes: AuditChange[];
}

export const auditQuerySchema = z.object({
  entity: z
    .string()
    .regex(/^[a-z_]+$/)
    .optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(30),
});

const IGNORED = new Set(['updated_at', 'version', 'created_at', 'updated_by']);

/** Field-level diff of two row snapshots (for updates) or the row itself (insert/delete). */
export function diffRows(oldRow: Record<string, unknown> | null, newRow: Record<string, unknown> | null): AuditChange[] {
  const keys = new Set([...Object.keys(oldRow ?? {}), ...Object.keys(newRow ?? {})]);
  const changes: AuditChange[] = [];
  for (const k of keys) {
    if (IGNORED.has(k)) continue;
    const a = oldRow?.[k] ?? null;
    const b = newRow?.[k] ?? null;
    if (oldRow && newRow && JSON.stringify(a) === JSON.stringify(b)) continue;
    changes.push({ field: k, from: a, to: b });
  }
  return changes;
}
