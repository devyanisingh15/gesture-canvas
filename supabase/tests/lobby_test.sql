-- Checks the lobby functions and the Realtime channel policies. Run against a throwaway local
-- Postgres, never a real project, after local_supabase_stub.sql and every migration:
--   psql -d gc_test -q -t -A -f supabase/tests/lobby_test.sql
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
-- What Realtime does to authorize a channel: as the user, with realtime.topic set, try to
-- write a message and read it back, then undo.
create function pg_temp.channel_access(p_topic text, p_extension text) returns text language plpgsql as $$
declare can_write boolean := false; can_read boolean := false;
begin
  perform set_config('realtime.topic', p_topic, true);
  begin
    insert into realtime.messages (topic, extension, event) values (p_topic, p_extension, 'probe');
    can_write := true;
    can_read := exists (select 1 from realtime.messages where topic = p_topic and extension = p_extension);
    raise exception using errcode = 'GCX00';  -- undo the probe row
  exception when sqlstate 'GCX00' then null;
            when insufficient_privilege then null;
  end;
  if not can_write then
    can_read := exists (select 1 from realtime.messages where topic = p_topic and extension = p_extension);
  end if;
  return case when can_read then 'read' else '-' end || '/' || case when can_write then 'write' else '-' end;
end $$;
create function pg_temp.as_user(p_user text) returns void language sql as $$
  select set_config('request.jwt.claim.sub', p_user, true) $$;
grant execute on all functions in schema pg_temp to anon, authenticated;

insert into auth.users
select ('00000000-0000-0000-0000-0000000000' || n)::uuid from generate_series(20, 24) n;
create temp table t (k text primary key, v text);
grant all on t to authenticated;

set local role authenticated;
-- Maya (20) hosts, Ben (21) joins, Cat (22) is not in the game.
select pg_temp.as_user('00000000-0000-0000-0000-000000000020') \g /dev/null
insert into t select 'game', game_id::text from public.create_game('Maya', 3);
insert into t select 'code', room_code from public.games;
select pg_temp.as_user('00000000-0000-0000-0000-000000000021') \g /dev/null
insert into t select 'ben', player_id::text from public.join_game((select v from t where k = 'code'), 'Ben');
insert into t values ('topic', 'game:' || (select v from t where k = 'game'));

-- Channel access
select pg_temp.expect_eq(pg_temp.channel_access((select v from t where k = 'topic'), 'presence'), 'read/write', 'member can use presence on the game channel');
select pg_temp.expect_eq(pg_temp.channel_access((select v from t where k = 'topic'), 'broadcast'), 'read/write', 'member can broadcast on the game channel');
select pg_temp.expect_eq(pg_temp.channel_access((select v from t where k = 'topic'), 'postgres_changes'), '-/-', 'no database change streams on the channel');
select pg_temp.expect_eq(pg_temp.channel_access('game:not-a-uuid', 'broadcast'), '-/-', 'malformed topic denied');
select pg_temp.expect_eq(pg_temp.channel_access('lobby', 'broadcast'), '-/-', 'other topics denied');
select pg_temp.as_user('00000000-0000-0000-0000-000000000022') \g /dev/null
select pg_temp.expect_eq(pg_temp.channel_access((select v from t where k = 'topic'), 'presence'), '-/-', 'non-member cannot join the channel');
select pg_temp.expect_code(format('select public.touch_seat(%L)', (select v from t where k = 'game')), 'GC005', 'non-member cannot heartbeat');
select pg_temp.expect_code(format('select public.start_game(%L)', (select v from t where k = 'game')), 'GC005', 'non-member cannot start');
select pg_temp.expect_code(format('select public.leave_game(%L)', (select v from t where k = 'game')), 'GC005', 'non-member cannot leave');

-- Heartbeat uses the server clock.
reset role;
update public.players set last_seen_at = now() - interval '10 minutes';
set local role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-000000000021') \g /dev/null
select public.touch_seat((select v from t where k = 'game')::uuid) \g /dev/null
select pg_temp.expect_eq((select (last_seen_at > now() - interval '5 seconds')::text from public.players where id = (select v from t where k = 'ben')::uuid), 'true', 'heartbeat updates last_seen_at');

-- Starting
select pg_temp.expect_code(format('select public.start_game(%L)', (select v from t where k = 'game')), 'GC006', 'guest cannot start the game');
select pg_temp.as_user('00000000-0000-0000-0000-000000000020') \g /dev/null
select pg_temp.expect_code(format('select public.start_game(%L)', (select v from t where k = 'game')), 'GC007', 'host alone (Maya stale) cannot start');
select public.touch_seat((select v from t where k = 'game')::uuid) \g /dev/null
select pg_temp.expect_code($$update public.games set status = 'STARTING'$$, '42501', 'host cannot set status directly');
select pg_temp.expect_eq(public.start_game((select v from t where k = 'game')::uuid), 'STARTING', 'host starts with 2 active players');
select pg_temp.expect_eq((select status from public.games), 'STARTING', 'game is STARTING');
select pg_temp.expect_code(format('select public.start_game(%L)', (select v from t where k = 'game')), 'GC002', 'cannot start twice');
select pg_temp.as_user('00000000-0000-0000-0000-000000000021') \g /dev/null
select pg_temp.expect_code(format('select public.leave_game(%L)', (select v from t where k = 'game')), 'GC002', 'cannot leave once started');
select pg_temp.expect_eq((select count(*)::text from public.players), '2', 'seat kept after refused leave');

-- Leaving a lobby: a second game.
select pg_temp.as_user('00000000-0000-0000-0000-000000000022') \g /dev/null
insert into t select 'g2', game_id::text from public.create_game('Cat', 3);
insert into t select 'c2', room_code from public.games where id = (select v from t where k = 'g2')::uuid;
select pg_temp.as_user('00000000-0000-0000-0000-000000000023') \g /dev/null
select public.join_game((select v from t where k = 'c2'), 'Dan') \g /dev/null
select pg_temp.as_user('00000000-0000-0000-0000-000000000024') \g /dev/null
select public.join_game((select v from t where k = 'c2'), 'Eve') \g /dev/null
select public.leave_game((select v from t where k = 'g2')::uuid) \g /dev/null
select pg_temp.expect_eq((select count(*)::text from public.games), '0', 'Eve can no longer read the game after leaving');
select pg_temp.expect_eq(pg_temp.channel_access('game:' || (select v from t where k = 'g2'), 'presence'), '-/-', 'Eve loses channel access after leaving');
select pg_temp.as_user('00000000-0000-0000-0000-000000000022') \g /dev/null
select public.leave_game((select v from t where k = 'g2')::uuid) \g /dev/null
select pg_temp.as_user('00000000-0000-0000-0000-000000000023') \g /dev/null
select pg_temp.expect_eq((select string_agg(display_name || '/' || is_host, ',') from public.players), 'Dan/true', 'host left: Dan is the new host');
select public.leave_game((select v from t where k = 'g2')::uuid) \g /dev/null
reset role;
select pg_temp.expect_eq((select count(*)::text from public.games where id = (select v from t where k = 'g2')::uuid), '0', 'last player left: game deleted');

set local role anon;
select pg_temp.expect_code($$select public.start_game(gen_random_uuid())$$, '42501', 'anon cannot call start_game');

rollback;
