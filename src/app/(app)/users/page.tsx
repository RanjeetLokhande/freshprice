'use client';

import { useState } from 'react';
import { ApiClientError } from '@/client/api-client';
import { useMasters } from '@/client/queries/bootstrap';
import { useUpdateUser, useUsers } from '@/client/queries/admin';
import type { RoleDto, UserDto } from '@/shared/admin';
import { Sheet } from '@/components/sheet';
import { useToast } from '@/components/toast';
import { Alert, Button, PageTitle, Skeleton } from '@/components/ui';
import { ChevronRightIcon } from '@/components/icons';

export default function UsersPage() {
  const { data: bootstrap, derived } = useMasters();
  const users = useUsers();
  const [editing, setEditing] = useState<UserDto | null>(null);

  if (!derived || !bootstrap) return <Skeleton className="h-96" />;
  if (!derived.can('users.manage')) return <Alert tone="info">Only administrators can manage users.</Alert>;
  if (users.isError) return <Alert>{users.error.message}</Alert>;
  if (users.isPending) return <Skeleton className="h-64" />;

  const roleName = new Map(users.data.roles.map((r) => [r.key, r.name]));

  return (
    <>
      <PageTitle title="Users & roles" subtitle="New people sign up on the login page, then you assign their role here." />
      <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
        {users.data.users.map((u) => (
          <li key={u.userId}>
            <button
              type="button"
              onClick={() => setEditing(u)}
              className="flex min-h-16 w-full items-center gap-3 px-4 py-3 text-left hover:bg-surface-2"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate font-semibold">{u.fullName ?? u.email}</span>
                  {u.userId === bootstrap.user.id && <span className="text-xs text-muted">(you)</span>}
                  {!u.active && <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs text-muted">Inactive</span>}
                </div>
                <div className="truncate text-sm text-muted">
                  {u.email} · {u.roles.map((r) => roleName.get(r) ?? r).join(', ') || 'No role'}
                </div>
              </div>
              <ChevronRightIcon className="shrink-0 text-muted" />
            </button>
          </li>
        ))}
      </ul>

      {editing && (
        <EditUserSheet
          key={editing.userId}
          user={editing}
          roles={users.data.roles}
          isSelf={editing.userId === bootstrap.user.id}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
}

function EditUserSheet({ user, roles, isSelf, onClose }: { user: UserDto; roles: RoleDto[]; isSelf: boolean; onClose: () => void }) {
  const [selected, setSelected] = useState(new Set(user.roles));
  const [active, setActive] = useState(user.active);
  const [error, setError] = useState<string | null>(null);
  const update = useUpdateUser();
  const toast = useToast();

  async function save() {
    setError(null);
    try {
      await update.mutateAsync({ userId: user.userId, roles: [...selected], active, version: user.version });
      toast.show('User updated');
      onClose();
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : 'Could not update the user.');
    }
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title={user.fullName ?? user.email ?? 'User'}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save} loading={update.isPending} disabled={selected.size === 0}>
            Save
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="text-sm text-muted">{user.email}</p>
        {error && <Alert>{error}</Alert>}
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-medium">Roles</legend>
          {roles.map((r) => (
            <label key={r.key} className="flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border border-border px-4">
              <input
                type="checkbox"
                className="size-5 accent-[var(--brand)]"
                checked={selected.has(r.key)}
                onChange={(e) => {
                  const next = new Set(selected);
                  if (e.target.checked) next.add(r.key);
                  else next.delete(r.key);
                  setSelected(next);
                }}
              />
              {r.name}
            </label>
          ))}
        </fieldset>
        <label className="flex min-h-12 cursor-pointer items-center justify-between gap-3 rounded-xl border border-border px-4">
          <span>
            Active
            {isSelf && <span className="block text-xs text-muted">You can’t deactivate yourself.</span>}
          </span>
          <input
            type="checkbox"
            className="size-5 accent-[var(--brand)]"
            checked={active}
            disabled={isSelf}
            onChange={(e) => setActive(e.target.checked)}
          />
        </label>
        {isSelf && selected.has('admin') === false && (
          <Alert tone="warn">Removing your own Admin role takes away your access to this screen.</Alert>
        )}
      </div>
    </Sheet>
  );
}
