-- Checks secure drawing submission: only through submit_drawing, as yourself,
-- for the current round, before the deadline + grace, once, and only a valid
-- drawing. Run against a throwaway local Postgres, never a real project, after
-- local_supabase_stub.sql and every migration:
--   psql -d gc_test -q -t -A -f supabase/tests/drawing_submission_test.sql
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


-- A drawing of n strokes, each with m points 33 ms apart, starting at t0.
create function pg_temp.drawing(n integer, m integer, t0 bigint default 1760000000000) returns jsonb language sql as $$
  select jsonb_build_object('version', 1, 'strokes', coalesce(jsonb_agg(jsonb_build_object('id', 's' || i,
    'points', (select jsonb_agg(jsonb_build_object('x', 0.5, 'y', round((j % 100) / 100.0, 2), 'timestamp', t0 + (i * m + j) * 33) order by j) from generate_series(0, m - 1) j))
    order by i), '[]'::jsonb))
  from generate_series(1, n) i $$;
-- submit_drawing for the current round with a given payload (text, so malformed JSON shapes can be passed).
create function pg_temp.send(p text) returns text language sql as $$ select public.submit_drawing(pg_temp.rid(), p::jsonb)::text $$;
create function pg_temp.stored(p_user text) returns jsonb language sql security definer as $$
  select d.strokes from public.drawings d join public.players p on p.id = d.player_id
   where d.round_id = pg_temp.rid() and p.user_id = p_user::uuid $$;
