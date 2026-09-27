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
