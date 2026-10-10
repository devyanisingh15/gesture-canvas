-- Checks the RLS policies and constraints. Run against a throwaway local Postgres:
--   createdb gc_test && psql -d gc_test -f supabase/tests/local_supabase_stub.sql
--   psql -d gc_test -f supabase/migrations/20261010000000_initial_schema.sql
--   psql -d gc_test -q -t -A -f supabase/tests/rls_test.sql
-- Every line should start with PASS; the last check (host from another game) ends with a foreign key error.
\set ON_ERROR_STOP 1
-- Fixture: written as service_role (the game server).
insert into auth.users values ('00000000-0000-0000-0000-0000000000a1'), ('00000000-0000-0000-0000-0000000000a2'), ('00000000-0000-0000-0000-0000000000a3');
set role service_role;
begin;
insert into games (id, code, host_player_id) values ('10000000-0000-0000-0000-000000000001', 'PX7K2Q', '20000000-0000-0000-0000-000000000001');
insert into players (id, game_id, user_id, display_name, is_ready) values
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', 'Ann', true),
  ('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a2', 'Ben', true);
commit;
begin;
insert into games (id, code, host_player_id) values ('10000000-0000-0000-0000-000000000002', 'ZZZZZ2', '20000000-0000-0000-0000-000000000003');
insert into players (id, game_id, user_id, display_name) values ('20000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000a3', 'Cat');
commit;
update games set status = 'drawing', current_round = 1, current_prompt = 'rocket' where code = 'PX7K2Q';
insert into rounds (id, game_id, round_number, prompt, status, drawing_started_at, drawing_ends_at) values
  ('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 1, 'rocket', 'drawing', now(), now() + interval '60 seconds');
insert into drawings (game_id, round_id, player_id, strokes) values
  ('10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '{"version":1,"strokes":[]}'),
  ('10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000002', '{"version":1,"strokes":[]}');
insert into scores (game_id, round_id, player_id, shape_score, structure_score, completeness_score, composition_score, total_score) values
  ('10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 90, 80, 70, 60, 75),
  ('10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000002', 50, 50, 50, 50, 50);
reset role;

create or replace function pg_temp.expect_fail(stmt text, label text) returns text language plpgsql as $$
begin
  execute stmt;
  return 'FAIL  ' || label || ' (statement succeeded)';
exception when others then
  return 'PASS  ' || label || '  [' || sqlstate || ' ' || left(sqlerrm, 70) || ']';
end $$;
create or replace function pg_temp.expect_rows(stmt text, want int, label text) returns text language plpgsql as $$
declare n int;
begin
  execute 'select count(*) from (' || stmt || ') q' into n;
  return case when n = want then 'PASS  ' else 'FAIL  ' end || label || '  (rows: ' || n || ', expected ' || want || ')';
end $$;
grant execute on all functions in schema pg_temp to anon, authenticated;

-- As Ben (guest in PX7K2Q), while round 1 is DRAWING.
begin;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a2';
select pg_temp.expect_rows('select 1 from games', 1, 'Ben sees only his own game');
select pg_temp.expect_rows('select id, display_name, total_score, is_ready from players', 2, 'Ben sees the 2 players in his game (not Cat)');
select pg_temp.expect_fail('select user_id from players', 'Ben cannot read players.user_id');
select pg_temp.expect_fail('select * from players', 'select * on players is refused (user_id hidden)');
select pg_temp.expect_rows('select 1 from rounds', 1, 'Ben sees his game''s round');
select pg_temp.expect_rows('select 1 from drawings', 1, 'During drawing Ben sees only his own drawing');
select pg_temp.expect_rows('select 1 from drawings where player_id = ''20000000-0000-0000-0000-000000000001''', 0, 'Ben cannot see Ann''s drawing yet');
select pg_temp.expect_rows('select 1 from scores', 0, 'No scores visible before the round is scored');
select pg_temp.expect_fail('update games set status = ''final_results''', 'Ben cannot change game state');
select pg_temp.expect_fail('update rounds set status = ''scored''', 'Ben cannot change round state');
select pg_temp.expect_fail('update scores set total_score = 100', 'Ben cannot change scores');
select pg_temp.expect_fail('insert into scores (game_id, round_id, player_id, shape_score, structure_score, completeness_score, composition_score, total_score) values (''10000000-0000-0000-0000-000000000001'', ''30000000-0000-0000-0000-000000000001'', ''20000000-0000-0000-0000-000000000002'', 100,100,100,100,100)', 'Ben cannot insert a score');
select pg_temp.expect_fail('update players set total_score = 999, is_ready = false', 'Ben cannot edit player rows (even his own)');
select pg_temp.expect_fail('update drawings set strokes = ''{"version":1,"strokes":[]}''', 'Ben cannot edit drawings');
select pg_temp.expect_fail('delete from games', 'Ben cannot delete games');
select pg_temp.expect_fail('insert into games (code, host_player_id) values (''AAAAAA'', ''20000000-0000-0000-0000-000000000002'')', 'Ben cannot create games directly');
rollback;

-- Round moves to evaluating, then scored.
set role service_role;
update rounds set status = 'evaluating' where id = '30000000-0000-0000-0000-000000000001';
reset role;
begin;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a2';
select pg_temp.expect_rows('select 1 from drawings', 2, 'Once drawing closes Ben sees both drawings');
select pg_temp.expect_rows('select 1 from scores', 0, 'Scores still hidden while evaluating');
rollback;
set role service_role;
update rounds set status = 'scored' where id = '30000000-0000-0000-0000-000000000001';
reset role;
begin;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a2';
select pg_temp.expect_rows('select 1 from scores', 2, 'Scores visible once the round is scored');
select pg_temp.expect_rows('select 1 from players where total_score > 0', 2, 'total_score kept in sync by the trigger');
rollback;

-- Cat (another game) and anonymous visitors.
begin;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a3';
select pg_temp.expect_rows('select 1 from games where code = ''PX7K2Q''', 0, 'Outsider cannot find PX7K2Q');
select pg_temp.expect_rows('select id from players where game_id = ''10000000-0000-0000-0000-000000000001''', 0, 'Outsider sees no players of PX7K2Q');
select pg_temp.expect_rows('select 1 from drawings', 0, 'Outsider sees no drawings');
select pg_temp.expect_rows('select 1 from scores', 0, 'Outsider sees no scores');
rollback;
begin;
set local role anon;
select pg_temp.expect_fail('select 1 from games', 'Signed-out visitors cannot read games');
select pg_temp.expect_fail('select id from players', 'Signed-out visitors cannot read players');
rollback;

-- Integrity, as the server.
set role service_role;
select pg_temp.expect_fail('insert into games (code, host_player_id) values (''PX7K2Q'', gen_random_uuid())', 'Duplicate game code rejected');
select pg_temp.expect_fail('insert into games (code, host_player_id) values (''px7k2o'', gen_random_uuid())', 'Malformed code rejected (lowercase / O)');
select pg_temp.expect_fail('insert into players (game_id, user_id, display_name) values (''10000000-0000-0000-0000-000000000001'', ''00000000-0000-0000-0000-0000000000a3'', ''ann'')', 'Name clash ignoring case rejected');
select pg_temp.expect_fail('insert into players (game_id, user_id, display_name) values (''10000000-0000-0000-0000-000000000001'', ''00000000-0000-0000-0000-0000000000a2'', ''Ben2'')', 'Same user cannot take two seats');
select pg_temp.expect_fail('insert into drawings (game_id, round_id, player_id, strokes) values (''10000000-0000-0000-0000-000000000001'', ''30000000-0000-0000-0000-000000000001'', ''20000000-0000-0000-0000-000000000003'', ''{"version":1,"strokes":[]}'')', 'Drawing by a player from another game rejected');
select pg_temp.expect_fail('insert into drawings (game_id, round_id, player_id, strokes) values (''10000000-0000-0000-0000-000000000001'', ''30000000-0000-0000-0000-000000000001'', ''20000000-0000-0000-0000-000000000001'', ''{"version":1,"strokes":[]}'')', 'Second drawing per player per round rejected');
select pg_temp.expect_fail('insert into drawings (game_id, round_id, player_id, strokes) values (''10000000-0000-0000-0000-000000000002'', ''30000000-0000-0000-0000-000000000001'', ''20000000-0000-0000-0000-000000000003'', ''{"strokes":"x"}'')', 'Malformed stroke data rejected');
select pg_temp.expect_fail('update scores set total_score = 101', 'Scores above 100 rejected');
select pg_temp.expect_fail('insert into rounds (game_id, round_number, prompt) values (''10000000-0000-0000-0000-000000000001'', 1, ''rocket'')', 'Duplicate round number rejected');
select pg_temp.expect_fail('insert into rounds (game_id, round_number, prompt) values (''10000000-0000-0000-0000-000000000001'', 2, ''dragon'')', 'Prompt outside the list rejected');
select pg_temp.expect_fail('update games set current_round = 9 where code = ''PX7K2Q''', 'current_round beyond total_rounds rejected');
select pg_temp.expect_fail('update games set host_player_id = ''20000000-0000-0000-0000-000000000003'' where code = ''PX7K2Q''', 'Host from another game rejected');
reset role;
