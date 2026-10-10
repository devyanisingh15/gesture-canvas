-- Checks create_game and join_game. Run against a throwaway local Postgres, never a real project,
-- after local_supabase_stub.sql and every migration:
--   psql -d gc_test -q -t -A -f supabase/tests/game_functions_test.sql
-- Every line should start with PASS. Runs in a transaction that is rolled back.
\set ON_ERROR_STOP 1
begin;

create function pg_temp.expect_code(stmt text, want text, label text) returns text language plpgsql as $$
begin
  execute stmt;
  return 'FAIL  ' || label || ' (statement succeeded)';
exception when others then
  return case when sqlstate = want then 'PASS  ' else 'FAIL  ' end || label || '  [' || sqlstate || ' ' || left(sqlerrm, 60) || ']';
end $$;
create function pg_temp.expect_eq(got text, want text, label text) returns text language sql as $$
  select case when got is not distinct from want then 'PASS  ' else 'FAIL  ' end || label || '  (got ' || coalesce(got, 'null') || ')'
$$;
grant execute on all functions in schema pg_temp to anon, authenticated;

insert into auth.users
select ('00000000-0000-0000-0000-0000000000' || lpad(n::text, 2, '0'))::uuid from generate_series(10, 19) n;
create temp table t (k text primary key, v text);
grant all on t to authenticated;

-- Host creates a game.
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000010', true) \g /dev/null
insert into t select 'code', room_code from public.create_game('Maya', 5);
select pg_temp.expect_eq(((select v from t where k = 'code') ~ '^[A-HJ-NP-Z2-9]{6}$')::text, 'true', 'create_game returns a valid code');

-- Ben joins with a messy code.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000011', true) \g /dev/null
insert into t select 'ben', player_id::text from public.join_game('  ' || lower((select v from t where k = 'code')) || ' ', 'Ben');
select pg_temp.expect_eq((select count(*)::text from public.players), '2', 'Ben joins (lower-case, padded code) and sees 2 players');
select pg_temp.expect_eq((select is_host::text from public.players where id = (select v from t where k = 'ben')::uuid), 'false', 'Ben is not host');
select pg_temp.expect_eq((select player_id::text from public.join_game((select v from t where k = 'code'), 'Benjamin')), (select v from t where k = 'ben'), 'joining again returns the same seat');
select pg_temp.expect_eq((select count(*)::text from public.players), '2', 'no second seat for Ben');

-- Errors, as Cat.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000012', true) \g /dev/null
select pg_temp.expect_code($$select * from public.join_game('ABC', 'Cat')$$, '22023', 'short code rejected');
select pg_temp.expect_code($$select * from public.join_game('ABCDE0', 'Cat')$$, '22023', 'code with 0 rejected');
select pg_temp.expect_code($$select * from public.join_game('ZZZZZZ', 'Cat')$$, 'GC001', 'unknown code is not found');
select pg_temp.expect_code(format($$select * from public.join_game(%L, 'maya')$$, (select v from t where k = 'code')), 'GC004', 'name taken (case-insensitive)');
select pg_temp.expect_code(format($$select * from public.join_game(%L, '   ')$$, (select v from t where k = 'code')), '22023', 'blank name rejected');
select pg_temp.expect_eq((select count(*)::text from public.games), '0', 'Cat still cannot read the game');

-- Fill the room to 6, then a 7th is refused.
do $$
declare i int;
begin
  for i in 13..16 loop
    perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000' || i, true);
    perform public.join_game((select v from t where k = 'code'), 'P' || i);
  end loop;
end $$;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000017', true) \g /dev/null
select pg_temp.expect_code(format($$select * from public.join_game(%L, 'Seven')$$, (select v from t where k = 'code')), 'GC003', 'seventh player: game is full');

-- A started game.
reset role;
update public.games set status = 'STARTING';
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000018', true) \g /dev/null
select pg_temp.expect_code(format($$select * from public.join_game(%L, 'Late')$$, (select v from t where k = 'code')), 'GC002', 'game already started');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000011', true) \g /dev/null
select pg_temp.expect_eq((select player_id::text from public.join_game((select v from t where k = 'code'), 'Ben')), (select v from t where k = 'ben'), 'an existing player can still get their seat back after start');

-- Signed out.
select set_config('request.jwt.claim.sub', '', true) \g /dev/null
select pg_temp.expect_code(format($$select * from public.join_game(%L, 'Nobody')$$, (select v from t where k = 'code')), '28000', 'signed-out call refused');
reset role;
set local role anon;
select pg_temp.expect_code($$select * from public.join_game('ABCDEF', 'Anon')$$, '42501', 'anon role cannot call join_game');

rollback;
