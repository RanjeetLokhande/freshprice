-- Fresh Price: complete database setup (all migrations combined).
-- Run ONCE in a NEW, EMPTY Supabase project: Dashboard -> SQL Editor -> paste -> Run.
-- Wrapped in one transaction: if anything fails, nothing is created.

begin;

-- ===== 20260927000001_core_rbac_audit.sql =====
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


-- ===== 20260927000002_masters.sql =====
-- Master data: everything business-specific is a row, not code.

create table public.app_settings (
  key          text primary key check (key ~ '^[a-z][a-z0-9_.]*$'),
  value        jsonb not null,
  data_type    text not null check (data_type in ('text', 'number', 'boolean', 'select', 'json')),
  label        text not null,
  description  text,
  options      jsonb,
  sort_order   integer not null default 0,
  updated_at   timestamptz not null default now(),
  version      integer not null default 1
);

create table public.categories (
  id          bigint generated always as identity primary key,
  name        extensions.citext not null unique,
  parent_id   bigint references public.categories(id),
  active      boolean not null default true,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  version     integer not null default 1,
  check (parent_id is distinct from id)
);
create index categories_parent_id_idx on public.categories(parent_id);

create table public.unit_types (
  id          bigint generated always as identity primary key,
  key         text not null unique check (key ~ '^[a-z][a-z0-9_]*$'),
  name        text not null,
  active      boolean not null default true,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  version     integer not null default 1
);

-- A unit with base_unit_id null is a base unit (conversion_factor must be 1).
-- Other units convert as: qty_in_base = qty * conversion_factor.
create table public.units (
  id                 bigint generated always as identity primary key,
  name               text not null,
  symbol             extensions.citext not null unique,
  unit_type_id       bigint not null references public.unit_types(id),
  base_unit_id       bigint references public.units(id),
  conversion_factor  numeric(18, 8) not null default 1 check (conversion_factor > 0),
  decimal_precision  smallint not null default 2 check (decimal_precision between 0 and 6),
  active             boolean not null default true,
  sort_order         integer not null default 0,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  version            integer not null default 1,
  check (base_unit_id is not null or conversion_factor = 1),
  check (base_unit_id is distinct from id)
);
create index units_unit_type_id_idx on public.units(unit_type_id);
create index units_base_unit_id_idx on public.units(base_unit_id);

-- A derived unit must share its base unit's type, and the base must itself be a base.
create or replace function public.units_validate()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_base public.units;
begin
  if new.base_unit_id is not null then
    select * into v_base from public.units where id = new.base_unit_id;
    if v_base.base_unit_id is not null then
      raise exception 'Base unit % must itself be a base unit', v_base.symbol using errcode = '23514';
    end if;
    if v_base.unit_type_id <> new.unit_type_id then
      raise exception 'Unit % must have the same unit type as its base unit %', new.symbol, v_base.symbol
        using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

create table public.items (
  id               bigint generated always as identity primary key,
  name             extensions.citext not null,
  category_id      bigint not null references public.categories(id),
  pricing_unit_id  bigint not null references public.units(id),
  default_unit_id  bigint not null references public.units(id),
  attributes       jsonb not null default '{}'::jsonb check (jsonb_typeof(attributes) = 'object'),
  active           boolean not null default true,
  sort_order       integer not null default 0,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  deleted_at       timestamptz,
  version          integer not null default 1
);
create unique index items_name_live_uidx on public.items(name) where deleted_at is null;
create index items_category_id_idx on public.items(category_id);
create index items_pricing_unit_id_idx on public.items(pricing_unit_id);
create index items_default_unit_id_idx on public.items(default_unit_id);

-- Item-specific conversions that generic units can't express (1 box mango = 5 kg).
create table public.item_unit_conversions (
  id            bigint generated always as identity primary key,
  item_id       bigint not null references public.items(id) on delete cascade,
  from_unit_id  bigint not null references public.units(id),
  to_unit_id    bigint not null references public.units(id),
  factor        numeric(18, 8) not null check (factor > 0),
  active        boolean not null default true,
  sort_order    integer not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  version       integer not null default 1,
  unique (item_id, from_unit_id, to_unit_id),
  check (from_unit_id <> to_unit_id)
);
create index item_unit_conversions_from_idx on public.item_unit_conversions(from_unit_id);
create index item_unit_conversions_to_idx on public.item_unit_conversions(to_unit_id);

-- Dynamic custom fields rendered by generic forms/lists; values live in <entity>.attributes.
create table public.field_definitions (
  id              bigint generated always as identity primary key,
  entity          text not null check (entity ~ '^[a-z][a-z0-9_]*$'),
  key             text not null check (key ~ '^[a-z][a-z0-9_]*$'),
  label           text not null,
  data_type       text not null check (data_type in ('text', 'number', 'decimal', 'boolean', 'date', 'select', 'lookup')),
  options         jsonb,
  lookup_entity   text,
  required        boolean not null default false,
  min_value       numeric,
  max_value       numeric,
  pattern         text,
  help_text       text,
  show_in_list    boolean not null default true,
  show_in_form    boolean not null default true,
  mobile_visible  boolean not null default false,
  list_order      integer not null default 0,
  form_order      integer not null default 0,
  active          boolean not null default true,
  sort_order      integer not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  version         integer not null default 1,
  unique (entity, key),
  check (data_type <> 'select' or jsonb_typeof(options) = 'array'),
  check (data_type <> 'lookup' or lookup_entity is not null)
);

-- Triggers
create trigger app_settings_touch before update on public.app_settings
  for each row execute function public.touch_row();
create trigger categories_touch before update on public.categories
  for each row execute function public.touch_row();
create trigger unit_types_touch before update on public.unit_types
  for each row execute function public.touch_row();
create trigger units_touch before update on public.units
  for each row execute function public.touch_row();
create trigger units_validate before insert or update on public.units
  for each row execute function public.units_validate();
create trigger items_touch before update on public.items
  for each row execute function public.touch_row();
create trigger item_unit_conversions_touch before update on public.item_unit_conversions
  for each row execute function public.touch_row();
create trigger field_definitions_touch before update on public.field_definitions
  for each row execute function public.touch_row();

create trigger app_settings_audit after insert or update or delete on public.app_settings
  for each row execute function public.audit_row();
create trigger categories_audit after insert or update or delete on public.categories
  for each row execute function public.audit_row();
create trigger units_audit after insert or update or delete on public.units
  for each row execute function public.audit_row();