-- Every drawing in the current round, read past RLS (the test's own view).
create function pg_temp.who_drew() returns text language sql security definer as $$
  select string_agg(p.display_name || '=' || jsonb_array_length(d.strokes -> 'strokes'), ' ' order by p.display_name)
    from public.drawings d join public.players p on p.id = d.player_id where d.round_id = pg_temp.rid() $$;
grant execute on all functions in schema pg_temp to authenticated, service_role;

set local role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-000000000050') \g /dev/null
insert into t select 'game', game_id::text from public.create_game('Ann', 5, 45);
insert into t select 'code', room_code from public.games where id = pg_temp.gid();
select pg_temp.as_user('00000000-0000-0000-0000-000000000051') \g /dev/null
select public.join_game((select v from t where k = 'code'), 'Ben') \g /dev/null
select pg_temp.as_user('00000000-0000-0000-0000-000000000052') \g /dev/null
select public.join_game((select v from t where k = 'code'), 'Cy') \g /dev/null
-- A second game, with Dee, for cross-game attempts.
select pg_temp.as_user('00000000-0000-0000-0000-000000000053') \g /dev/null
insert into t select 'game2', game_id::text from public.create_game('Dee', 5, 45);
select pg_temp.as_user('00000000-0000-0000-0000-000000000050') \g /dev/null
select public.start_game(pg_temp.gid()) \g /dev/null
select pg_temp.walk_to('DRAWING');
insert into t select 'round1', pg_temp.rid()::text;

-- Normal submission
select pg_temp.expect_eq((pg_temp.send(pg_temp.drawing(3, 20)::text) is not null)::text, 'true', 'Ann hands in a 3-stroke drawing');
select pg_temp.expect_eq((select count(*)::text || ' ' || (pg_temp.stored('00000000-0000-0000-0000-000000000050') = pg_temp.drawing(3, 20))::text
  from public.drawings where round_id = pg_temp.rid()), '1 true', 'stored once, exactly as sent, as Ann''s drawing for this round');

-- Duplicates
select pg_temp.expect_eq((pg_temp.send(pg_temp.drawing(3, 20)::text) = (select submitted_at::text from public.drawings d join public.players p on p.id = d.player_id
  where d.round_id = pg_temp.rid() and p.display_name = 'Ann'))::text, true::text, 'the same drawing again (a retry after a dropped reply) returns the first hand-in');
select pg_temp.expect_code($$select pg_temp.send(pg_temp.drawing(4, 20)::text)$$, 'GC011', 'a different second drawing is refused');
select pg_temp.expect_eq((pg_temp.stored('00000000-0000-0000-0000-000000000050') = pg_temp.drawing(3, 20))::text, 'true', 'the first drawing stands');

-- Another player's drawing: there is no player argument, so a drawing is always the caller's.
select pg_temp.as_user('00000000-0000-0000-0000-000000000051') \g /dev/null
select pg_temp.expect_eq((pg_temp.send(pg_temp.drawing(1, 5)::text) is not null)::text, 'true', 'Ben hands in his own');
select pg_temp.expect_eq(pg_temp.who_drew(), 'Ann=3 Ben=1', 'Ben''s hand-in is stored as his; Ann''s is untouched');
select pg_temp.expect_eq((select string_agg(p.display_name, ' ') from public.drawings d join public.players p on p.id = d.player_id where d.round_id = pg_temp.rid()),
  'Ben', 'mid-round, Ben can read only his own drawing');
select pg_temp.expect_code($$insert into public.drawings (round_id, player_id, strokes)
  select pg_temp.rid(), id, '{"version":1,"strokes":[]}' from public.players where display_name = 'Cy'$$, '42501', 'Ben can''t write a row for Cy directly');
select pg_temp.expect_code($$update public.drawings set strokes = '{"version":1,"strokes":[]}' where round_id = pg_temp.rid()$$, '42501', 'Ben can''t overwrite anyone''s drawing directly');
select pg_temp.expect_code($$delete from public.drawings$$, '42501', 'Ben can''t delete drawings');
select pg_temp.as_user('00000000-0000-0000-0000-000000000053') \g /dev/null
select pg_temp.expect_code($$select pg_temp.send(pg_temp.drawing(1, 5)::text)$$, 'GC005', 'Dee (another game) can''t hand in to this round');
select pg_temp.as_user('00000000-0000-0000-0000-000000000051') \g /dev/null
select pg_temp.expect_code($$select public.submit_drawing((select r.id from public.rounds r where r.game_id = (select v::uuid from t where k = 'game2') limit 1), pg_temp.drawing(1, 5))$$,
  'GC005', 'Ben can''t hand in to a round of a game he isn''t in');
select pg_temp.expect_code($$select public.submit_drawing(gen_random_uuid(), pg_temp.drawing(1, 5))$$, 'GC005', 'a made-up round id is refused');

-- Scores, results and game state stay out of players' hands.
select pg_temp.expect_code($$insert into public.scores (round_id, player_id, score) select pg_temp.rid(), id, 100 from public.players where display_name = 'Ben'$$, '42501', 'Ben can''t write a score');
select pg_temp.expect_code($$update public.games set status = 'ROUND_RESULTS' where id = pg_temp.gid()$$, '42501', 'Ben can''t change the game state');
select pg_temp.expect_code($$update public.rounds set ends_at = now() + interval '1 hour' where id = pg_temp.rid()$$, '42501', 'Ben can''t move the deadline');
select pg_temp.expect_code($$select public.record_scores(pg_temp.rid(), '[]')$$, '42501', 'Ben can''t record scores (server only)');
select pg_temp.expect_code($$select public.evaluation_batch(pg_temp.rid())$$, '42501', 'Ben can''t read the evaluation batch (server only)');

-- Malformed payloads (Cy, who hasn't handed in yet): each refused with GC012, nothing stored.
select pg_temp.as_user('00000000-0000-0000-0000-000000000052') \g /dev/null
select pg_temp.expect_code(format('select pg_temp.send(%L)', p), 'GC012', label) from (values
  ('[]', 'not an object'),
  ('{"strokes":[]}', 'no version'),
  ('{"version":2,"strokes":[]}', 'unknown version'),
  ('{"version":1,"strokes":{}}', 'strokes not a list'),
  ('{"version":1,"strokes":[1]}', 'stroke not an object'),
  ('{"version":1,"strokes":[{"points":[{"x":0,"y":0,"timestamp":1760000000000},{"x":1,"y":1,"timestamp":1760000000001}]}]}', 'stroke without id'),
  ('{"version":1,"strokes":[{"id":"a","points":[{"x":0,"y":0,"timestamp":1760000000000}]}]}', 'one-point stroke'),
  ('{"version":1,"strokes":[{"id":"a","points":"lots"}]}', 'points not a list'),
  ('{"version":1,"strokes":[{"id":"a","points":[{"x":"0.5","y":0,"timestamp":1760000000000},{"x":1,"y":1,"timestamp":1760000000001}]}]}', 'x as a string'),
  ('{"version":1,"strokes":[{"id":"a","points":[{"x":0.5,"y":null,"timestamp":1760000000000},{"x":1,"y":1,"timestamp":1760000000001}]}]}', 'y null'),
  ('{"version":1,"strokes":[{"id":"a","points":[{"x":1.5,"y":0,"timestamp":1760000000000},{"x":1,"y":1,"timestamp":1760000000001}]}]}', 'x past the right edge'),
  ('{"version":1,"strokes":[{"id":"a","points":[{"x":0.5,"y":-0.1,"timestamp":1760000000000},{"x":1,"y":1,"timestamp":1760000000001}]}]}', 'y above the top'),
  ('{"version":1,"strokes":[{"id":"a","points":[{"x":0.5,"y":0,"timestamp":1e400},{"x":1,"y":1,"timestamp":1760000000001}]}]}', 'absurd timestamp'),
  ('{"version":1,"strokes":[{"id":"a","points":[{"x":0.5,"y":0,"timestamp":"soon"},{"x":1,"y":1,"timestamp":1760000000001}]}]}', 'timestamp as a string'),
  ('{"version":1,"strokes":[{"id":"a","points":[{"x":0.5,"y":0,"timestamp":12},{"x":1,"y":1,"timestamp":13}]}]}', 'timestamp before 2017'),
  ('{"version":1,"strokes":[{"id":"a","points":[{"x":0.5,"y":0,"timestamp":1760000000100},{"x":1,"y":1,"timestamp":1760000000000}]}]}', 'timestamps going backwards'),
  ('{"version":1,"strokes":[{"id":"a","points":[{"x":0,"y":0,"timestamp":1760000000000},{"x":1,"y":1,"timestamp":1760000000001}]},{"id":"a","points":[{"x":0,"y":0,"timestamp":1760000000002},{"x":1,"y":1,"timestamp":1760000000003}]}]}', 'duplicate stroke ids'),
  ('{"version":1,"strokes":[{"id":"a","color":"red; background:url(x)","points":[{"x":0,"y":0,"timestamp":1760000000000},{"x":1,"y":1,"timestamp":1760000000001}]}]}', 'color that isn''t a hex color'),
  ('{"version":1,"strokes":[{"id":"a","width":500,"points":[{"x":0,"y":0,"timestamp":1760000000000},{"x":1,"y":1,"timestamp":1760000000001}]}]}', 'huge width')
) v(p, label);
select pg_temp.expect_code($$select pg_temp.send(pg_temp.drawing(201, 2)::text)$$, 'GC012', 'more than 200 strokes');
select pg_temp.expect_code($$select pg_temp.send(pg_temp.drawing(1, 1001)::text)$$, 'GC012', 'more than 1000 points in a stroke');
select pg_temp.expect_code($$select pg_temp.send(pg_temp.drawing(5, 801)::text)$$, 'GC012', 'more than 4000 points in all');
select pg_temp.expect_code($$select pg_temp.send(jsonb_set(pg_temp.drawing(1, 2), '{strokes,0,id}', to_jsonb(repeat('x', 300000)))::text)$$, 'GC012', 'payload over 256 KB');
select pg_temp.expect_code($$select pg_temp.send(jsonb_set(pg_temp.drawing(1, 3), '{strokes,0,points,2,timestamp}', '1760000300000')::text)$$, 'GC012', 'points spread over far longer than the round');
select pg_temp.expect_eq((select count(*)::text from public.drawings d join public.players p on p.id = d.player_id where p.display_name = 'Cy'), '0', 'none of those stored anything');
-- Extra fields are dropped, known ones kept.
select pg_temp.send('{"version":1,"score":100,"player_id":"x","strokes":[{"id":"a","color":"#8b5cf6","width":4,"evil":true,"points":[{"x":0,"y":0,"timestamp":1760000000000,"p":9},{"x":1,"y":1,"timestamp":1760000000001}]}]}') \g /dev/null
select pg_temp.expect_eq(pg_temp.stored('00000000-0000-0000-0000-000000000052')::text,
  '{"strokes": [{"id": "a", "color": "#8b5cf6", "width": 4, "points": [{"x": 0, "y": 0, "timestamp": 1760000000000}, {"x": 1, "y": 1, "timestamp": 1760000000001}]}], "version": 1}',
  'a valid drawing is stored with only the known fields (no score, player or extras)');

-- Late submission, by the database clock, in round 2.
select pg_temp.as_user('00000000-0000-0000-0000-000000000050') \g /dev/null
select pg_temp.walk_to('ROUND_RESULTS');
select pg_temp.as_user('00000000-0000-0000-0000-000000000050') \g /dev/null
select public.host_advance(pg_temp.gid(), pg_temp.ver()) \g /dev/null
select pg_temp.walk_to('DRAWING');
select pg_temp.as_user('00000000-0000-0000-0000-000000000051') \g /dev/null
select pg_temp.expect_code(format('select public.submit_drawing(%L, pg_temp.drawing(1, 5))', (select v from t where k = 'round1')), 'GC010', 'a hand-in for an earlier round is refused');
select pg_temp.deadline_ago(2.5) \g /dev/null
select pg_temp.expect_eq((pg_temp.send(pg_temp.drawing(1, 5)::text) is not null)::text, 'true', '2.5 s after the deadline (inside the 3 s grace): accepted');
select pg_temp.as_user('00000000-0000-0000-0000-000000000052') \g /dev/null
select pg_temp.deadline_ago(3.2) \g /dev/null
select pg_temp.expect_code($$select pg_temp.send(pg_temp.drawing(1, 5)::text)$$, 'GC010', '3.2 s after the deadline: refused');
select pg_temp.expect_eq((select count(*)::text from public.drawings d join public.players p on p.id = d.player_id where d.round_id = pg_temp.rid() and p.display_name = 'Cy'), '0', 'nothing stored for the late hand-in');

-- Disconnected and reconnected: Ben's hand-in got through but the reply was lost. His retry after
-- reconnecting, now past the grace, is refused as late, and his first hand-in stands: never two, never none.
select pg_temp.as_user('00000000-0000-0000-0000-000000000051') \g /dev/null
select pg_temp.expect_code($$select pg_temp.send(pg_temp.drawing(1, 5)::text)$$, 'GC010', 'Ben''s retry after the grace is refused as late');
select pg_temp.expect_eq((select count(*)::text from public.drawings d join public.players p on p.id = d.player_id where d.round_id = pg_temp.rid() and p.display_name = 'Ben'), '1', '...and his hand-in from before stands, once');

rollback;
