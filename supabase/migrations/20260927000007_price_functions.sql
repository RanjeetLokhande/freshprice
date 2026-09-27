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