create trigger items_audit after insert or update or delete on public.items
  for each row execute function public.audit_row();
create trigger item_unit_conversions_audit after insert or update or delete on public.item_unit_conversions
  for each row execute function public.audit_row();
create trigger field_definitions_audit after insert or update or delete on public.field_definitions
  for each row execute function public.audit_row();

-- RLS: every authenticated user reads masters; writes need masters.<table>.write
alter table public.app_settings enable row level security;
create policy app_settings_read on public.app_settings for select to authenticated using (true);
create policy app_settings_write on public.app_settings for update to authenticated
  using ((select public.has_permission('settings.write')))
  with check ((select public.has_permission('settings.write')));

do $$
declare
  t text;
begin
  foreach t in array array['categories', 'unit_types', 'units', 'items', 'item_unit_conversions', 'field_definitions']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I on public.%I for select to authenticated using (true)', t || '_read', t);
    execute format(
      'create policy %I on public.%I for insert to authenticated with check ((select public.has_permission(%L)))',
      t || '_insert', t, 'masters.' || t || '.write');
    execute format(
      'create policy %I on public.%I for update to authenticated using ((select public.has_permission(%L))) with check ((select public.has_permission(%L)))',
      t || '_update', t, 'masters.' || t || '.write', 'masters.' || t || '.write');
    execute format(
      'create policy %I on public.%I for delete to authenticated using ((select public.has_permission(%L)))',
      t || '_delete', t, 'masters.' || t || '.write');
  end loop;
end;
$$;


-- ===== 20260927000003_prices_calculations.sql =====
-- Dated prices (never overwritten silently) and calculations with snapshots.

-- ---------------------------------------------------------------------------
-- Daily prices
-- ---------------------------------------------------------------------------
create table public.item_prices (
  id          bigint generated always as identity primary key,
  item_id     bigint not null references public.items(id),
  price_date  date not null,
  unit_id     bigint not null references public.units(id),
  price       numeric(12, 2) not null check (price >= 0),
  notes       text,
  created_by  uuid default auth.uid(),
  updated_by  uuid default auth.uid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  version     integer not null default 1,
  unique (item_id, price_date, unit_id)
);
create index item_prices_item_date_idx on public.item_prices(item_id, price_date desc);
create index item_prices_date_idx on public.item_prices(price_date);
create index item_prices_unit_id_idx on public.item_prices(unit_id);

create table public.item_price_revisions (
  id          bigint generated always as identity primary key,
  price_id    bigint not null references public.item_prices(id) on delete cascade,
  old_price   numeric(12, 2) not null,
  new_price   numeric(12, 2) not null,
  changed_by  uuid,
  changed_at  timestamptz not null default now()
);
create index item_price_revisions_price_id_idx on public.item_price_revisions(price_id);

create or replace function public.item_prices_before_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.item_id <> old.item_id or new.price_date <> old.price_date or new.unit_id <> old.unit_id then
    raise exception 'Item, date and unit of a price cannot be changed; create a new price instead'
      using errcode = '23514';
  end if;
  new.updated_by := auth.uid();
  return new;
end;
$$;

create or replace function public.item_prices_record_revision()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.price <> old.price then
    insert into public.item_price_revisions (price_id, old_price, new_price, changed_by)
    values (new.id, old.price, new.price, auth.uid());
  end if;
  return new;
end;
$$;

create trigger item_prices_guard before update on public.item_prices
  for each row execute function public.item_prices_before_update();
create trigger item_prices_touch before update on public.item_prices
  for each row execute function public.touch_row();
create trigger item_prices_revision after update on public.item_prices
  for each row execute function public.item_prices_record_revision();
create trigger item_prices_audit after insert or update or delete on public.item_prices
  for each row execute function public.audit_row();

-- ---------------------------------------------------------------------------
-- Calculations
-- ---------------------------------------------------------------------------
create type public.calculation_status as enum ('draft', 'finalized', 'cancelled');

create sequence public.calculation_ref_seq;

create table public.calculations (
  id                bigint generated always as identity primary key,
  reference_number  text not null unique,
  calculation_date  date not null,
  subtotal          numeric(12, 2) not null default 0,
  adjustment        numeric(12, 2) not null default 0,
  grand_total       numeric(12, 2) not null default 0,
  status            public.calculation_status not null default 'draft',
  notes             text,
  idempotency_key   uuid unique,
  created_by        uuid not null default auth.uid() references auth.users(id),
  finalized_at      timestamptz,
  finalized_by      uuid references auth.users(id),
  cancelled_at      timestamptz,
  cancelled_by      uuid references auth.users(id),
  cancel_reason     text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  version           integer not null default 1,
  check (grand_total = subtotal + adjustment)
);
create index calculations_date_idx on public.calculations(calculation_date desc);
create index calculations_created_by_idx on public.calculations(created_by);
create index calculations_status_idx on public.calculations(status);
create index calculations_finalized_by_idx on public.calculations(finalized_by);
create index calculations_cancelled_by_idx on public.calculations(cancelled_by);

create table public.calculation_items (
  id                          bigint generated always as identity primary key,
  calculation_id              bigint not null references public.calculations(id) on delete cascade,
  line_no                     integer not null check (line_no > 0),
  item_id                     bigint not null references public.items(id),
  item_name_snapshot          text not null,
  category_name_snapshot      text,
  quantity                    numeric(14, 4) not null check (quantity > 0),
  unit_id                     bigint not null references public.units(id),
  unit_symbol_snapshot        text not null,
  normalized_quantity         numeric(18, 6) not null check (normalized_quantity > 0),
  price                       numeric(12, 2) not null check (price >= 0),
  price_unit_id               bigint not null references public.units(id),
  price_unit_symbol_snapshot  text not null,
  price_id                    bigint references public.item_prices(id) on delete set null,
  amount                      numeric(12, 2) not null check (amount >= 0),
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now(),
  unique (calculation_id, line_no)
);
create index calculation_items_item_id_idx on public.calculation_items(item_id);
create index calculation_items_unit_id_idx on public.calculation_items(unit_id);
create index calculation_items_price_unit_id_idx on public.calculation_items(price_unit_id);
create index calculation_items_price_id_idx on public.calculation_items(price_id);

