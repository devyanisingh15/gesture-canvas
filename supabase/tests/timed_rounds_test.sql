-- Checks timed drawing rounds: the database's start and end times decide when
-- drawings are accepted, and scores are stored once, by the server only.
-- Run against a throwaway local Postgres, never a real project, after
-- local_supabase_stub.sql and every migration:
--   psql -d gc_test -q -t -A -f supabase/tests/timed_rounds_test.sql
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
create function pg_temp.submit(p_label text) returns text language sql as $$
  select public.submit_drawing(pg_temp.rid(), jsonb_build_object('version', 1, 'strokes', jsonb_build_array(jsonb_build_object('id', p_label,
    'points', '[{"x":0.1,"y":0.1,"timestamp":1760000000000},{"x":0.5,"y":0.5,"timestamp":1760000000033}]'::jsonb))))::text $$;
create function pg_temp.my_drawing() returns text language sql security definer as $$
  select d.strokes -> 'strokes' -> 0 ->> 'id' from public.drawings d join public.players p on p.id = d.player_id
   where d.round_id = pg_temp.rid() and p.user_id = (select current_setting('request.jwt.claim.sub', true))::uuid $$;
-- Rows a direct (RLS-checked) update of the caller's drawing changes.
create function pg_temp.direct_update() returns integer language plpgsql as $$
declare n integer;
begin
  update public.drawings set strokes = '{"version":1,"strokes":[]}' where round_id = pg_temp.rid();
  get diagnostics n = row_count;
  return n;
end $$;
grant execute on all functions in schema pg_temp to authenticated, service_role;

-- MVP configuration
set local role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-000000000050') \g /dev/null
select pg_temp.expect_code($$select public.create_game('Ann', 5, 5)$$, '22023', 'drawing time under 10 s is refused');
insert into t select 'game', game_id::text from public.create_game('Ann', 5, 45);
insert into t select 'code', room_code from public.games where id = pg_temp.gid();
select pg_temp.expect_eq((select total_rounds || ' rounds, ' || draw_seconds || ' s' from public.games where id = pg_temp.gid()), '5 rounds, 45 s', 'create_game: 5 rounds of 45 s');
reset role;
select pg_temp.expect_eq((select column_default from information_schema.columns where table_name = 'games' and column_name = 'draw_seconds'), '45', 'drawing time defaults to 45 s');
set local role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-000000000051') \g /dev/null
select public.join_game((select v from t where k = 'code'), 'Ben') \g /dev/null
select pg_temp.as_user('00000000-0000-0000-0000-000000000052') \g /dev/null
select public.join_game((select v from t where k = 'code'), 'Cy') \g /dev/null
select pg_temp.as_user('00000000-0000-0000-0000-000000000050') \g /dev/null
select public.start_game(pg_temp.gid()) \g /dev/null

-- The round's clock comes from the database.
select pg_temp.walk_to('TARGET_REVEALED');
select pg_temp.expect_code($$select pg_temp.submit('early')$$, 'GC010', 'no drawings before the round starts');
select pg_temp.expire() \g /dev/null
select pg_temp.expect_eq(pg_temp.adv(), 'true', 'drawing starts');
select pg_temp.expect_eq(
  (select (g.phase_ends_at - g.phase_started_at)::text || ' ' || (r.ends_at = g.phase_ends_at)::text
     from public.games g join public.rounds r on r.game_id = g.id and r.round_number = g.current_round where g.id = pg_temp.gid()),
  '00:00:45 true', 'DRAWING: 45 s, and the round''s ends_at is the phase deadline');
select pg_temp.expect_eq(pg_temp.adv(), 'false', 'the round can''t be ended early by a timer');

-- Handing in while drawing
select pg_temp.expect_eq((pg_temp.submit('ann-1') is not null)::text, 'true', 'Ann hands in while drawing');
select pg_temp.expect_eq((pg_temp.submit('ann-1') is not null)::text, 'true', 'handing in the same drawing again (a retry) is accepted');
select pg_temp.expect_code($$select pg_temp.submit('ann-2')$$, 'GC011', 'a different second drawing is refused');
select pg_temp.expect_eq(pg_temp.my_drawing() || ' ' || (select count(*) from public.drawings where round_id = pg_temp.rid()), 'ann-1 1', 'one drawing per player, the first kept');
select pg_temp.as_user('00000000-0000-0000-0000-000000000053') \g /dev/null
select pg_temp.expect_code($$select pg_temp.submit('intruder')$$, 'GC005', 'someone outside the game can''t hand in');

-- Just past the deadline, inside the 3 s grace: a drawing finished in time is still on its way.
select pg_temp.as_user('00000000-0000-0000-0000-000000000051') \g /dev/null
select pg_temp.deadline_ago(1) \g /dev/null
select pg_temp.expect_eq((pg_temp.submit('ben-1') is not null)::text, 'true', '1 s after the deadline: accepted (grace)');
-- Past the grace: refused, through the function and directly.
select pg_temp.deadline_ago(3.5) \g /dev/null
select pg_temp.expect_code($$select pg_temp.submit('ben-late')$$, 'GC010', '3.5 s after the deadline: refused');
select pg_temp.expect_code($$select pg_temp.direct_update()$$, '42501', '...and players can''t update drawing rows directly');
select pg_temp.expect_eq(pg_temp.my_drawing(), 'ben-1', 'Ben''s drawing is the one from before the deadline');

