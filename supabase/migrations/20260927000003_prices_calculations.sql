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
