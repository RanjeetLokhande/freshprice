-- Trigger functions are never called directly; keep them off the RPC API.
revoke execute on function public.audit_row() from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.item_prices_record_revision() from public, anon, authenticated;
revoke execute on function public.touch_row() from public, anon, authenticated;
revoke execute on function public.units_validate() from public, anon, authenticated;
revoke execute on function public.item_prices_before_update() from public, anon, authenticated;
revoke execute on function public.calculations_guard() from public, anon, authenticated;
revoke execute on function public.calculation_items_guard() from public, anon, authenticated;
