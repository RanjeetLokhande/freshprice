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