-- Finalized calculations are frozen; the only allowed change is cancellation.
create or replace function public.calculations_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    if old.status <> 'draft' then
      raise exception 'Only draft calculations can be deleted' using errcode = '23514';
    end if;
    return old;
  end if;

  if old.status = 'cancelled' then
    raise exception 'Cancelled calculations cannot be changed' using errcode = '23514';
  end if;

  if old.status = 'finalized' then
    if new.status <> 'cancelled'
       or new.subtotal <> old.subtotal or new.adjustment <> old.adjustment
       or new.grand_total <> old.grand_total or new.calculation_date <> old.calculation_date
       or new.reference_number <> old.reference_number then
      raise exception 'Finalized calculations can only be cancelled' using errcode = '23514';
    end if;
  end if;

  if new.reference_number <> old.reference_number or new.created_by <> old.created_by then
    raise exception 'Reference number and creator are immutable' using errcode = '23514';
  end if;
  return new;
end;
$$;

create or replace function public.calculation_items_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_status public.calculation_status;
begin
  select status into v_status from public.calculations
  where id = coalesce(new.calculation_id, old.calculation_id);

  -- Parent already gone (cascade delete of a draft) -> allow
  if v_status is null then
    return coalesce(new, old);
  end if;
  if v_status <> 'draft' then
    raise exception 'Lines of a % calculation cannot be changed', v_status using errcode = '23514';
  end if;
  if tg_op = 'UPDATE' then
    new.updated_at := now();
  end if;
  return coalesce(new, old);
end;
$$;

create trigger calculations_guard before update or delete on public.calculations
  for each row execute function public.calculations_guard();
create trigger calculations_touch before update on public.calculations
  for each row execute function public.touch_row();
create trigger calculations_audit after insert or update or delete on public.calculations
  for each row execute function public.audit_row();
create trigger calculation_items_guard before insert or update or delete on public.calculation_items
  for each row execute function public.calculation_items_guard();

-- ---------------------------------------------------------------------------
-- Idempotency (double-tap / retry protection for mutations)
-- ---------------------------------------------------------------------------
create table public.idempotency_keys (
  key          uuid not null,
  user_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  endpoint     text not null,
  status_code  integer not null,
  response     jsonb not null,
  created_at   timestamptz not null default now(),
  primary key (user_id, key)
);
create index idempotency_keys_created_at_idx on public.idempotency_keys(created_at);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.item_prices enable row level security;
alter table public.item_price_revisions enable row level security;
alter table public.calculations enable row level security;
alter table public.calculation_items enable row level security;
alter table public.idempotency_keys enable row level security;

create policy item_prices_read on public.item_prices for select to authenticated
  using ((select public.has_permission('prices.read')));
create policy item_prices_insert on public.item_prices for insert to authenticated
  with check ((select public.has_permission('prices.write')));
create policy item_prices_update on public.item_prices for update to authenticated
  using ((select public.has_permission('prices.write')))
  with check ((select public.has_permission('prices.write')));

create policy item_price_revisions_read on public.item_price_revisions for select to authenticated
  using ((select public.has_permission('prices.read')));

create policy calculations_read on public.calculations for select to authenticated
  using (created_by = (select auth.uid()) or (select public.has_permission('calculations.read_all')));
create policy calculations_insert on public.calculations for insert to authenticated
  with check (created_by = (select auth.uid()) and (select public.has_permission('calculations.write')));
create policy calculations_update on public.calculations for update to authenticated
  using (
    (created_by = (select auth.uid()) and (select public.has_permission('calculations.write')))
    or (select public.has_permission('calculations.cancel'))
  )
  with check (
    (created_by = (select auth.uid()) and (select public.has_permission('calculations.write')))
    or (select public.has_permission('calculations.cancel'))
  );
create policy calculations_delete on public.calculations for delete to authenticated
  using (created_by = (select auth.uid()) and status = 'draft');

create policy calculation_items_read on public.calculation_items for select to authenticated
  using (exists (
    select 1 from public.calculations c
    where c.id = calculation_id
      and (c.created_by = (select auth.uid()) or (select public.has_permission('calculations.read_all')))
  ));
create policy calculation_items_write on public.calculation_items for all to authenticated
  using (exists (
    select 1 from public.calculations c
    where c.id = calculation_id and c.created_by = (select auth.uid()) and c.status = 'draft'
  ))
  with check (exists (
    select 1 from public.calculations c
    where c.id = calculation_id and c.created_by = (select auth.uid()) and c.status = 'draft'
  ));

create policy idempotency_keys_own on public.idempotency_keys for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));


-- ===== 20260927000004_seed_reference_data.sql =====
-- Reference data. Everything here is editable later from the masters/settings screens.
-- To extend: add rows to the VALUES lists below (or insert via the app).

-- Permissions -------------------------------------------------------------
insert into public.permissions (key, description) values
  ('masters.categories.write',            'Manage categories'),
  ('masters.unit_types.write',            'Manage unit types'),
  ('masters.units.write',                 'Manage units'),
  ('masters.items.write',                 'Manage items'),
  ('masters.item_unit_conversions.write', 'Manage item-specific unit conversions'),
  ('masters.field_definitions.write',     'Manage custom fields'),
  ('settings.write',                      'Change application settings'),
  ('prices.read',                         'View prices and price history'),
  ('prices.write',                        'Create and change daily prices'),
  ('calculations.write',                  'Create and edit own draft calculations'),
  ('calculations.finalize',               'Finalize own calculations'),
  ('calculations.cancel',                 'Cancel any calculation'),
  ('calculations.read_all',               'View calculations of all users'),
  ('reports.read',                        'View reports and exports'),
  ('users.manage',                        'Manage users and roles'),
  ('audit.read',                          'View audit log');

-- Roles -------------------------------------------------------------------
insert into public.roles (key, name, sort_order) values
  ('admin', 'Admin', 1),
  ('user',  'User',  2);

insert into public.role_permissions (role_id, permission_key)
select r.id, p.key from public.roles r cross join public.permissions p where r.key = 'admin';

insert into public.role_permissions (role_id, permission_key)
select r.id, p.key
from public.roles r
join public.permissions p on p.key in ('prices.read', 'calculations.write', 'calculations.finalize')
where r.key = 'user';

