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
