-- User administration: emails on profiles, safe role changes, protected activation flag.

alter table public.profiles add column if not exists email text;
update public.profiles p set email = u.email from auth.users u where u.id = p.user_id and p.email is null;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role smallint;
begin
  insert into public.profiles (user_id, full_name, email)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)), new.email);

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
revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- Only user managers may change active/email; users can still edit their own name.
create or replace function public.profiles_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (new.active is distinct from old.active or new.email is distinct from old.email or new.user_id <> old.user_id)
     and not public.has_permission('users.manage') then
    raise exception 'Only administrators can change this.' using errcode = '42501';
  end if;
  if old.active and not new.active and new.user_id = auth.uid() then
    raise exception 'You cannot deactivate your own account.' using errcode = 'FPC02';
  end if;
  return new;
end;
$$;
revoke execute on function public.profiles_guard() from public, anon, authenticated;

drop trigger if exists profiles_guard on public.profiles;
create trigger profiles_guard before update on public.profiles
  for each row execute function public.profiles_guard();

-- There must always be at least one active admin.
create or replace function public.active_admin_count()
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select count(distinct ur.user_id)
  from public.user_roles ur
  join public.roles r on r.id = ur.role_id and r.key = 'admin'
  join public.profiles p on p.user_id = ur.user_id and p.active;
$$;
revoke execute on function public.active_admin_count() from public, anon;
grant execute on function public.active_admin_count() to authenticated;

create or replace function public.ensure_an_admin_remains()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if public.active_admin_count() = 0 then
    raise exception 'At least one active admin is required.' using errcode = 'FPC02';
  end if;
  return null;
end;
$$;
revoke execute on function public.ensure_an_admin_remains() from public, anon, authenticated;

drop trigger if exists user_roles_keep_admin on public.user_roles;
create constraint trigger user_roles_keep_admin after delete or update on public.user_roles
  deferrable initially deferred
  for each row execute function public.ensure_an_admin_remains();
drop trigger if exists profiles_keep_admin on public.profiles;
create constraint trigger profiles_keep_admin after update of active on public.profiles
  deferrable initially deferred
  for each row execute function public.ensure_an_admin_remains();

-- Replace a user's roles in one transaction (the admin check runs at commit).
-- SECURITY DEFINER: permission is checked explicitly below; running as invoker
-- would make an admin editing their own roles lose access mid-transaction.
create or replace function public.set_user_roles(p_user_id uuid, p_role_keys text[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.has_permission('users.manage') then
    raise exception 'You do not have permission to manage users.' using errcode = '42501';
  end if;
  if p_role_keys is null or cardinality(p_role_keys) = 0 then
    raise exception 'Choose at least one role.' using errcode = 'FPC02';
  end if;
  if exists (select 1 from unnest(p_role_keys) k where not exists (select 1 from public.roles r where r.key = k and r.active)) then
    raise exception 'Unknown role.' using errcode = 'FPC02';
  end if;
  if not exists (select 1 from public.profiles where user_id = p_user_id) then
    raise exception 'User not found.' using errcode = 'P0002';
  end if;

  delete from public.user_roles where user_id = p_user_id;
  insert into public.user_roles (user_id, role_id)
  select p_user_id, r.id from public.roles r where r.key = any (p_role_keys);
end;
$$;
revoke execute on function public.set_user_roles(uuid, text[]) from public, anon;
grant execute on function public.set_user_roles(uuid, text[]) to authenticated;

create index if not exists audit_logs_user_id_idx on public.audit_logs(user_id);