-- Settings ----------------------------------------------------------------
insert into public.app_settings (key, value, data_type, label, description, options, sort_order) values
  ('business.timezone',       '"Asia/Kolkata"', 'text',   'Business timezone',   'IANA timezone that defines the business date', null, 1),
  ('currency.code',           '"INR"',          'text',   'Currency code',       'ISO 4217 code', null, 2),
  ('currency.symbol',         '"₹"',            'text',   'Currency symbol',     null, null, 3),
  ('currency.locale',         '"en-IN"',        'text',   'Number format locale','Used for grouping, e.g. 1,23,000', null, 4),
  ('money.scale',             '2',              'number', 'Amount decimals',     'Decimals kept for amounts', null, 5),
  ('money.rounding_mode',     '"HALF_UP"',      'select', 'Rounding mode',       'Applied once, to each line amount', '["HALF_UP","HALF_EVEN","DOWN","UP"]', 6),
  ('calculation.duplicate_line_policy', '"merge"', 'select', 'Duplicate item lines', 'What happens when an item is added twice', '["merge","allow"]', 7),
  ('calculation.reference_prefix',      '"CAL-"',  'text',   'Reference prefix',     null, null, 8),
  ('calculation.reference_padding',     '6',       'number', 'Reference digits',     'CAL-000123 uses 6', null, 9),
  ('prices.allow_copy_previous',        'true',    'boolean','Allow copying previous price', 'Explicit user action only', null, 10);

-- Unit types & units -------------------------------------------------------
insert into public.unit_types (key, name, sort_order) values
  ('weight', 'Weight', 1),
  ('volume', 'Volume', 2),
  ('count',  'Count',  3),
  ('pack',   'Pack',   4);

-- Base units first
insert into public.units (name, symbol, unit_type_id, conversion_factor, decimal_precision, sort_order)
select v.name, v.symbol, t.id, 1, v.prec, v.sort
from (values
  ('Kilogram', 'kg',     'weight', 3, 1),
  ('Litre',    'L',      'volume', 3, 3),
  ('Piece',    'pc',     'count',  0, 5),
  ('Box',      'box',    'pack',   0, 7),
  ('Packet',   'pkt',    'pack',   0, 8),
  ('Bundle',   'bundle', 'pack',   0, 9)
) as v(name, symbol, type_key, prec, sort)
join public.unit_types t on t.key = v.type_key;

-- Derived units
insert into public.units (name, symbol, unit_type_id, base_unit_id, conversion_factor, decimal_precision, sort_order)
select v.name, v.symbol, b.unit_type_id, b.id, v.factor, v.prec, v.sort
from (values
  ('Gram',       'g',     'kg', 0.001, 0, 2),
  ('Millilitre', 'ml',    'L',  0.001, 0, 4),
  ('Dozen',      'dozen', 'pc', 12,    2, 6)
) as v(name, symbol, base_symbol, factor, prec, sort)
join public.units b on b.symbol = v.base_symbol;

-- Categories ----------------------------------------------------------------
insert into public.categories (name, sort_order) values
  ('Vegetable', 1),
  ('Fruit',     2),
  ('Other',     9);

insert into public.categories (name, parent_id, sort_order)
select v.name, p.id, v.sort
from (values ('Leafy Vegetable', 3), ('Root Vegetable', 4)) as v(name, sort)
join public.categories p on p.name = 'Vegetable';

-- Items ---------------------------------------------------------------------
insert into public.items (name, category_id, pricing_unit_id, default_unit_id, sort_order)
select v.name, c.id, pu.id, du.id, v.sort
from (values
  ('Potato',      'Root Vegetable',  'kg',     'kg',     1),
  ('Onion',       'Root Vegetable',  'kg',     'kg',     2),
  ('Tomato',      'Vegetable',       'kg',     'kg',     3),
  ('Chilli',      'Vegetable',       'kg',     'g',      4),
  ('Cucumber',    'Vegetable',       'kg',     'kg',     5),
  ('Carrot',      'Root Vegetable',  'kg',     'kg',     6),
  ('Cabbage',     'Leafy Vegetable', 'kg',     'kg',     7),
  ('Cauliflower', 'Vegetable',       'kg',     'kg',     8),
  ('Spinach',     'Leafy Vegetable', 'bundle', 'bundle', 9),
  ('Brinjal',     'Vegetable',       'kg',     'kg',     10),
  ('Capsicum',    'Vegetable',       'kg',     'kg',     11),
  ('Lady Finger', 'Vegetable',       'kg',     'kg',     12),
  ('Apple',       'Fruit',           'kg',     'kg',     13),
  ('Banana',      'Fruit',           'dozen',  'dozen',  14),
  ('Mango',       'Fruit',           'kg',     'kg',     15),
  ('Orange',      'Fruit',           'kg',     'kg',     16),
  ('Grapes',      'Fruit',           'kg',     'kg',     17),
  ('Papaya',      'Fruit',           'kg',     'kg',     18),
  ('Pomegranate', 'Fruit',           'kg',     'kg',     19),
  ('Watermelon',  'Fruit',           'kg',     'kg',     20)
) as v(name, category, pricing_unit, default_unit, sort)
join public.categories c on c.name = v.category
join public.units pu on pu.symbol = v.pricing_unit
join public.units du on du.symbol = v.default_unit;

-- Example item-specific conversion: a box of mangoes weighs 5 kg
insert into public.item_unit_conversions (item_id, from_unit_id, to_unit_id, factor)
select i.id, f.id, t.id, 5
from public.items i, public.units f, public.units t
where i.name = 'Mango' and f.symbol = 'box' and t.symbol = 'kg';

-- Example custom field (shows the dynamic-field engine end to end)
insert into public.field_definitions (entity, key, label, data_type, options, show_in_list, mobile_visible, form_order, list_order)
values ('items', 'origin', 'Origin', 'select', '["Local","Other state","Imported"]', true, false, 1, 1);


-- ===== 20260927000005_revoke_trigger_fn_execute.sql =====
-- Trigger functions are never called directly; keep them off the RPC API.
revoke execute on function public.audit_row() from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.item_prices_record_revision() from public, anon, authenticated;
revoke execute on function public.touch_row() from public, anon, authenticated;
revoke execute on function public.units_validate() from public, anon, authenticated;
revoke execute on function public.item_prices_before_update() from public, anon, authenticated;
revoke execute on function public.calculations_guard() from public, anon, authenticated;
revoke execute on function public.calculation_items_guard() from public, anon, authenticated;


-- ===== 20260927000006_explicit_grants.sql =====
-- Explicit API grants (newer projects may not auto-grant new tables).
-- Row Level Security still decides which rows each user can read or write.
grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;
revoke all on all tables in schema public from anon;


