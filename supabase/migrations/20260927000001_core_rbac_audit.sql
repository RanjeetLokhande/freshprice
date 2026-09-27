-- Core helpers, RBAC and audit.
-- Permissions are data (permission keys), so new roles need no code changes.

create extension if not exists citext with schema extensions;

-- ---------------------------------------------------------------------------
-- Generic row maintenance: updated_at + optimistic-concurrency version
-- ---------------------------------------------------------------------------
create or replace function public.touch_row()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  new.version := old.version + 1;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- RBAC
-- ---------------------------------------------------------------------------
create table public.roles (
  id          smallint generated always as identity primary key,
  key         text not null unique check (key ~ '^[a-z][a-z0-9_]*$'),
  name        text not null,
  active      boolean not null default true,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  version     integer not null default 1
);

create table public.permissions (
  key          text primary key check (key ~ '^[a-z][a-z0-9_.]*$'),
  description  text not null
);

create table public.role_permissions (
  role_id         smallint not null references public.roles(id) on delete cascade,
  permission_key  text not null references public.permissions(key) on delete cascade,
  primary key (role_id, permission_key)
);
create index role_permissions_permission_key_idx on public.role_permissions(permission_key);

create table public.profiles (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  full_name   text,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  version     integer not null default 1
);

create table public.user_roles (
  user_id  uuid not null references auth.users(id) on delete cascade,
  role_id  smallint not null references public.roles(id),
  primary key (user_id, role_id)
);
create index user_roles_role_id_idx on public.user_roles(role_id);

create trigger roles_touch before update on public.roles
  for each row execute function public.touch_row();
create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_row();

create or replace function public.has_permission(p_key text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.user_roles ur
    join public.roles r on r.id = ur.role_id and r.active
    join public.role_permissions rp on rp.role_id = ur.role_id
    join public.profiles p on p.user_id = ur.user_id and p.active
    where ur.user_id = (select auth.uid())
      and rp.permission_key = p_key
  );
$$;

create or replace function public.my_permissions()
returns setof text
language sql
stable
security definer
set search_path = ''
as $$
  select distinct rp.permission_key
  from public.user_roles ur
  join public.roles r on r.id = ur.role_id and r.active
  join public.role_permissions rp on rp.role_id = ur.role_id
  join public.profiles p on p.user_id = ur.user_id and p.active
  where ur.user_id = (select auth.uid());
$$;

revoke execute on function public.has_permission(text) from public, anon;
revoke execute on function public.my_permissions() from public, anon;
grant execute on function public.has_permission(text) to authenticated;
grant execute on function public.my_permissions() to authenticated;

-- New auth user -> profile + role. The very first user becomes admin so the
-- system can be set up; every later sign-up gets the default 'user' role.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role smallint;
begin
  insert into public.profiles (user_id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)));

  if not exists (
    select 1 from public.user_roles ur join public.roles r on r.id = ur.role_id where r.key = 'admin'
  ) then
    select id into v_role from public.roles where key = 'admin';
  else
    select id into v_role from public.roles where key = 'user';
  end if;

  if v_role is not null then
    insert into public.user_roles (user_id, role_id) values (new.id, v_role);
  end if;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Audit log (written only by triggers)
-- ---------------------------------------------------------------------------
create table public.audit_logs (
  id          bigint generated always as identity primary key,
  user_id     uuid,
  action      text not null,
  entity      text not null,
  entity_id   text,
  old_data    jsonb,
  new_data    jsonb,
  request_id  text,
  created_at  timestamptz not null default now()
);
create index audit_logs_entity_idx on public.audit_logs(entity, entity_id);
create index audit_logs_created_at_idx on public.audit_logs(created_at desc);

create or replace function public.audit_row()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end;
  v_new jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end;
begin
  -- Skip no-op updates (only bookkeeping columns changed)
  if tg_op = 'UPDATE'
     and (v_old - 'updated_at' - 'version') = (v_new - 'updated_at' - 'version') then
    return new;
  end if;

  insert into public.audit_logs (user_id, action, entity, entity_id, old_data, new_data, request_id)
  values (
    auth.uid(),
    lower(tg_op),
    tg_table_name,
    coalesce(v_new ->> 'id', v_old ->> 'id', v_new ->> 'key', v_old ->> 'key'),
    v_old,
    v_new,
    nullif(current_setting('app.request_id', true), '')
  );
  return coalesce(new, old);
end;
$$;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.roles enable row level security;
alter table public.permissions enable row level security;
alter table public.role_permissions enable row level security;
alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;
alter table public.audit_logs enable row level security;

create policy roles_read on public.roles for select to authenticated using (true);
create policy roles_write on public.roles for all to authenticated
  using ((select public.has_permission('users.manage')))
  with check ((select public.has_permission('users.manage')));

create policy permissions_read on public.permissions for select to authenticated using (true);

create policy role_permissions_read on public.role_permissions for select to authenticated using (true);
create policy role_permissions_write on public.role_permissions for all to authenticated
  using ((select public.has_permission('users.manage')))
  with check ((select public.has_permission('users.manage')));

create policy profiles_read on public.profiles for select to authenticated
  using (user_id = (select auth.uid()) or (select public.has_permission('users.manage')));
create policy profiles_update_self on public.profiles for update to authenticated
  using (user_id = (select auth.uid()) or (select public.has_permission('users.manage')))
  with check (user_id = (select auth.uid()) or (select public.has_permission('users.manage')));

create policy user_roles_read on public.user_roles for select to authenticated
  using (user_id = (select auth.uid()) or (select public.has_permission('users.manage')));
create policy user_roles_write on public.user_roles for all to authenticated
  using ((select public.has_permission('users.manage')))
  with check ((select public.has_permission('users.manage')));

create policy audit_logs_read on public.audit_logs for select to authenticated
  using ((select public.has_permission('audit.read')));
