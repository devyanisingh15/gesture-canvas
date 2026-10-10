-- Checks the RLS policies and constraints. Run against a throwaway local Postgres, never a real project:
--   createdb gc_test && psql -d gc_test -f supabase/tests/local_supabase_stub.sql
--   psql -d gc_test -f supabase/migrations/20261010000000_initial_schema.sql
--   psql -d gc_test -q -t -A -f supabase/tests/rls_test.sql
-- Every line should start with PASS.
\set ON_ERROR_STOP 1
\set host '00000000-0000-0000-0000-0000000000a1'
\set ben  '00000000-0000-0000-0000-0000000000a2'
\set cat  '00000000-0000-0000-0000-0000000000a3'
\set dan  '00000000-0000-0000-0000-0000000000a4'
\set g1   '10000000-0000-0000-0000-000000000001'
\set g2   '10000000-0000-0000-0000-000000000002'
\set r1   '30000000-0000-0000-0000-000000000001'

create or replace function pg_temp.expect_fail(stmt text, label text) returns text language plpgsql as $$
begin
  execute stmt;
  return 'FAIL  ' || label || ' (statement succeeded)';
exception when others then
  return 'PASS  ' || label || '  [' || sqlstate || ' ' || left(sqlerrm, 60) || ']';
end $$;
create or replace function pg_temp.expect_ok(stmt text, label text) returns text language plpgsql as $$
begin
  execute stmt;
  return 'PASS  ' || label;
exception when others then
  return 'FAIL  ' || label || '  [' || sqlstate || ' ' || sqlerrm || ']';
end $$;
create or replace function pg_temp.expect_rows(stmt text, want int, label text) returns text language plpgsql as $$
declare n int;
begin
  execute 'select count(*) from (' || stmt || ') q' into n;
  return case when n = want then 'PASS  ' else 'FAIL  ' end || label || '  (rows: ' || n || ', expected ' || want || ')';
exception when others then
  return 'FAIL  ' || label || '  [' || sqlstate || ' ' || sqlerrm || ']';
end $$;
grant execute on all functions in schema pg_temp to anon, authenticated;

insert into auth.users values (:'host'), (:'ben'), (:'cat'), (:'dan');

-- The server creates two games and their hosts.
set role service_role;
insert into games (id, room_code) values (:'g1', 'PX7K2Q'), (:'g2', 'ZZZZZ2');
insert into players (game_id, user_id, display_name, is_host) values (:'g1', :'host', 'Ann', true), (:'g2', :'cat', 'Cat', true);
reset role;

