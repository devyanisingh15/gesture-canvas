-- Checks the game state machine: every transition, timing, host-only actions,
-- version checks and the transition trigger. Run against a throwaway local
-- Postgres, never a real project, after local_supabase_stub.sql and every migration:
--   psql -d gc_test -q -t -A -f supabase/tests/state_machine_test.sql
-- Every line should start with PASS. Runs in a transaction that is rolled back.
-- (Concurrent callers are tested separately by supabase/tests/race_test.sh.)
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
grant execute on all functions in schema pg_temp to anon, authenticated;

insert into auth.users values ('00000000-0000-0000-0000-000000000030'), ('00000000-0000-0000-0000-000000000031'), ('00000000-0000-0000-0000-000000000032');
create temp table t (k text primary key, v text);
grant all on t to authenticated;
-- Make the current phase due now, as if its time had passed (test-only, as superuser).
create function pg_temp.expire() returns void language sql as $$
  update public.games set phase_ends_at = now() - interval '1 second', phase_started_at = now() - interval '1 hour'
   where id = (select v from t where k = 'game')::uuid $$;
create function pg_temp.state() returns text language sql as $$
  select g.status || ' r' || g.current_round || ' v' || g.state_version from public.games g where g.id = (select v from t where k = 'game')::uuid $$;
create function pg_temp.ver() returns integer language sql as $$
  select g.state_version from public.games g where g.id = (select v from t where k = 'game')::uuid $$;
create function pg_temp.adv() returns text language sql as $$
  select a.advanced::text from public.advance_game((select v from t where k = 'game')::uuid, pg_temp.ver()) a $$;
grant execute on all functions in schema pg_temp to authenticated;

-- Host Maya (30) and Ben (31), two rounds. Cat (32) is not in the game.
set local role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-000000000030') \g /dev/null
insert into t select 'game', game_id::text from public.create_game('Maya', 2);
insert into t select 'code', room_code from public.games;
select pg_temp.as_user('00000000-0000-0000-0000-000000000031') \g /dev/null
select public.join_game((select v from t where k = 'code'), 'Ben') \g /dev/null
select pg_temp.expect_eq(pg_temp.state(), 'LOBBY r0 v0', 'new game: LOBBY, round 0, version 0');
select pg_temp.expect_eq(pg_temp.adv(), 'false', 'nothing to advance in the lobby');

-- Start
select pg_temp.as_user('00000000-0000-0000-0000-000000000030') \g /dev/null
select public.start_game((select v from t where k = 'game')::uuid) \g /dev/null
select pg_temp.expect_eq(pg_temp.state(), 'STARTING r0 v1', 'host starts: STARTING');
select pg_temp.expect_eq((select (phase_ends_at - phase_started_at)::text from public.games), '00:00:03', 'STARTING lasts 3 s');
select pg_temp.expect_eq(pg_temp.adv(), 'false', 'advancing early is refused');
select pg_temp.expect_eq(pg_temp.state(), 'STARTING r0 v1', 'still STARTING');

-- Players can't write the state themselves.
select pg_temp.expect_code($$update public.games set status = 'DRAWING'$$, '42501', 'players cannot set status');
select pg_temp.expect_code($$update public.games set current_round = 2$$, '42501', 'players cannot set the round');
select pg_temp.expect_code($$update public.rounds set prompt = 'cat'$$, '42501', 'players cannot change a prompt');
select pg_temp.expect_code($$select private.step(g) from public.games g$$, '42501', 'players cannot call internal steps');

-- Round 1
reset role; select pg_temp.expire(); set local role authenticated;
select pg_temp.expect_eq(pg_temp.adv(), 'true', 'STARTING due: advances');
select pg_temp.expect_eq(pg_temp.state(), 'WHEEL_SPINNING r1 v2', 'round 1 starts with the wheel');
select pg_temp.expect_eq((select count(*)::text from public.rounds where status = 'SPINNING' and round_number = 1), '1', 'round 1 row created');
insert into t select 'p1', prompt from public.rounds where round_number = 1;
select pg_temp.expect_eq((select (phase_ends_at - phase_started_at)::text from public.games), '00:00:06', 'wheel lasts 6 s');

reset role; select pg_temp.expire(); set local role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-000000000031') \g /dev/null
select pg_temp.expect_eq(pg_temp.adv(), 'true', 'a guest can advance a due phase too');
select pg_temp.expect_eq(pg_temp.state() || ' ' || (select status from public.rounds where round_number = 1), 'TARGET_REVEALED r1 v3 REVEALED', 'target revealed');

reset role; select pg_temp.expire(); set local role authenticated;
select pg_temp.adv() \g /dev/null
select pg_temp.expect_eq(pg_temp.state(), 'DRAWING r1 v4', 'drawing');
select pg_temp.expect_eq((select (ends_at = g.phase_ends_at and g.phase_ends_at - g.phase_started_at = (g.draw_seconds * interval '1 second'))::text
                            from public.rounds r join public.games g on g.id = r.game_id where r.round_number = 1), 'true', 'round end time = drawing deadline, the game''s drawing time');
