-- Catalog audit of what signed-out (anon) and signed-in (authenticated) roles can do.
-- Run against a throwaway local Postgres with every migration applied, never a real project:
--   psql -d gc_test -q -t -A -f supabase/tests/security_audit_test.sql
-- Every line should start with PASS.
\set ON_ERROR_STOP 1

create or replace function pg_temp.expect_none(stmt text, label text) returns text language plpgsql as $$
declare found text;
begin
  execute 'select string_agg(x::text, '', '') from (' || stmt || ') q(x)' into found;
  return case when found is null then 'PASS  ' || label else 'FAIL  ' || label || '  [' || found || ']' end;
end $$;

-- Every table the Data API exposes has RLS on.
select pg_temp.expect_none($$
  select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity$$,
  'RLS is enabled on every public table');

-- Signed-out visitors get no table access at all.
select pg_temp.expect_none($$
  select table_name || ':' || privilege_type from information_schema.role_table_grants
   where grantee = 'anon' and table_schema = 'public'$$,
  'anon has no table privileges');
select pg_temp.expect_none($$
  select table_name || '.' || column_name || ':' || privilege_type from information_schema.column_privileges
   where grantee = 'anon' and table_schema = 'public'$$,
  'anon has no column privileges');

-- Players can never write games, rounds, drawings or scores directly; those
-- change only through the game functions and the server.
select pg_temp.expect_none($$
  select table_name || ':' || privilege_type from information_schema.role_table_grants
   where grantee = 'authenticated' and table_schema = 'public'
     and table_name in ('games', 'rounds', 'drawings', 'scores') and privilege_type <> 'SELECT'$$,
  'authenticated cannot insert, update or delete games, rounds, drawings or scores');
select pg_temp.expect_none($$
  select table_name || '.' || column_name || ':' || privilege_type from information_schema.column_privileges
   where grantee = 'authenticated' and table_schema = 'public'
     and table_name in ('games', 'rounds', 'drawings', 'scores') and privilege_type <> 'SELECT'$$,
  'authenticated has no write column grants on games, rounds, drawings or scores');

-- On players: join (game and name only) and the heartbeat column only.
select pg_temp.expect_none($$
  select column_name || ':' || privilege_type from information_schema.column_privileges
   where grantee = 'authenticated' and table_schema = 'public' and table_name = 'players'
     and privilege_type <> 'SELECT'
     and (column_name, privilege_type) not in (('game_id', 'INSERT'), ('display_name', 'INSERT'), ('last_seen_at', 'UPDATE'))$$,
  'authenticated writes on players are limited to joining and the heartbeat');
select pg_temp.expect_none($$
  select column_name from information_schema.column_privileges
   where grantee = 'authenticated' and table_schema = 'public' and table_name = 'players'
     and column_name = 'user_id' and privilege_type = 'SELECT'$$,
  'players.user_id is not readable');

-- anon can run nothing in public or private.
select pg_temp.expect_none($$
  select n.nspname || '.' || p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname in ('public', 'private') and has_function_privilege('anon', p.oid, 'execute')$$,
  'anon can execute no public or private function');

-- What signed-in players can call is an explicit list.
select pg_temp.expect_none($$
  select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and has_function_privilege('authenticated', p.oid, 'execute')
     and p.proname not in ('advance_game', 'create_game', 'find_open_lobby', 'get_game_state', 'get_standings',
                           'host_advance', 'join_game', 'leave_game', 'request_evaluation', 'start_game',
                           'submit_drawing', 'touch_seat')$$,
  'authenticated can execute only the game API in public');

-- Score writing and the evaluation batch belong to the server alone.
select pg_temp.expect_none($$
  select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname in ('public', 'private')
     and p.proname in ('record_scores', 'evaluation_batch', 'end_round', 'next_round', 'start_round',
                       'enter_phase', 'step', 'lock_for_change', 'submit_grace_ms', 'validated_drawing')
     and has_function_privilege('authenticated', p.oid, 'execute')$$,
  'authenticated cannot run score writing, evaluation batches or phase changes');

-- Every SECURITY DEFINER function pins its search_path.
select pg_temp.expect_none($$
  select n.nspname || '.' || p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname in ('public', 'private') and p.prosecdef
     and not exists (select 1 from unnest(p.proconfig) c where c like 'search_path=%')$$,
  'every SECURITY DEFINER function sets search_path');

-- Internal bookkeeping tables are not reachable by players.
select pg_temp.expect_none($$
  select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'private' and c.relkind = 'r'
     and (has_table_privilege('anon', c.oid, 'select') or has_table_privilege('authenticated', c.oid, 'select'))$$,
  'private tables are not readable by players');

-- Realtime topics are gated by RLS.
select pg_temp.expect_none($$
  select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'realtime' and c.relname = 'messages' and not c.relrowsecurity$$,
  'RLS is enabled on realtime.messages');
