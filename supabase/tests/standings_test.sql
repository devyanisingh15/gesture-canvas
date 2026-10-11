-- Checks the leaderboard the database works out (public.get_standings, also in
-- get_game_state): totals over completed rounds only, ranks with ties shared
-- and a fixed order, previous ranks, final totals, and who can see it.
-- Run against a throwaway local Postgres, never a real project, after
-- local_supabase_stub.sql and every migration:
--   psql -d gc_test -q -t -A -f supabase/tests/standings_test.sql
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

insert into auth.users values ('00000000-0000-0000-0000-000000000050'), ('00000000-0000-0000-0000-000000000051'),
  ('00000000-0000-0000-0000-000000000052'), ('00000000-0000-0000-0000-000000000053');
create temp table t (k text primary key, v text);
grant all on t to authenticated, service_role;
create function pg_temp.gid() returns uuid language sql as $$ select v::uuid from t where k = 'game' $$;
create function pg_temp.rid() returns uuid language sql as $$
  select r.id from public.rounds r join public.games g on g.id = r.game_id and r.round_number = g.current_round where g.id = pg_temp.gid() $$;
-- Test-only clock control, as the test's superuser: the phase is due now / the round's deadline was N seconds ago.
create function pg_temp.expire() returns void language sql security definer as $$
  update public.games set phase_ends_at = now() - interval '1 second', phase_started_at = now() - interval '1 hour' where id = pg_temp.gid() $$;
create function pg_temp.deadline_ago(p_secs numeric) returns void language sql security definer as $$
  update public.rounds set started_at = now() - interval '1 hour', ends_at = now() - make_interval(secs => p_secs) where id = pg_temp.rid();
  update public.games set phase_ends_at = now() - make_interval(secs => p_secs) where id = pg_temp.gid() and status = 'DRAWING' $$;
create function pg_temp.state() returns text language sql as $$
  select g.status || ' r' || g.current_round from public.games g where g.id = pg_temp.gid() $$;
create function pg_temp.ver() returns integer language sql as $$ select state_version from public.games where id = pg_temp.gid() $$;
create function pg_temp.adv() returns text language sql as $$
  select a.advanced::text from public.advance_game(pg_temp.gid(), pg_temp.ver()) a $$;
create function pg_temp.walk_to(p_status text) returns void language plpgsql as $$
begin
  for i in 1..20 loop
    exit when (select status from public.games where id = pg_temp.gid()) = p_status;
    perform pg_temp.expire();
    perform public.advance_game(pg_temp.gid(), pg_temp.ver());
  end loop;
end $$;
create function pg_temp.pid(p_name text) returns text language sql security definer as $$
  select id::text from public.players where game_id = pg_temp.gid() and display_name = p_name $$;
-- The leaderboard as the signed-in player gets it: "name total (round) #rank/previous" in order.
create function pg_temp.board() returns text language sql as $$
  select coalesce(string_agg(p.display_name || ' ' || (x ->> 'total') || ' (' || (x ->> 'round_score') || ') #' || (x ->> 'rank') || '/' || coalesce(x ->> 'previous_rank', '-'), ', ' order by o), 'empty')
    from jsonb_array_elements(public.get_standings(pg_temp.gid())) with ordinality e(x, o)
    left join public.players p on p.id = (x ->> 'player_id')::uuid $$;
-- Scores the current round as the server would: Ann, Ben, Cy.
create function pg_temp.score(a integer, b integer, c integer) returns text language sql security definer as $$
  select public.record_scores(pg_temp.rid(), jsonb_build_array(
    jsonb_build_object('player_id', pg_temp.pid('Ann'), 'score', a),
    jsonb_build_object('player_id', pg_temp.pid('Ben'), 'score', b),
    jsonb_build_object('player_id', pg_temp.pid('Cy'), 'score', c)))::text $$;
create function pg_temp.space_joins() returns void language sql security definer as $$
  update public.players set joined_at = joined_at + case display_name when 'Ben' then interval '1 second' when 'Cy' then interval '2 seconds' else interval '0' end
   where game_id = pg_temp.gid() $$;
grant execute on all functions in schema pg_temp to authenticated, service_role;