-- ===== 20260927000007_price_functions.sql =====
-- Daily price batch save + previous-price lookup.

-- Latest price strictly before a date, per item and unit (one query for all items).
create or replace function public.latest_prices_before(p_date date)
returns table (item_id bigint, unit_id bigint, price_date date, price numeric)
language sql
stable
security invoker
set search_path = ''
as $$
  select distinct on (p.item_id, p.unit_id) p.item_id, p.unit_id, p.price_date, p.price
  from public.item_prices p
  where p.price_date < p_date
  order by p.item_id, p.unit_id, p.price_date desc;
$$;

-- Saves many prices for one date in ONE transaction and returns a result per row.
--   p_atomic = true  : any failed row rolls back the whole batch (rows report "skipped")
--   p_atomic = false : valid rows are saved, invalid rows are reported
-- Row input: {"itemId": 1, "unitId": 1, "price": "30.00", "notes": null, "version": 3}
-- "version" (optional) = version the client last saw; a mismatch is reported as a conflict.
create or replace function public.upsert_prices(p_date date, p_rows jsonb, p_atomic boolean default true)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_row jsonb;
  v_index int := -1;
  v_results jsonb := '[]'::jsonb;
  v_item public.items;
  v_item_id bigint;
  v_unit_id bigint;
  v_price numeric;
  v_notes text;
  v_version int;
  v_existing public.item_prices;
  v_id bigint;
  v_msg text;
  v_field text;
  v_created int := 0;
  v_updated int := 0;
  v_unchanged int := 0;
  v_failed int := 0;
  v_rolled_back boolean := false;
begin
  if not public.has_permission('prices.write') then
    raise exception 'You do not have permission to change prices.' using errcode = '42501';
  end if;
  if p_date is null then
    raise exception 'Date is required.' using errcode = '22023';
  end if;
  if jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows) = 0 then
    raise exception 'Nothing to save.' using errcode = '22023';
  end if;
  if jsonb_array_length(p_rows) > 500 then
    raise exception 'At most 500 prices per save.' using errcode = '22023';
  end if;

  begin
    for v_row in select value from jsonb_array_elements(p_rows) loop
      v_index := v_index + 1;
      v_item_id := null;
      begin
        v_item_id := (v_row ->> 'itemId')::bigint;
        v_unit_id := (v_row ->> 'unitId')::bigint;
        v_notes := nullif(btrim(v_row ->> 'notes'), '');
        v_version := (v_row ->> 'version')::int;

        begin
          v_price := round((v_row ->> 'price')::numeric, 2);
        exception when others then
          raise exception 'Enter a valid price.' using errcode = 'FPV01', detail = 'price';
        end;

        select * into v_item from public.items where id = v_item_id and deleted_at is null;
        if not found then
          raise exception 'Unknown item.' using errcode = 'FPV01', detail = 'itemId';
        end if;
        if not v_item.active then
          raise exception '% is inactive.', v_item.name using errcode = 'FPV01', detail = 'itemId';
        end if;
        if not exists (select 1 from public.units u where u.id = v_unit_id and u.active) then
          raise exception 'Unknown unit.' using errcode = 'FPV01', detail = 'unitId';
        end if;
        if v_price is null or v_price < 0 then
          raise exception 'Price must be zero or more.' using errcode = 'FPV01', detail = 'price';
        end if;
        if v_price > 9999999999.99 then
          raise exception 'Price is too large.' using errcode = 'FPV01', detail = 'price';
        end if;
        if v_notes is not null and length(v_notes) > 200 then
          raise exception 'Notes: at most 200 characters.' using errcode = 'FPV01', detail = 'notes';
        end if;
        if exists (
          select 1
          from jsonb_array_elements(p_rows) with ordinality as e(v, n)
          where n - 1 < v_index
            and (e.v ->> 'itemId')::bigint = v_item_id
            and (e.v ->> 'unitId')::bigint = v_unit_id
        ) then
          raise exception 'This item appears twice in the batch.' using errcode = 'FPV01', detail = 'itemId';
        end if;

        -- Lock the existing row so concurrent saves serialize instead of losing updates
        select * into v_existing
        from public.item_prices
        where item_id = v_item_id and price_date = p_date and unit_id = v_unit_id
        for update;

        if found then
          if v_version is not null and v_version <> v_existing.version then
            raise exception 'Changed by someone else (now %). Reload and try again.', v_existing.price
              using errcode = 'FPV01', detail = 'price';
          end if;
          if v_existing.price = v_price and v_existing.notes is not distinct from v_notes then
            v_unchanged := v_unchanged + 1;
            v_results := v_results || jsonb_build_object('index', v_index, 'itemId', v_item_id, 'id', v_existing.id, 'status', 'unchanged');
          else
            update public.item_prices set price = v_price, notes = v_notes where id = v_existing.id;
            v_updated := v_updated + 1;
            v_results := v_results || jsonb_build_object('index', v_index, 'itemId', v_item_id, 'id', v_existing.id, 'status', 'updated');
          end if;
        else
          insert into public.item_prices (item_id, price_date, unit_id, price, notes)
          values (v_item_id, p_date, v_unit_id, v_price, v_notes)
          returning id into v_id;
          v_created := v_created + 1;
          v_results := v_results || jsonb_build_object('index', v_index, 'itemId', v_item_id, 'id', v_id, 'status', 'created');
        end if;

      exception
        when sqlstate 'FPV01' then
          get stacked diagnostics v_msg = message_text, v_field = pg_exception_detail;
          v_failed := v_failed + 1;
          v_results := v_results || jsonb_build_object(
            'index', v_index, 'itemId', v_item_id, 'status', 'error',
            'errors', jsonb_build_object(coalesce(nullif(v_field, ''), 'price'), jsonb_build_array(v_msg)));
        when unique_violation then
          v_failed := v_failed + 1;
          v_results := v_results || jsonb_build_object(
            'index', v_index, 'itemId', v_item_id, 'status', 'error',
            'errors', jsonb_build_object('price', jsonb_build_array('Another user just saved this price. Reload and try again.')));
        when invalid_text_representation or numeric_value_out_of_range then
          v_failed := v_failed + 1;
          v_results := v_results || jsonb_build_object(
            'index', v_index, 'itemId', v_item_id, 'status', 'error',
            'errors', jsonb_build_object('price', jsonb_build_array('Invalid value.')));
      end;
    end loop;

    if p_atomic and v_failed > 0 then
      raise exception 'batch rolled back' using errcode = 'FPRB1';
    end if;
  exception
    when sqlstate 'FPRB1' then
      -- Everything written inside this block is undone; report the good rows as skipped.
      v_rolled_back := true;
  end;

  if v_rolled_back then
    select coalesce(jsonb_agg(
             case when e ->> 'status' = 'error' then e else (e - 'id') || jsonb_build_object('status', 'skipped') end
             order by (e ->> 'index')::int), '[]'::jsonb)
      into v_results
    from jsonb_array_elements(v_results) e;
    v_created := 0;
    v_updated := 0;
    v_unchanged := 0;
  end if;

  return jsonb_build_object(
    'results', v_results,
    'rolledBack', v_rolled_back,
    'summary', jsonb_build_object(
      'created', v_created, 'updated', v_updated, 'unchanged', v_unchanged, 'failed', v_failed));