-- Ben joins PX7K2Q himself.
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', :'ben', true);
select pg_temp.expect_rows('select 1 from games', 0, 'Before joining, Ben can read no games');
select pg_temp.expect_rows($$select public.find_open_lobby(' px7k2q ') where public.find_open_lobby(' px7k2q ') is not null$$, 1, 'Ben finds the open lobby by code');
select pg_temp.expect_fail($$insert into players (game_id, display_name, is_host) values ('10000000-0000-0000-0000-000000000001', 'Ben', true)$$, 'Ben cannot join as host');
select pg_temp.expect_fail($$insert into players (game_id, user_id, display_name) values ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a4', 'Dan')$$, 'Ben cannot create a seat for someone else');
select pg_temp.expect_ok($$insert into players (game_id, display_name) values ('10000000-0000-0000-0000-000000000001', 'Ben')$$, 'Ben joins the lobby as himself');
select pg_temp.expect_fail($$insert into players (game_id, display_name) values ('10000000-0000-0000-0000-000000000001', 'Ben again')$$, 'Ben cannot take a second seat');
select pg_temp.expect_rows('select 1 from games', 1, 'After joining, Ben reads his game');
select pg_temp.expect_rows('select id, display_name, is_host from players', 2, 'Ben reads both players in his game, not Cat');
select pg_temp.expect_fail('select user_id from players', 'Ben cannot read players.user_id');
select pg_temp.expect_ok($$update players set last_seen_at = now() where display_name = 'Ben'$$, 'Ben updates his own heartbeat');
select pg_temp.expect_rows($$select 1 from (select 1) x where (select count(*) from players where last_seen_at > now() - interval '1 minute') >= 1$$, 1, 'heartbeat applied');
select pg_temp.expect_fail($$update players set is_host = true where display_name = 'Ben'$$, 'Ben cannot make himself host');
select pg_temp.expect_fail($$update players set display_name = 'X' where display_name = 'Ann'$$, 'Ben cannot rename Ann');
commit;

-- Ann's heartbeat is untouched by Ben's attempt (RLS hides other rows from UPDATE).
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', :'ben', true);
update players set last_seen_at = '2000-01-01' where display_name = 'Ann';
commit;
select pg_temp.expect_rows($$select 1 from players where display_name = 'Ann' and last_seen_at > '2001-01-01'$$, 1, 'Ben cannot change Ann''s heartbeat');

-- Integrity on joining, as other users.
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', :'dan', true);
select pg_temp.expect_fail($$insert into players (game_id, display_name) values ('10000000-0000-0000-0000-000000000001', 'ann')$$, 'Name clash ignoring case rejected');
rollback;

-- The server starts the game: round 1 drawing.
set role service_role;
update games set status = 'DRAWING', current_round = 1 where id = :'g1';
insert into rounds (id, game_id, round_number, prompt, status, ends_at) values (:'r1', :'g1', 1, 'rocket', 'DRAWING', now() + interval '60 seconds');
insert into drawings (round_id, player_id, strokes) select :'r1', id, '{"version":1,"strokes":[]}' from players where display_name = 'Ann';
reset role;

begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', :'dan', true);
select pg_temp.expect_rows($$select public.find_open_lobby('PX7K2Q') where public.find_open_lobby('PX7K2Q') is not null$$, 0, 'A started game is not found as an open lobby');
select pg_temp.expect_fail($$insert into players (game_id, display_name) values ('10000000-0000-0000-0000-000000000001', 'Dan')$$, 'Nobody can join after the game starts');
rollback;

begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', :'ben', true);
select pg_temp.expect_fail($$update games set status = 'FINAL_RESULTS'$$, 'Ben cannot change game status');
select pg_temp.expect_fail($$update rounds set status = 'COMPLETED'$$, 'Ben cannot change round status');
select pg_temp.expect_fail($$insert into rounds (game_id, round_number, prompt) values ('10000000-0000-0000-0000-000000000001', 2, 'cat')$$, 'Ben cannot create rounds');
select pg_temp.expect_ok($$insert into drawings (round_id, player_id, strokes) select '30000000-0000-0000-0000-000000000001', id, '{"version":1,"strokes":[]}' from players where display_name = 'Ben'$$, 'Ben submits his own drawing while the round is open');
select pg_temp.expect_ok($$update drawings set strokes = '{"version":1,"strokes":[{"id":"a","points":[]}]}' where player_id in (select id from players where display_name = 'Ben')$$, 'Ben replaces his own drawing while open');
select pg_temp.expect_fail($$insert into drawings (round_id, player_id, strokes) select '30000000-0000-0000-0000-000000000001', id, '{"version":1,"strokes":[]}' from players where display_name = 'Ann'$$, 'Ben cannot submit a drawing as Ann');
select pg_temp.expect_rows('select 1 from drawings', 1, 'During the round Ben sees only his own drawing');
select pg_temp.expect_fail($$update drawings set player_id = player_id$$, 'Ben cannot reassign a drawing''s player');
select pg_temp.expect_fail('delete from drawings', 'Ben cannot delete drawings');
select pg_temp.expect_fail($$insert into scores (round_id, player_id, score) select '30000000-0000-0000-0000-000000000001', id, 100 from players where display_name = 'Ben'$$, 'Ben cannot give himself a score');
commit;

-- Ann's drawing is unchanged (Ben's UPDATE could not see it).
select pg_temp.expect_rows($$select 1 from drawings d join players p on p.id = d.player_id where p.display_name = 'Ann' and d.strokes = '{"version":1,"strokes":[]}'$$, 1, 'Ben cannot modify Ann''s drawing');

-- Server: time up, evaluating, scores.
set role service_role;
update rounds set status = 'EVALUATING' where id = :'r1';
insert into scores (round_id, player_id, score) select :'r1', id, case display_name when 'Ann' then 80 else 40 end from players where game_id = :'g1';
reset role;

begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', :'ben', true);
-- After close, RLS hides Ben's drawing from UPDATE, so the statement changes nothing.
update drawings set strokes = '{"version":1,"strokes":[]}' where player_id in (select id from players where display_name = 'Ben');
select pg_temp.expect_rows($$select 1 from drawings where player_id in (select id from players where display_name = 'Ben') and strokes ->> 'strokes' <> '[]'$$, 1, 'Ben cannot change his drawing after the round closes');
select pg_temp.expect_rows('select 1 from drawings', 1, 'While evaluating, other drawings stay hidden');
select pg_temp.expect_rows('select 1 from scores', 0, 'While evaluating, scores stay hidden');
select pg_temp.expect_fail('update scores set score = 100', 'Ben cannot modify scores');
rollback;

