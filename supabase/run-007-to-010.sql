-- Fresh Price: migrations 007-010 (price functions, calculations, reports, user admin).
-- For a project that already ran setup through 006. Paste into SQL Editor and Run ONCE.
-- One transaction: if anything fails, nothing changes.

begin;

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
