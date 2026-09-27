-- Explicit API grants (newer projects may not auto-grant new tables).
-- Row Level Security still decides which rows each user can read or write.
grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;
revoke all on all tables in schema public from anon;