set role service_role;
update rounds set status = 'COMPLETED' where id = :'r1';
update games set status = 'ROUND_RESULTS' where id = :'g1';
reset role;

begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', :'ben', true);
select pg_temp.expect_rows('select 1 from drawings', 2, 'Once the round is complete Ben sees all drawings');
select pg_temp.expect_rows('select 1 from scores', 2, 'Once the round is complete Ben sees all scores');
rollback;

-- Outsiders and signed-out visitors.
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', :'cat', true);
select pg_temp.expect_rows($$select 1 from games where room_code = 'PX7K2Q'$$, 0, 'Cat (other game) cannot read PX7K2Q');
select pg_temp.expect_rows($$select id from players where game_id = '10000000-0000-0000-0000-000000000001'$$, 0, 'Cat cannot read PX7K2Q players');
select pg_temp.expect_rows('select 1 from drawings', 0, 'Cat cannot read PX7K2Q drawings');
select pg_temp.expect_rows('select 1 from scores', 0, 'Cat cannot read PX7K2Q scores');
rollback;
begin;
set local role anon;
select pg_temp.expect_fail('select 1 from games', 'Signed-out visitors cannot read games');
select pg_temp.expect_fail($$select public.find_open_lobby('ZZZZZ2')$$, 'Signed-out visitors cannot look up lobbies');
rollback;

-- Constraints, as the server.
set role service_role;
select pg_temp.expect_fail($$insert into games (room_code) values ('PX7K2Q')$$, 'Duplicate room code rejected');
select pg_temp.expect_fail($$insert into games (room_code) values ('px7k2o')$$, 'Malformed room code rejected');
select pg_temp.expect_fail($$insert into games (room_code, status) values ('ABCDE2', 'PAUSED')$$, 'Unknown game status rejected');
select pg_temp.expect_ok($$insert into games (room_code, status) values ('ABCDE3', 'COMPLETED')$$, 'COMPLETED status accepted');
select pg_temp.expect_fail($$update games set current_round = 9 where room_code = 'PX7K2Q'$$, 'current_round beyond total_rounds rejected');
select pg_temp.expect_fail($$insert into rounds (game_id, round_number, prompt) values ('10000000-0000-0000-0000-000000000001', 1, 'cat')$$, 'Duplicate round number rejected');
select pg_temp.expect_fail($$insert into rounds (game_id, round_number, prompt) values ('10000000-0000-0000-0000-000000000001', 2, 'dragon')$$, 'Prompt outside the list rejected');
select pg_temp.expect_fail($$insert into drawings (round_id, player_id, strokes) select '30000000-0000-0000-0000-000000000001', id, '{"version":1,"strokes":[]}' from players where display_name = 'Ben'$$, 'Second drawing per player per round rejected');
select pg_temp.expect_fail($$insert into drawings (round_id, player_id, strokes) select '30000000-0000-0000-0000-000000000001', id, '{"version":1,"strokes":[]}' from players where display_name = 'Cat'$$, 'Drawing by a player from another game rejected');
select pg_temp.expect_fail($$insert into scores (round_id, player_id, score) select '30000000-0000-0000-0000-000000000001', id, 50 from players where display_name = 'Cat'$$, 'Score for a player from another game rejected');
select pg_temp.expect_fail($$update scores set score = 101$$, 'Score above 100 rejected');
select pg_temp.expect_fail($$update scores set score = -1$$, 'Score below 0 rejected');
select pg_temp.expect_fail($$insert into scores (round_id, player_id, score) select '30000000-0000-0000-0000-000000000001', id, 50 from players where display_name = 'Ben'$$, 'Second score per player per round rejected');
select pg_temp.expect_fail($$insert into players (game_id, user_id, display_name, is_host) values ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000a4', 'Dan', true)$$, 'Second host in a game rejected');
select pg_temp.expect_fail($$insert into drawings (round_id, player_id, strokes) select '30000000-0000-0000-0000-000000000001', id, '{"strokes":"x"}' from players where display_name = 'Ann'$$, 'Malformed stroke data rejected');
reset role;

-- A full lobby refuses the 7th player.
insert into auth.users select ('00000000-0000-0000-0000-00000000000' || n)::uuid from generate_series(1, 6) n;
set role service_role;
insert into players (game_id, user_id, display_name) select :'g2', ('00000000-0000-0000-0000-00000000000' || n)::uuid, 'P' || n from generate_series(1, 5) n;
select pg_temp.expect_fail($$insert into players (game_id, user_id, display_name) values ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000006', 'P6')$$, 'Seventh player rejected (max 6)');
reset role;
