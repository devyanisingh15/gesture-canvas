-- Checks drawing evaluation storage: scores are written only by the server
-- (service_role) through record_scores, only once the drawing round is over,
-- once per round, with clean values; players can't write or change them.
-- Run against a throwaway local Postgres, never a real project, after
-- local_supabase_stub.sql and every migration:
--   psql -d gc_test -q -t -A -f supabase/tests/evaluation_test.sql
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
-- A drawing of n strokes, each with m points 33 ms apart.
create function pg_temp.drawing(n integer, m integer, t0 bigint default 1760000000000) returns jsonb language sql as $$
  select jsonb_build_object('version', 1, 'strokes', coalesce(jsonb_agg(jsonb_build_object('id', 's' || i,
    'points', (select jsonb_agg(jsonb_build_object('x', round(0.2 + i / 20.0, 2), 'y', round(0.2 + (j % 50) / 100.0, 2), 'timestamp', t0 + (i * m + j) * 33) order by j) from generate_series(0, m - 1) j))
    order by i), '[]'::jsonb))
  from generate_series(1, n) i $$;
create function pg_temp.send(p text) returns text language sql as $$ select public.submit_drawing(pg_temp.rid(), p::jsonb)::text $$;
-- Every score in the current round, read past RLS (the test's own view).
create function pg_temp.scores() returns text language sql security definer as $$
  select coalesce(string_agg(p.display_name || '=' || s.score, ' ' order by p.display_name), 'none')
    from public.scores s join public.players p on p.id = s.player_id where s.round_id = pg_temp.rid() $$;
create function pg_temp.breakdown(p_name text) returns jsonb language sql security definer as $$
  select s.breakdown from public.scores s join public.players p on p.id = s.player_id where s.round_id = pg_temp.rid() and p.display_name = p_name $$;
create function pg_temp.pid(p_name text) returns text language sql security definer as $$
  select id::text from public.players where game_id = pg_temp.gid() and display_name = p_name $$;
-- What the evaluation service sends for a round.
create function pg_temp.result(p_name text, p_score numeric, p_feedback text default 'Nice.') returns jsonb language sql as $$
  select jsonb_build_object('player_id', pg_temp.pid(p_name), 'score', p_score,
    'breakdown', jsonb_build_object('structure', p_score, 'completeness', p_score, 'composition', p_score, 'feedback', p_feedback, 'evaluator', 'mvp-geometry-v1')) $$;
-- Rows a direct (RLS-checked) change of scores touches.
create function pg_temp.score_update() returns integer language plpgsql as $$
declare n integer;
begin
  update public.scores set score = 100 where round_id = pg_temp.rid();
  get diagnostics n = row_count;
  return n;
end $$;
create function pg_temp.score_delete() returns integer language plpgsql as $$
declare n integer;
begin
  delete from public.scores where round_id = pg_temp.rid();
  get diagnostics n = row_count;
  return n;
end $$;
grant execute on all functions in schema pg_temp to authenticated, service_role;

set local role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-000000000050') \g /dev/null
insert into t select 'game', game_id::text from public.create_game('Ann', 5, 45);
insert into t select 'code', room_code from public.games where id = pg_temp.gid();
select pg_temp.as_user('00000000-0000-0000-0000-000000000051') \g /dev/null
select public.join_game((select v from t where k = 'code'), 'Ben') \g /dev/null
select pg_temp.as_user('00000000-0000-0000-0000-000000000052') \g /dev/null
select public.join_game((select v from t where k = 'code'), 'Cy') \g /dev/null
select pg_temp.as_user('00000000-0000-0000-0000-000000000050') \g /dev/null
select public.start_game(pg_temp.gid()) \g /dev/null
select pg_temp.walk_to('DRAWING');

-- Three players hand in different drawings.
select pg_temp.expect_eq((pg_temp.send(pg_temp.drawing(3, 20)::text) is not null)::text, 'true', 'Ann hands in 3 strokes');
select pg_temp.as_user('00000000-0000-0000-0000-000000000051') \g /dev/null
select pg_temp.expect_eq((pg_temp.send(pg_temp.drawing(6, 10)::text) is not null)::text, 'true', 'Ben hands in 6 strokes');
select pg_temp.as_user('00000000-0000-0000-0000-000000000052') \g /dev/null
select pg_temp.expect_eq((pg_temp.send(pg_temp.drawing(1, 5)::text) is not null)::text, 'true', 'Cy hands in 1 stroke');

-- While drawing: no evaluation, for anyone.
select pg_temp.expect_eq(public.request_evaluation(pg_temp.rid())::text, 'false', 'DRAWING: a player''s request for scoring does nothing');
reset role;
set local role service_role;
select pg_temp.expect_eq(public.evaluation_batch(pg_temp.rid())::text, null, 'DRAWING: even the server gets no drawings to score');
select pg_temp.expect_eq(public.record_scores(pg_temp.rid(), jsonb_build_array(pg_temp.result('Ann', 90)))::text, 'false', 'DRAWING: even the server can''t record scores');
reset role;
select pg_temp.expect_eq(pg_temp.scores(), 'none', 'DRAWING: no scores stored');

-- Time's up (hand-in grace): still no evaluation.
set local role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-000000000050') \g /dev/null
select pg_temp.expire() \g /dev/null
select pg_temp.expect_eq(pg_temp.adv(), 'true', 'on to TIME_UP');
select pg_temp.expect_eq(pg_temp.state(), 'TIME_UP r1', 'TIME_UP');
select pg_temp.expect_eq(public.request_evaluation(pg_temp.rid())::text, 'false', 'TIME_UP: no scoring yet');
reset role;
set local role service_role;
select pg_temp.expect_eq(public.evaluation_batch(pg_temp.rid())::text, null, 'TIME_UP: the server gets no drawings yet');
select pg_temp.expect_eq(public.record_scores(pg_temp.rid(), jsonb_build_array(pg_temp.result('Ann', 90)))::text, 'false', 'TIME_UP: the server can''t record scores yet');
reset role;

-- EVALUATING: the round is over.
set local role authenticated;
select pg_temp.expire() \g /dev/null
select pg_temp.expect_eq(pg_temp.adv(), 'true', 'on to EVALUATING');
select pg_temp.expect_eq(public.request_evaluation(pg_temp.rid())::text, 'true', 'EVALUATING: a player asks for scoring');

-- Players can't set scores, theirs or anyone's.
select pg_temp.expect_code($$select public.record_scores(pg_temp.rid(), jsonb_build_array(pg_temp.result('Ann', 100)))$$, '42501', 'a player can''t call record_scores');
select pg_temp.expect_code($$select public.evaluation_batch(pg_temp.rid())$$, '42501', 'a player can''t read every drawing');
select pg_temp.expect_code($$insert into public.scores (round_id, player_id, score) values (pg_temp.rid(), pg_temp.pid('Ann')::uuid, 100)$$, '42501', 'a player can''t insert a score');
select pg_temp.expect_code($$select pg_temp.score_update()$$, '42501', 'a player can''t update scores');
select pg_temp.expect_code($$select pg_temp.score_delete()$$, '42501', 'a player can''t delete scores');
select pg_temp.expect_code($$select private.clean_breakdown('{}')$$, '42501', 'a player can''t call the cleaning helpers');
reset role;
set local role anon;
select pg_temp.expect_code($$select public.record_scores(pg_temp.rid(), '[]')$$, '42501', 'anonymous visitors can''t call record_scores');
select pg_temp.expect_code($$select public.request_evaluation(pg_temp.rid())$$, '42501', 'anonymous visitors can''t ask for scoring');
reset role;
select pg_temp.expect_eq(pg_temp.scores(), 'none', 'still no scores');

-- The server scores the round: what the evaluator gave, cleaned.
set local role service_role;
select pg_temp.expect_eq(
  (select jsonb_array_length(b -> 'drawings') || ' drawings for ' || jsonb_array_length(b -> 'players') || ' players' from public.evaluation_batch(pg_temp.rid()) b),
  '3 drawings for 3 players', 'the server reads every drawing');
select pg_temp.expect_eq(public.record_scores(pg_temp.rid(), jsonb_build_array(
  pg_temp.result('Ann', 87),
  pg_temp.result('Ann', 5),
  pg_temp.result('Ben', 63.6, '  Keep going: a bigger drawing with more detail scores higher.  ') || jsonb_build_object('player_id', pg_temp.pid('Ben')),
  jsonb_build_object('player_id', pg_temp.pid('Cy'), 'score', '99', 'breakdown', jsonb_build_object(
    'structure', 250, 'completeness', -4, 'composition', 'high', 'feedback', repeat('x', 400), 'evaluator', 'mvp-geometry-v1',
    'shapeScore', 77, 'secret', 'nope')),
  jsonb_build_object('player_id', '00000000-0000-0000-0000-00000000dead', 'score', 100)))::text, 'true', 'the server records the scores');
reset role;
select pg_temp.expect_eq(pg_temp.scores(), 'Ann=87 Ben=64 Cy=0', 'each player one score: first entry wins, rounded, a non-number is 0, strangers ignored');
select pg_temp.expect_eq(pg_temp.breakdown('Ann')::text,
  '{"feedback": "Nice.", "evaluator": "mvp-geometry-v1", "structure": 87, "composition": 87, "completeness": 87}', 'the breakdown is stored');
select pg_temp.expect_eq(pg_temp.breakdown('Ben') ->> 'feedback', 'Keep going: a bigger drawing with more detail scores higher.', 'feedback is trimmed');
select pg_temp.expect_eq(
  (select string_agg(k, ',' order by k) from jsonb_object_keys(pg_temp.breakdown('Cy')) k) || ' ' || (pg_temp.breakdown('Cy') ->> 'structure') || ' '
    || (pg_temp.breakdown('Cy') ->> 'completeness') || ' ' || length(pg_temp.breakdown('Cy') ->> 'feedback'),
  'completeness,evaluator,feedback,structure 100 0 280', 'only known fields are kept, clamped to 0-100, feedback cut to 280');

set local role service_role;
select pg_temp.expect_eq(public.record_scores(pg_temp.rid(), jsonb_build_array(pg_temp.result('Cy', 100)))::text, 'false', 'a round is scored once');
reset role;
select pg_temp.expect_eq(pg_temp.scores(), 'Ann=87 Ben=64 Cy=0', 'the scores are unchanged');

-- Results: players see the scores and still can't change them.
set local role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-000000000052') \g /dev/null
select pg_temp.expect_eq(public.request_evaluation(pg_temp.rid())::text, 'false', 'a scored round needs no more scoring');
select pg_temp.expire() \g /dev/null
select pg_temp.expect_eq(pg_temp.adv(), 'true', 'on to the results');
select pg_temp.expect_eq(
  (select string_agg((x ->> 'score') || ':' || coalesce(x -> 'breakdown' ->> 'structure', '-'), ',' order by (x ->> 'score')::int desc)
     from jsonb_array_elements(public.get_game_state(pg_temp.gid()) -> 'scores') x),
  '87:87,64:64,0:100', 'players see every score with its breakdown');
select pg_temp.expect_code($$select pg_temp.score_update()$$, '42501', 'Cy can''t raise their score after the round');
select pg_temp.expect_code($$select public.record_scores(pg_temp.rid(), jsonb_build_array(pg_temp.result('Cy', 100)))$$, '42501', 'nor through record_scores');
reset role;
select pg_temp.expect_eq(pg_temp.scores(), 'Ann=87 Ben=64 Cy=0', 'the scores are unchanged');

rollback;