end;
$$;

revoke execute on function public.latest_prices_before(date) from public, anon;
revoke execute on function public.upsert_prices(date, jsonb, boolean) from public, anon;
grant execute on function public.latest_prices_before(date) to authenticated;
grant execute on function public.upsert_prices(date, jsonb, boolean) to authenticated;


-- ===== 20260927000008_calculation_functions.sql =====
-- Calculation save / finalize / cancel. All state changes go through these
-- functions; the guard trigger blocks the same changes made any other way.

-- ---------------------------------------------------------------------------
-- Guard: finalize only via finalize path; cancel needs permission
-- ---------------------------------------------------------------------------
create or replace function public.calculations_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    if old.status <> 'draft' then
      raise exception 'Only draft calculations can be deleted' using errcode = '23514';
    end if;
    return old;
  end if;

  if old.status = 'cancelled' then
    raise exception 'Cancelled calculations cannot be changed' using errcode = '23514';
  end if;

  if new.reference_number <> old.reference_number or new.created_by <> old.created_by then
    raise exception 'Reference number and creator are immutable' using errcode = '23514';
  end if;

  if old.status = 'draft' and new.status = 'finalized'
     and coalesce(current_setting('app.finalizing', true), '') <> 'on' then
    raise exception 'Use finalize to finalize a calculation' using errcode = '23514';
  end if;

  if old.status = 'draft' and new.status = 'cancelled' then
    raise exception 'Delete a draft instead of cancelling it' using errcode = '23514';
  end if;

  if old.status = 'finalized' then
    if new.status <> 'cancelled'
       or new.subtotal <> old.subtotal or new.adjustment <> old.adjustment
       or new.grand_total <> old.grand_total or new.calculation_date <> old.calculation_date
       or new.notes is distinct from old.notes then
      raise exception 'Finalized calculations can only be cancelled' using errcode = '23514';
    end if;
    if not public.has_permission('calculations.cancel') then
      raise exception 'You do not have permission to cancel calculations.' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Share-lock one price row. SELECT ... FOR SHARE applies UPDATE policies under RLS,
-- which normal users (no prices.write) fail, so this narrow helper runs as owner.
-- It only locks and returns a row the caller can already read.
-- ---------------------------------------------------------------------------
create or replace function public.lock_price_row(p_id bigint)
returns setof public.item_prices
language sql
security definer
set search_path = ''
as $$
  select * from public.item_prices
  where id = p_id and public.has_permission('prices.read')
  for share;
$$;

-- ---------------------------------------------------------------------------
-- Internal: verify every line against the live price rows, recompute totals, finalize
-- ---------------------------------------------------------------------------
create or replace function public.finalize_calculation_internal(p_id bigint)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_calc public.calculations;
  v_line record;
  v_subtotal numeric := 0;
begin
  if not public.has_permission('calculations.finalize') then
    raise exception 'You do not have permission to finalize calculations.' using errcode = '42501';
  end if;

  select * into v_calc from public.calculations where id = p_id for update;
  if not found then
    raise exception 'Calculation not found.' using errcode = 'P0002';
  end if;
  if v_calc.status <> 'draft' then
    raise exception 'Only drafts can be finalized.' using errcode = 'FPC02';
  end if;
  if v_calc.created_by <> auth.uid() then
    raise exception 'Only the creator can finalize this calculation.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.calculation_items where calculation_id = p_id) then
    raise exception 'Add at least one item before finalizing.' using errcode = 'FPC02';
  end if;

  for v_line in
    select ci.line_no, ci.item_name_snapshot, ci.price, ci.amount, ci.normalized_quantity,
           ip.price as live_price, ip.item_id as live_item, ip.unit_id as live_unit, ip.price_date as live_date,
           ci.item_id, ci.price_unit_id
    from public.calculation_items ci
    left join public.item_prices ip on ip.id = ci.price_id
    where ci.calculation_id = p_id
    order by ci.line_no
  loop
    if v_line.live_price is null
       or v_line.live_item <> v_line.item_id
       or v_line.live_unit <> v_line.price_unit_id
       or v_line.live_date <> v_calc.calculation_date
       or v_line.live_price <> v_line.price then
      raise exception 'The price of % changed since this draft was saved. Open the draft and save it again.', v_line.item_name_snapshot
        using errcode = 'FPC01', detail = (v_line.line_no - 1)::text;
    end if;
    if abs(v_line.amount - v_line.normalized_quantity * v_line.price) > 0.01 then
      raise exception 'Line % has an inconsistent amount.', v_line.line_no using errcode = 'FPC01', detail = (v_line.line_no - 1)::text;
    end if;
    v_subtotal := v_subtotal + v_line.amount;
  end loop;

  if v_subtotal + v_calc.adjustment < 0 then
    raise exception 'Total cannot be negative.' using errcode = 'FPC02';
  end if;

  perform set_config('app.finalizing', 'on', true);
  update public.calculations
     set status = 'finalized',
         subtotal = v_subtotal,
         grand_total = v_subtotal + adjustment,
         finalized_at = now(),
         finalized_by = auth.uid()
   where id = p_id;
  perform set_config('app.finalizing', 'off', true);
end;
$$;