-- Time up, by the database clock.
select pg_temp.deadline_ago(1) \g /dev/null
select pg_temp.expect_eq(pg_temp.adv(), 'true', 'deadline passed: the round ends');
select pg_temp.expect_eq(pg_temp.state(), 'TIME_UP r1', 'TIME_UP');
select pg_temp.expect_eq(
  (select status || ' ' || (ends_at < now())::text from public.rounds where id = pg_temp.rid()), 'TIME_UP true', 'the round keeps its deadline');
select pg_temp.as_user('00000000-0000-0000-0000-000000000052') \g /dev/null
select pg_temp.expect_eq((pg_temp.submit('cy-1') is not null)::text, 'true', 'TIME_UP, within the grace: Cy''s drawing still arrives');
select pg_temp.expire() \g /dev/null
select pg_temp.expect_eq(pg_temp.adv(), 'true', 'on to EVALUATING');
select pg_temp.expect_code($$select pg_temp.submit('cy-2')$$, 'GC010', 'EVALUATING: no more drawings');

-- Scoring: players can ask for it, only the server can do it.
select pg_temp.expect_eq(public.request_evaluation(pg_temp.rid())::text, 'true', 'a player asks for scoring: needed');
select pg_temp.as_user('00000000-0000-0000-0000-000000000053') \g /dev/null
select pg_temp.expect_eq(public.request_evaluation(pg_temp.rid())::text, 'false', 'an outsider''s request does nothing');
select pg_temp.as_user('00000000-0000-0000-0000-000000000050') \g /dev/null
select pg_temp.expect_code($$select public.evaluation_batch(pg_temp.rid())$$, '42501', 'players can''t read the batch of drawings');
select pg_temp.expect_code($$select public.record_scores(pg_temp.rid(), '[]')$$, '42501', 'players can''t record scores');
select pg_temp.expect_code($$insert into public.scores (round_id, player_id, score) select pg_temp.rid(), id, 100 from public.players where game_id = pg_temp.gid() limit 1$$, '42501', 'players can''t write scores directly');
insert into t select 'v_before', pg_temp.ver()::text;
select pg_temp.expect_eq((select jsonb_array_length(s -> 'scores')::text from public.get_game_state(pg_temp.gid()) s), '0', 'scores are hidden while evaluating');

reset role;
set local role service_role;
select pg_temp.expect_eq(
  (select (b ->> 'prompt' is not null)::text || ' ' || jsonb_array_length(b -> 'players') || ' players ' || jsonb_array_length(b -> 'drawings') || ' drawings'
     from public.evaluation_batch(pg_temp.rid()) b),
  'true 3 players 3 drawings', 'the server reads the prompt and every drawing');
insert into t select 'ann', id::text from public.players where game_id = pg_temp.gid() and display_name = 'Ann';
insert into t select 'ben', id::text from public.players where game_id = pg_temp.gid() and display_name = 'Ben';
select pg_temp.expect_eq(public.record_scores(pg_temp.rid(), jsonb_build_array(
  jsonb_build_object('player_id', (select v from t where k = 'ann'), 'score', 150, 'breakdown', jsonb_build_object('structure', 90, 'shapeScore', 90)),
  jsonb_build_object('player_id', (select v from t where k = 'ben'), 'score', 41.6)))::text, 'true', 'the server records the scores');
select pg_temp.expect_eq(public.record_scores(pg_temp.rid(), '[]')::text, 'false', 'a second recording does nothing');
select pg_temp.expect_eq(
  (select string_agg(p.display_name || '=' || s.score, ' ' order by p.display_name) from public.scores s join public.players p on p.id = s.player_id where s.round_id = pg_temp.rid()),
  'Ann=100 Ben=42 Cy=0', 'every player has one score (clamped, rounded, missing = 0)');
select pg_temp.expect_eq(
  (select (state_version = (select v::int + 1 from t where k = 'v_before'))::text || ' ' || (phase_ends_at - phase_started_at)::text from public.games where id = pg_temp.gid()),
  'true 00:00:04.5', 'clients are told, and results come after the minimum evaluating time');
reset role;
set local role authenticated;
select pg_temp.expect_eq(public.request_evaluation(pg_temp.rid())::text, 'false', 'scored rounds need no more scoring');

select pg_temp.expire() \g /dev/null
select pg_temp.expect_eq(pg_temp.adv(), 'true', 'on to the results');
select pg_temp.expect_eq(pg_temp.state(), 'ROUND_RESULTS r1', 'ROUND_RESULTS');
select pg_temp.expect_eq(
  (select string_agg((x ->> 'score') || coalesce(' ' || (x -> 'breakdown' ->> 'structure'), '') || coalesce(' ' || (x -> 'breakdown' ->> 'shapeScore'), ''), ',' order by (x ->> 'score')::int desc)
     from jsonb_array_elements(public.get_game_state(pg_temp.gid()) -> 'scores') x),
  '100 90,42,0', 'players now see the scores, with the breakdown');

-- Without a scoring server, EVALUATING still ends, with zeros.
select pg_temp.walk_to('EVALUATING');
insert into t select 'r1', r.id::text from public.rounds r where r.game_id = pg_temp.gid() and r.round_number = 1;
select pg_temp.expect_code($$select public.submit_drawing((select v::uuid from t where k = 'r1'), '{"version":1,"strokes":[]}')$$, 'GC010', 'a drawing for an earlier round is refused');
select pg_temp.walk_to('ROUND_RESULTS');
select pg_temp.expect_eq(
  (select count(*) || ' scores, total ' || sum(score) from public.scores where round_id = pg_temp.rid()), '3 scores, total 0', 'no scorer: every player gets 0 after the wait');

rollback;