select pg_temp.expect_code(format('select * from public.host_advance(%L, %s)', (select v from t where k = 'game'), pg_temp.ver()), 'GC006', 'guest cannot end the round early');
select pg_temp.as_user('00000000-0000-0000-0000-000000000030') \g /dev/null
select pg_temp.expect_eq((select a.advanced::text from public.host_advance((select v from t where k = 'game')::uuid, pg_temp.ver() - 1) a), 'false', 'stale version: host_advance does nothing');
select pg_temp.expect_eq(pg_temp.state(), 'DRAWING r1 v4', 'still drawing');
select pg_temp.expect_eq((select a.advanced::text from public.host_advance((select v from t where k = 'game')::uuid, pg_temp.ver()) a), 'true', 'host ends drawing early');
select pg_temp.expect_eq(pg_temp.state() || ' ' || (select (status = 'TIME_UP' and ends_at <= clock_timestamp() and ends_at < (select phase_started_at from public.games) + interval '60 seconds')::text from public.rounds where round_number = 1), 'TIME_UP r1 v5 true', 'time up; round end time moved to when it ended');
select pg_temp.expect_code(format('select * from public.host_advance(%L, %s)', (select v from t where k = 'game'), pg_temp.ver()), 'GC008', 'host cannot skip TIME_UP');

reset role; select pg_temp.expire(); set local role authenticated;
select pg_temp.adv() \g /dev/null
select pg_temp.expect_eq(pg_temp.state(), 'EVALUATING r1 v6', 'evaluating');
select pg_temp.expect_eq((select (phase_ends_at - phase_started_at)::text from public.games), '00:00:20', 'evaluating waits up to 20 s for scores');
reset role;
update public.games set phase_ends_at = now() - interval '1 second', phase_started_at = now() - interval '2 seconds';
set local role authenticated;
select pg_temp.expect_eq(pg_temp.adv(), 'false', 'evaluating keeps its 4.5 s minimum');
reset role; select pg_temp.expire(); set local role authenticated;
select pg_temp.adv() \g /dev/null
select pg_temp.expect_eq(pg_temp.state() || ' ' || (select status from public.rounds where round_number = 1), 'ROUND_RESULTS r1 v7 COMPLETED', 'round results; round COMPLETED');
select pg_temp.expect_eq((select count(*)::text || ' ' || sum(score)::text from public.scores), '2 0', 'missing scores count as 0 and are visible');

-- Round 2 via the host's "Next Round"
select pg_temp.expect_eq((select a.advanced::text from public.host_advance((select v from t where k = 'game')::uuid, pg_temp.ver()) a), 'true', 'host: next round');
select pg_temp.expect_eq(pg_temp.state(), 'WHEEL_SPINNING r2 v8', 'round 2 starts');
select pg_temp.expect_eq(((select prompt from public.rounds where round_number = 2) <> (select v from t where k = 'p1'))::text, 'true', 'round 2 gets a different prompt');
do $$ begin
  for i in 1..5 loop
    reset role; perform pg_temp.expire(); set local role authenticated;
    perform pg_temp.adv();
  end loop;
end $$;
select pg_temp.expect_eq(pg_temp.state(), 'ROUND_RESULTS r2 v13', 'round 2 runs to its results on the clock');

-- Final round: results → final results → completed
reset role; select pg_temp.expire(); set local role authenticated;
select pg_temp.adv() \g /dev/null
select pg_temp.expect_eq(pg_temp.state(), 'FINAL_RESULTS r2 v14', 'after the last round: FINAL_RESULTS');
select pg_temp.expect_eq((select count(*)::text from public.rounds), '2', 'no third round');
reset role; select pg_temp.expire(); set local role authenticated;
select pg_temp.adv() \g /dev/null
select pg_temp.expect_eq(pg_temp.state() || ' ' || coalesce((select phase_ends_at::text from public.games), 'no end'), 'COMPLETED r2 v15 no end', 'then COMPLETED, with no end time');
select pg_temp.expect_eq(pg_temp.adv(), 'false', 'nothing after COMPLETED');

-- The trigger refuses illegal transitions even for the service role / owner.
reset role;
select pg_temp.expect_code(format($$update public.games set status = 'DRAWING' where id = %L$$, (select v from t where k = 'game')), 'GC009', 'COMPLETED → DRAWING refused by the trigger');
select pg_temp.expect_code(format($$update public.games set status = 'LOBBY' where id = %L$$, (select v from t where k = 'game')), 'GC009', 'COMPLETED → LOBBY refused by the trigger');
set local role authenticated;

-- Outsiders
select pg_temp.as_user('00000000-0000-0000-0000-000000000032') \g /dev/null
select pg_temp.expect_code(format('select * from public.advance_game(%L, 0)', (select v from t where k = 'game')), 'GC005', 'non-member cannot advance');
select pg_temp.expect_eq((public.get_game_state((select v from t where k = 'game')::uuid) -> 'game')::text, 'null', 'non-member gets no game state');
select pg_temp.as_user('00000000-0000-0000-0000-000000000031') \g /dev/null
select pg_temp.expect_eq((select jsonb_array_length(s -> 'rounds') || ' ' || (s -> 'game' ->> 'status') || ' ' || jsonb_array_length(s -> 'players') from public.get_game_state((select v from t where k = 'game')::uuid) s), '2 COMPLETED 2', 'member gets the full state');

rollback;