set local role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-000000000050') \g /dev/null
insert into t select 'game', game_id::text from public.create_game('Ann', 3, 45);
insert into t select 'code', room_code from public.games where id = pg_temp.gid();
select pg_temp.as_user('00000000-0000-0000-0000-000000000051') \g /dev/null
select public.join_game((select v from t where k = 'code'), 'Ben') \g /dev/null
select pg_temp.as_user('00000000-0000-0000-0000-000000000052') \g /dev/null
select public.join_game((select v from t where k = 'code'), 'Cy') \g /dev/null
select pg_temp.as_user('00000000-0000-0000-0000-000000000050') \g /dev/null
-- Everyone joined in this one test transaction (the same now()); space the joins out as in a real game.
select pg_temp.space_joins() \g /dev/null

select pg_temp.expect_eq(pg_temp.board(), 'Ann 0 (0) #1/-, Ben 0 (0) #1/-, Cy 0 (0) #1/-', 'lobby: everyone 0, sharing first, in join order');
select public.start_game(pg_temp.gid()) \g /dev/null

-- Round 1: Ann 50, Ben 80, Cy 50.
select pg_temp.walk_to('EVALUATING');
select pg_temp.expect_eq(pg_temp.score(50, 80, 50), 'true', 'round 1 scored by the server');
select pg_temp.expect_eq(pg_temp.board(), 'Ann 0 (0) #1/-, Ben 0 (0) #1/-, Cy 0 (0) #1/-', 'EVALUATING: the new scores don''t count or show yet');
select pg_temp.walk_to('ROUND_RESULTS');
select pg_temp.expect_eq(pg_temp.state(), 'ROUND_RESULTS r1', 'round 1 results');
select pg_temp.expect_eq(pg_temp.board(), 'Ben 80 (80) #1/-, Ann 50 (50) #2/-, Cy 50 (50) #2/-', 'round 1: ranked by score; Ann and Cy tie for 2nd, earlier joiner first');
select pg_temp.as_user('00000000-0000-0000-0000-000000000052') \g /dev/null
select pg_temp.expect_eq(pg_temp.board(), 'Ben 80 (80) #1/-, Ann 50 (50) #2/-, Cy 50 (50) #2/-', 'every player gets the same leaderboard');
select pg_temp.expect_eq((select (s -> 'standings' = public.get_standings(pg_temp.gid()))::text from public.get_game_state(pg_temp.gid()) s), 'true', 'get_game_state carries it');

-- Round 2: Ann 40, Ben 10, Cy 40. Everyone on 90.
select pg_temp.walk_to('EVALUATING');
select pg_temp.expect_eq(pg_temp.state(), 'EVALUATING r2', 'round 2 evaluating');
select pg_temp.expect_eq(pg_temp.score(40, 10, 40), 'true', 'round 2 scored');
select pg_temp.expect_eq(pg_temp.board(), 'Ben 80 (80) #1/-, Ann 50 (50) #2/-, Cy 50 (50) #2/-', 'EVALUATING: still round 1''s leaderboard');
select pg_temp.walk_to('ROUND_RESULTS');
select pg_temp.expect_eq(pg_temp.board(), 'Ann 90 (40) #1/2, Ben 90 (10) #1/1, Cy 90 (40) #1/2', 'round 2: a three-way tie shares first, in join order, with previous ranks');

-- Round 3 (the last): Ann 10, Ben 0, Cy 5.
select pg_temp.walk_to('EVALUATING');
select pg_temp.expect_eq(pg_temp.score(10, 0, 5), 'true', 'round 3 scored');
select pg_temp.walk_to('ROUND_RESULTS');
select pg_temp.expect_eq(pg_temp.board(), 'Ann 100 (10) #1/1, Cy 95 (5) #2/1, Ben 90 (0) #3/1', 'round 3 results');
select pg_temp.walk_to('FINAL_RESULTS');
select pg_temp.expect_eq(pg_temp.state(), 'FINAL_RESULTS r3', 'final results');
select pg_temp.expect_eq(pg_temp.board(), 'Ann 100 (10) #1/1, Cy 95 (5) #2/1, Ben 90 (0) #3/1', 'final leaderboard: totals over all three rounds, Ann wins');
select pg_temp.expect_eq(
  (select sum(score)::text from public.scores s join public.rounds r on r.id = s.round_id where r.game_id = pg_temp.gid() and s.player_id = pg_temp.pid('Cy')::uuid),
  '95', 'the totals are the sums of the stored scores');

-- Outsiders see nothing.
select pg_temp.as_user('00000000-0000-0000-0000-000000000053') \g /dev/null
select pg_temp.expect_eq(pg_temp.board(), 'empty', 'someone not in the game gets an empty leaderboard');
reset role;
set local role anon;
select pg_temp.expect_code($$select public.get_standings(pg_temp.gid())$$, '42501', 'anonymous visitors can''t call it');
reset role;

rollback;