-- ---------------------------------------------------------------------------
-- Save (create or update a draft) + optional finalize, in one transaction.
-- Lines arrive already computed by the server's calculation engine; prices are
-- re-verified here under a share lock so a concurrent price edit can't slip in.
-- ---------------------------------------------------------------------------
create or replace function public.save_calculation(
  p_id bigint,
  p_version int,
  p_date date,
  p_notes text,
  p_adjustment numeric,
  p_lines jsonb,
  p_finalize boolean default false,
  p_idempotency_key uuid default null
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id bigint := p_id;
  v_existing public.calculations;
  v_line jsonb;
  v_index int := -1;
  v_price public.item_prices;
  v_subtotal numeric := 0;
  v_amount numeric;
  v_prefix text;
  v_padding int;
  v_ref text;
begin
  if not public.has_permission('calculations.write') then
    raise exception 'You do not have permission to create calculations.' using errcode = '42501';
  end if;
  if p_date is null then
    raise exception 'Date is required.' using errcode = 'FPC02';
  end if;
  if jsonb_typeof(p_lines) is distinct from 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'Add at least one item.' using errcode = 'FPC02';
  end if;
  if jsonb_array_length(p_lines) > 300 then
    raise exception 'At most 300 lines per calculation.' using errcode = 'FPC02';
  end if;

  -- Idempotent create: the same key returns the calculation made the first time
  if p_id is null and p_idempotency_key is not null then
    select id into v_id from public.calculations
    where idempotency_key = p_idempotency_key and created_by = auth.uid();
    if found then
      return jsonb_build_object('id', v_id, 'replayed', true);
    end if;
  end if;

  -- Verify every line against its price row (share lock blocks concurrent edits)
  for v_line in select value from jsonb_array_elements(p_lines) loop
    v_index := v_index + 1;
    select * into v_price from public.lock_price_row((v_line ->> 'priceId')::bigint);
    if not found
       or v_price.item_id <> (v_line ->> 'itemId')::bigint
       or v_price.unit_id <> (v_line ->> 'priceUnitId')::bigint
       or v_price.price_date <> p_date
       or v_price.price <> (v_line ->> 'price')::numeric then
      raise exception 'The price of % just changed. Review the new rate and save again.', v_line ->> 'itemName'
        using errcode = 'FPC01', detail = v_index::text;
    end if;
    v_amount := (v_line ->> 'amount')::numeric;
    if v_amount < 0 or abs(v_amount - (v_line ->> 'normalizedQuantity')::numeric * v_price.price) > 0.01 then
      raise exception 'Line % has an inconsistent amount.', v_index + 1 using errcode = 'FPC01', detail = v_index::text;
    end if;
    v_subtotal := v_subtotal + v_amount;
  end loop;

  if v_subtotal + coalesce(p_adjustment, 0) < 0 then
    raise exception 'Total cannot be negative.' using errcode = 'FPC02';
  end if;

  if p_id is null then
    select coalesce(value #>> '{}', 'CAL-') into v_prefix from public.app_settings where key = 'calculation.reference_prefix';
    select coalesce((value #>> '{}')::int, 6) into v_padding from public.app_settings where key = 'calculation.reference_padding';
    v_ref := coalesce(v_prefix, 'CAL-') || lpad(nextval('public.calculation_ref_seq')::text, coalesce(v_padding, 6), '0');

    insert into public.calculations (reference_number, calculation_date, subtotal, adjustment, grand_total, notes, idempotency_key)
    values (v_ref, p_date, v_subtotal, coalesce(p_adjustment, 0), v_subtotal + coalesce(p_adjustment, 0),
            nullif(btrim(p_notes), ''), p_idempotency_key)
    returning id into v_id;
  else
    select * into v_existing from public.calculations where id = p_id for update;
    if not found then
      raise exception 'Calculation not found.' using errcode = 'P0002';
    end if;
    if v_existing.status <> 'draft' then
      raise exception 'Only drafts can be edited.' using errcode = 'FPC02';
    end if;
    if v_existing.created_by <> auth.uid() then
      raise exception 'Only the creator can edit this draft.' using errcode = '42501';
    end if;
    if p_version is null or v_existing.version <> p_version then
      raise exception 'Someone else changed this calculation. Reload it and try again.' using errcode = 'FPC03';
    end if;

    update public.calculations
       set calculation_date = p_date,
           subtotal = v_subtotal,
           adjustment = coalesce(p_adjustment, 0),
           grand_total = v_subtotal + coalesce(p_adjustment, 0),
           notes = nullif(btrim(p_notes), '')
     where id = p_id;
    delete from public.calculation_items where calculation_id = p_id;
  end if;

  insert into public.calculation_items (
    calculation_id, line_no, item_id, item_name_snapshot, category_name_snapshot,
    quantity, unit_id, unit_symbol_snapshot, normalized_quantity,
    price, price_unit_id, price_unit_symbol_snapshot, price_id, amount)
  select v_id, e.n::int,
         (e.v ->> 'itemId')::bigint, e.v ->> 'itemName', e.v ->> 'categoryName',
         (e.v ->> 'quantity')::numeric, (e.v ->> 'unitId')::bigint, e.v ->> 'unitSymbol',
         (e.v ->> 'normalizedQuantity')::numeric,
         (e.v ->> 'price')::numeric, (e.v ->> 'priceUnitId')::bigint, e.v ->> 'priceUnitSymbol',
         (e.v ->> 'priceId')::bigint, (e.v ->> 'amount')::numeric
  from jsonb_array_elements(p_lines) with ordinality as e(v, n);

  if p_finalize then
    perform public.finalize_calculation_internal(v_id);
  end if;

  return jsonb_build_object('id', v_id, 'replayed', false);
end;
$$;

create or replace function public.finalize_calculation(p_id bigint, p_version int)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not exists (select 1 from public.calculations where id = p_id and version = p_version) then
    if exists (select 1 from public.calculations where id = p_id) then
      raise exception 'Someone else changed this calculation. Reload it and try again.' using errcode = 'FPC03';
    end if;
    raise exception 'Calculation not found.' using errcode = 'P0002';
  end if;
  perform public.finalize_calculation_internal(p_id);
end;
$$;

create or replace function public.cancel_calculation(p_id bigint, p_version int, p_reason text)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_calc public.calculations;
begin
  if not public.has_permission('calculations.cancel') then
    raise exception 'You do not have permission to cancel calculations.' using errcode = '42501';
  end if;
  if p_reason is null or length(btrim(p_reason)) < 3 then
    raise exception 'Give a reason for cancelling.' using errcode = 'FPC02';
  end if;
  select * into v_calc from public.calculations where id = p_id for update;
  if not found then
    raise exception 'Calculation not found.' using errcode = 'P0002';
  end if;
  if v_calc.version <> p_version then
    raise exception 'Someone else changed this calculation. Reload it and try again.' using errcode = 'FPC03';
  end if;
  if v_calc.status <> 'finalized' then
    raise exception 'Only finalized calculations can be cancelled.' using errcode = 'FPC02';
  end if;
  update public.calculations
     set status = 'cancelled', cancelled_at = now(), cancelled_by = auth.uid(), cancel_reason = btrim(p_reason)
   where id = p_id;
end;
$$;

revoke execute on function public.lock_price_row(bigint) from public, anon;
grant execute on function public.lock_price_row(bigint) to authenticated;
revoke execute on function public.finalize_calculation_internal(bigint) from public, anon, authenticated;
grant execute on function public.finalize_calculation_internal(bigint) to authenticated;
revoke execute on function public.save_calculation(bigint, int, date, text, numeric, jsonb, boolean, uuid) from public, anon;
revoke execute on function public.finalize_calculation(bigint, int) from public, anon;
revoke execute on function public.cancel_calculation(bigint, int, text) from public, anon;
grant execute on function public.save_calculation(bigint, int, date, text, numeric, jsonb, boolean, uuid) to authenticated;
grant execute on function public.finalize_calculation(bigint, int) to authenticated;
grant execute on function public.cancel_calculation(bigint, int, text) to authenticated;
revoke execute on function public.calculations_guard() from public, anon, authenticated;


-- ===== 20260927000009_reports.sql =====
-- Dashboard + report queries. SECURITY INVOKER: RLS applies, so users who
-- can only see their own calculations get figures for their own work.
-- All figures come from finalized calculations and their saved snapshots.

create or replace function public.dashboard_stats(p_date date)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with c as (
    select id, calculation_date, status, grand_total
    from public.calculations
    where calculation_date between least(date_trunc('month', p_date)::date, p_date - 6) and p_date
      and status <> 'cancelled'
  ),
  fin as (select * from c where status = 'finalized')
  select jsonb_build_object(
    'date', p_date,
    'todayTotal', coalesce((select sum(grand_total) from fin where calculation_date = p_date), 0),
    'todayCalculations', (select count(*) from fin where calculation_date = p_date),
    'todayDrafts', (select count(*) from c where calculation_date = p_date and status = 'draft'),
    'todayLines', (
      select count(*) from public.calculation_items ci
      join fin on fin.id = ci.calculation_id
      where fin.calculation_date = p_date),
    'yesterdayTotal', coalesce((select sum(grand_total) from fin where calculation_date = p_date - 1), 0),
    'weekTotal', coalesce((select sum(grand_total) from fin where calculation_date > p_date - 7), 0),
    'monthTotal', coalesce((select sum(grand_total) from fin where calculation_date >= date_trunc('month', p_date)::date), 0),
    'pricesSet', (select count(*) from public.item_prices where price_date = p_date),
    'activeItems', (select count(*) from public.items where active and deleted_at is null),
    'missingPrices', (
      select count(*) from public.items i
      where i.active and i.deleted_at is null
        and not exists (
          select 1 from public.item_prices p
          where p.item_id = i.id and p.price_date = p_date and p.unit_id = i.pricing_unit_id))
  );
$$;

create or replace function public.check_report_range(p_from date, p_to date)
returns void
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_from is null or p_to is null or p_to < p_from then
    raise exception 'Choose a valid date range.' using errcode = 'FPC02';
  end if;
  if p_to - p_from > 366 then
    raise exception 'The date range can be at most one year.' using errcode = 'FPC02';
  end if;
end;
$$;

-- Per item (and pricing unit): total quantity in the pricing unit, amount, average rate.
-- Names come from the snapshots of the most recent line, so renamed items stay readable.
create or replace function public.report_item_summary(p_from date, p_to date)
returns table (
  item_id bigint,
  item_name text,
  category_name text,
  unit_symbol text,
  quantity numeric,
  amount numeric,
  avg_rate numeric,
  lines bigint,
  calculations bigint
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  perform public.check_report_range(p_from, p_to);
  return query
  select ci.item_id,
         (array_agg(ci.item_name_snapshot order by c.calculation_date desc, ci.id desc))[1],
         (array_agg(ci.category_name_snapshot order by c.calculation_date desc, ci.id desc))[1],
         (array_agg(ci.price_unit_symbol_snapshot order by c.calculation_date desc, ci.id desc))[1],
         sum(ci.normalized_quantity),
         sum(ci.amount),
         case when sum(ci.normalized_quantity) > 0 then round(sum(ci.amount) / sum(ci.normalized_quantity), 2) end,
         count(*),
         count(distinct c.id)
  from public.calculation_items ci
  join public.calculations c on c.id = ci.calculation_id
  where c.status = 'finalized'
    and c.calculation_date between p_from and p_to
  group by ci.item_id, ci.price_unit_id
  order by sum(ci.amount) desc, 2;
end;
$$;

-- One row per day in the range (days without calculations show zero).
create or replace function public.report_daily_totals(p_from date, p_to date)
returns table (day date, calculations bigint, lines bigint, total numeric)
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  perform public.check_report_range(p_from, p_to);
  return query
  with per_calc as (
    select c.calculation_date, c.grand_total,
           (select count(*) from public.calculation_items ci where ci.calculation_id = c.id) as line_count
    from public.calculations c
    where c.status = 'finalized' and c.calculation_date between p_from and p_to
  ),
  per_day as (
    select calculation_date, count(*) as calcs, sum(line_count)::bigint as line_total, sum(grand_total) as amount
    from per_calc
    group by calculation_date
  )
  select g.d::date, coalesce(p.calcs, 0), coalesce(p.line_total, 0), coalesce(p.amount, 0)
  from generate_series(p_from, p_to, interval '1 day') as g(d)
  left join per_day p on p.calculation_date = g.d::date
  order by 1 desc;
end;
$$;

revoke execute on function public.dashboard_stats(date) from public, anon;
revoke execute on function public.check_report_range(date, date) from public, anon;
revoke execute on function public.report_item_summary(date, date) from public, anon;
revoke execute on function public.report_daily_totals(date, date) from public, anon;
grant execute on function public.dashboard_stats(date) to authenticated;
grant execute on function public.check_report_range(date, date) to authenticated;
grant execute on function public.report_item_summary(date, date) to authenticated;
grant execute on function public.report_daily_totals(date, date) to authenticated;


-- ===== 20260927000010_user_admin.sql =====
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


commit;
