-- Checks the prompt wheel's server side: the database picks each round's prompt
-- from the controlled pool, stores it in public.rounds, and every player reads
-- the same one; a failed write leaves nothing half done; duplicate calls change
-- nothing. Run against a throwaway local Postgres, never a real project, after
-- local_supabase_stub.sql and every migration:
--   psql -d gc_test -q -t -A -f supabase/tests/wheel_test.sql
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
create function pg_temp.as_user(p_user text) returns void language sql as $$
  select set_config('request.jwt.claim.sub', p_user, true) $$;

insert into auth.users values ('00000000-0000-0000-0000-000000000040'), ('00000000-0000-0000-0000-000000000041'), ('00000000-0000-0000-0000-000000000042');
create temp table t (k text primary key, v text);
grant all on t to authenticated;
create function pg_temp.gid() returns uuid language sql as $$ select v::uuid from t where k = 'game' $$;
-- Makes the current phase due now, as if its time had passed (test-only; runs as the test's superuser).
create function pg_temp.expire() returns void language sql security definer as $$
  update public.games set phase_ends_at = now() - interval '1 second', phase_started_at = now() - interval '1 hour'
   where id = pg_temp.gid() $$;
create function pg_temp.state() returns text language sql as $$
  select g.status || ' r' || g.current_round || ' v' || g.state_version from public.games g where g.id = pg_temp.gid() $$;
create function pg_temp.ver() returns integer language sql as $$
  select g.state_version from public.games g where g.id = pg_temp.gid() $$;
create function pg_temp.adv() returns text language sql as $$
  select a.advanced::text from public.advance_game(pg_temp.gid(), pg_temp.ver()) a $$;
-- The prompt of the current round, as this player reads it through get_game_state.
create function pg_temp.seen_prompt() returns text language sql as $$
  select r ->> 'prompt'
    from jsonb_array_elements(public.get_game_state(pg_temp.gid()) -> 'rounds') r
   where (r ->> 'round_number')::int = (public.get_game_state(pg_temp.gid()) -> 'game' ->> 'current_round')::int $$;
-- Plays the game to the end on timers alone; returns how many steps it took.
create function pg_temp.play_out() returns integer language plpgsql as $$
declare n integer := 0;
begin
  while (select status from public.games where id = pg_temp.gid()) <> 'FINAL_RESULTS' and n < 100 loop
    perform pg_temp.expire();
    perform public.advance_game(pg_temp.gid(), pg_temp.ver());
    n := n + 1;
  end loop;
  return n;
end $$;
grant execute on all functions in schema pg_temp to authenticated;

-- Test-only fault: the next round can't be written, as if the database failed mid-request.
create function public.wheel_test_fault() returns trigger language plpgsql as $$
begin
  raise exception 'injected failure writing the round';
end $$;
create trigger wheel_test_fault before insert on public.rounds for each row execute function public.wheel_test_fault();

-- Host Ana (40) and Ben (41), ten rounds: one per prompt.
set local role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-000000000040') \g /dev/null
insert into t select 'game', game_id::text from public.create_game('Ana', 10);
insert into t select 'code', room_code from public.games where id = pg_temp.gid();
select pg_temp.as_user('00000000-0000-0000-0000-000000000041') \g /dev/null
select public.join_game((select v from t where k = 'code'), 'Ben') \g /dev/null
select pg_temp.as_user('00000000-0000-0000-0000-000000000040') \g /dev/null
select public.start_game(pg_temp.gid()) \g /dev/null
select pg_temp.expect_eq(pg_temp.state(), 'STARTING r0 v1', 'host starts: STARTING, no prompt yet');
select pg_temp.expect_eq((select count(*)::text from public.rounds where game_id = pg_temp.gid()), '0', 'no round before the wheel');

-- Duplicate start: the second press changes nothing.
select pg_temp.expect_code($$select public.start_game(pg_temp.gid())$$, 'GC002', 'a second Start is refused');
select pg_temp.expect_eq(pg_temp.state(), 'STARTING r0 v1', 'still STARTING, version unchanged');

-- A failed database request leaves the game exactly as it was.
select pg_temp.expire() \g /dev/null
select pg_temp.expect_code($$select pg_temp.adv()$$, 'P0001', 'the round write fails: the call errors');
select pg_temp.expect_eq(pg_temp.state(), 'STARTING r0 v1', 'after the failure: still STARTING, round 0, same version');
select pg_temp.expect_eq((select count(*)::text from public.rounds where game_id = pg_temp.gid()), '0', 'after the failure: no half-written round');

-- The fault clears; the next call (a client retrying) succeeds.
reset role;
drop trigger wheel_test_fault on public.rounds;
set local role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-000000000041') \g /dev/null
select pg_temp.expect_eq(pg_temp.adv(), 'true', 'a retry after the failure goes through');
select pg_temp.expect_eq(pg_temp.state(), 'WHEEL_SPINNING r1 v2', 'WHEEL_SPINNING, round 1');
select pg_temp.expect_eq(
  (select (prompt = any (array['house', 'tree', 'sun', 'car', 'fish', 'cat', 'rocket', 'flower', 'guitar', 'airplane']))::text
     from public.rounds where game_id = pg_temp.gid() and round_number = 1),
  'true', 'round 1 has a prompt from the pool, stored in rounds');
select pg_temp.expect_eq(
  (select (r.status = 'SPINNING' and r.started_at = g.phase_started_at)::text
     from public.rounds r join public.games g on g.id = r.game_id where g.id = pg_temp.gid() and r.round_number = 1),
  'true', 'the round is SPINNING and starts with the wheel phase');
select pg_temp.expect_eq((select (phase_ends_at - phase_started_at)::text from public.games where id = pg_temp.gid()), '00:00:06', 'the wheel phase lasts 6 s');
insert into t select 'p1', prompt from public.rounds where game_id = pg_temp.gid() and round_number = 1;

-- Every player reads the same prompt, during the spin.
select pg_temp.expect_eq(pg_temp.seen_prompt(), (select v from t where k = 'p1'), 'Ben reads the stored prompt');
select pg_temp.as_user('00000000-0000-0000-0000-000000000040') \g /dev/null
select pg_temp.expect_eq(pg_temp.seen_prompt(), (select v from t where k = 'p1'), 'Ana (host) reads the same prompt');
select pg_temp.as_user('00000000-0000-0000-0000-000000000042') \g /dev/null
select pg_temp.expect_eq(pg_temp.seen_prompt(), null, 'someone outside the game reads nothing');
select pg_temp.expect_eq(
  (select count(*)::text from public.rounds where game_id = pg_temp.gid()), '0', 'outsiders cannot read the rounds table either');

-- Duplicate or late calls during the spin change nothing.
select pg_temp.as_user('00000000-0000-0000-0000-000000000041') \g /dev/null
select pg_temp.expect_eq((select a.advanced::text from public.advance_game(pg_temp.gid(), 1) a), 'false', 'a stale retry (old version) is a no-op');
select pg_temp.expect_eq(pg_temp.adv(), 'false', 'advancing before the spin ends is refused');
select pg_temp.expect_code($$select public.host_advance(pg_temp.gid(), pg_temp.ver())$$, 'GC006', 'a guest cannot skip the wheel');
select pg_temp.as_user('00000000-0000-0000-0000-000000000040') \g /dev/null
select pg_temp.expect_code($$select public.host_advance(pg_temp.gid(), pg_temp.ver())$$, 'GC008', 'nor can the host');
select pg_temp.expect_eq(
  (select count(*)::text || ' ' || min(prompt) from public.rounds where game_id = pg_temp.gid()),
  '1 ' || (select v from t where k = 'p1'), 'still one round, same prompt');
select pg_temp.expect_code($$update public.rounds set prompt = 'cat'$$, '42501', 'a player cannot change the prompt');
select pg_temp.expect_code(
  $$insert into public.rounds (game_id, round_number, prompt) values (pg_temp.gid(), 2, 'cat')$$, '42501', 'a player cannot add a round');

-- Spin over: the prompt is revealed, unchanged.
select pg_temp.expire() \g /dev/null
select pg_temp.expect_eq(pg_temp.adv(), 'true', 'the spin ends');
select pg_temp.expect_eq(pg_temp.state(), 'TARGET_REVEALED r1 v3', 'TARGET_REVEALED');
select pg_temp.expect_eq(
  (select status || ' ' || prompt from public.rounds where game_id = pg_temp.gid() and round_number = 1),
  'REVEALED ' || (select v from t where k = 'p1'), 'round 1 REVEALED with the same prompt');
select pg_temp.expect_eq(pg_temp.seen_prompt(), (select v from t where k = 'p1'), 'players read the same prompt after the reveal');

-- Ten rounds use all ten prompts, none twice.
select pg_temp.play_out() \g /dev/null
select pg_temp.expect_eq(pg_temp.state(), 'FINAL_RESULTS r10 v' || pg_temp.ver(), 'ten rounds played');
select pg_temp.expect_eq(
  (select count(distinct prompt)::text || '/' || count(*) from public.rounds where game_id = pg_temp.gid()),
  '10/10', 'ten rounds, ten different prompts');

rollback;
