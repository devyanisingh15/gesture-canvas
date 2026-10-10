-- Gesture Canvas: the authoritative game state machine.
--
-- The database owns a game's phase (games.status), its current round, each
-- round's prompt and start/end times, and when the game is complete. It
-- mirrors src/features/game/state.ts; src/features/game/state.test.ts checks
-- the transition table and phase lengths below against that file.
--
-- Players never set a phase. They can only:
--   start_game(game)                 host, in LOBBY (from the lobby migration, now timed)
--   advance_game(game, version)      anyone in the game: "the current phase is over, move on".
--                                    Refused until the phase's end time has passed.
--   host_advance(game, version)      host: end drawing early, or skip the results wait.
-- In each case the database works out the next phase itself.
--
-- Races: every change locks the game row and bumps games.state_version. A
-- caller passes the version it saw; if the game has moved on since, the call
-- does nothing and returns the current version. So when every client's timer
-- fires at once, exactly one transition happens.
--
-- A trigger also refuses any status change not in private.game_transitions,
-- whoever makes it (including the service role).
--
-- Non-destructive: adds columns with defaults, a table, functions, a trigger.

-- ---------------------------------------------------------------------------
-- Columns

alter table public.games
  add column phase_started_at timestamptz not null default now(),
  -- When the current phase ends on its own; null while waiting (LOBBY) or finished (COMPLETED).
  add column phase_ends_at    timestamptz,
  add column draw_seconds     integer not null default 60 check (draw_seconds between 10 and 180),
  -- Bumped on every phase change; callers pass the version they saw.
  add column state_version    integer not null default 0;

-- ---------------------------------------------------------------------------
-- The model

create table private.game_transitions (
  from_status text not null,
  to_status   text not null,
  primary key (from_status, to_status)
);

insert into private.game_transitions (from_status, to_status) values
  ('LOBBY', 'STARTING'),
  ('STARTING', 'WHEEL_SPINNING'), ('STARTING', 'LOBBY'), ('STARTING', 'FINAL_RESULTS'),
  ('WHEEL_SPINNING', 'TARGET_REVEALED'), ('WHEEL_SPINNING', 'FINAL_RESULTS'),
  ('TARGET_REVEALED', 'DRAWING'), ('TARGET_REVEALED', 'FINAL_RESULTS'),
  ('DRAWING', 'TIME_UP'), ('DRAWING', 'FINAL_RESULTS'),
  ('TIME_UP', 'EVALUATING'), ('TIME_UP', 'FINAL_RESULTS'),
  ('EVALUATING', 'ROUND_RESULTS'), ('EVALUATING', 'FINAL_RESULTS'),
  ('ROUND_RESULTS', 'WHEEL_SPINNING'), ('ROUND_RESULTS', 'FINAL_RESULTS'),
  ('FINAL_RESULTS', 'COMPLETED');

revoke all on private.game_transitions from public, anon, authenticated;

-- Phase lengths in ms (state.ts PHASE_DURATIONS). DRAWING uses the game's draw_seconds.
create function private.phase_ms(p_status text) returns integer
language sql immutable set search_path = '' as $$
  select case p_status
    when 'STARTING'        then 3000
    when 'WHEEL_SPINNING'  then 6000
    when 'TARGET_REVEALED' then 5000
    when 'TIME_UP'         then 3000
    when 'EVALUATING_MIN'  then 4500
    when 'EVALUATING_MAX'  then 20000
    when 'ROUND_RESULTS'   then 30000
    when 'FINAL_RESULTS'   then 60000
  end
$$;

create function private.is_final_round(p_current_round integer, p_total_rounds integer) returns boolean
language sql immutable set search_path = '' as $$
  select p_current_round >= p_total_rounds
$$;

-- Refuse any status change the model doesn't allow. Security definer so it can read the
-- table whoever makes the change (the service role has no access to the private schema).
create function private.check_game_transition() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from private.game_transitions t where t.from_status = old.status and t.to_status = new.status) then
    raise exception 'Can''t go from % to %', old.status, new.status using errcode = 'GC009';
  end if;
  return new;
end;
$$;

create trigger games_check_transition before update of status on public.games
  for each row when (old.status is distinct from new.status)
  execute function private.check_game_transition();

-- ---------------------------------------------------------------------------
-- Transitions. Each takes the locked game row and leaves it in the next phase.

create function private.enter_phase(p_game_id uuid, p_status text, p_ends_at timestamptz) returns void
language sql set search_path = '' as $$
  update public.games
     set status = p_status, phase_started_at = now(), phase_ends_at = p_ends_at, state_version = state_version + 1
   where id = p_game_id
$$;

-- Starts the next round: a prompt not used yet this game (any, once all are used), then the wheel.
create function private.start_round(p_game_id uuid) returns void
language plpgsql set search_path = '' as $$
declare
  v_round integer;
  v_prompt text;
begin
  update public.games set current_round = current_round + 1 where id = p_game_id returning current_round into v_round;
  select p into v_prompt
    from unnest(array['house', 'tree', 'sun', 'car', 'fish', 'cat', 'rocket', 'flower', 'guitar', 'airplane']) p
   order by (p in (select r.prompt from public.rounds r where r.game_id = p_game_id)), random()
   limit 1;
  insert into public.rounds (game_id, round_number, prompt, status, started_at)
  values (p_game_id, v_round, v_prompt, 'SPINNING', now());
  perform private.enter_phase(p_game_id, 'WHEEL_SPINNING', now() + make_interval(secs => private.phase_ms('WHEEL_SPINNING') / 1000.0));
end;
$$;

-- Ends drawing for the current round: time ran out, or the host ended it early.
create function private.end_round(p_game_id uuid) returns void
language plpgsql set search_path = '' as $$
begin
  -- clock_timestamp(), not now(): the real moment drawing stopped, always after the round's start.
  update public.rounds r set status = 'TIME_UP', ends_at = least(r.ends_at, clock_timestamp())
    from public.games g
   where g.id = p_game_id and r.game_id = g.id and r.round_number = g.current_round;
  perform private.enter_phase(p_game_id, 'TIME_UP', now() + make_interval(secs => private.phase_ms('TIME_UP') / 1000.0));
end;
$$;

-- After a round's results: the next round, or the final results after the last one.
create function private.next_round(p_game_id uuid) returns void
language plpgsql set search_path = '' as $$
declare
  v_game public.games%rowtype;
begin
  select * into v_game from public.games where id = p_game_id;
  if private.is_final_round(v_game.current_round, v_game.total_rounds) then
    perform private.enter_phase(p_game_id, 'FINAL_RESULTS', now() + make_interval(secs => private.phase_ms('FINAL_RESULTS') / 1000.0));
  else
    perform private.start_round(p_game_id);
  end if;
end;
$$;

-- Moves the (locked) game one step along the normal path.
create function private.step(p_game public.games) returns void
language plpgsql set search_path = '' as $$
begin
  case p_game.status
    when 'STARTING' then
      perform private.start_round(p_game.id);
    when 'WHEEL_SPINNING' then
      update public.rounds set status = 'REVEALED' where game_id = p_game.id and round_number = p_game.current_round;
      perform private.enter_phase(p_game.id, 'TARGET_REVEALED', now() + make_interval(secs => private.phase_ms('TARGET_REVEALED') / 1000.0));
    when 'TARGET_REVEALED' then
      update public.rounds set status = 'DRAWING', ends_at = now() + make_interval(secs => p_game.draw_seconds)
       where game_id = p_game.id and round_number = p_game.current_round;
      perform private.enter_phase(p_game.id, 'DRAWING', now() + make_interval(secs => p_game.draw_seconds));
    when 'DRAWING' then
      perform private.end_round(p_game.id);
    when 'TIME_UP' then
      update public.rounds set status = 'EVALUATING' where game_id = p_game.id and round_number = p_game.current_round;
      -- Waits for scores up to EVALUATING_MAX; scoring can bring phase_ends_at forward.
      perform private.enter_phase(p_game.id, 'EVALUATING', now() + make_interval(secs => private.phase_ms('EVALUATING_MAX') / 1000.0));
    when 'EVALUATING' then
      -- Missing scores count as zero, then results (drawings and scores) become visible.
      insert into public.scores (round_id, player_id, score)
      select r.id, p.id, 0
        from public.rounds r join public.players p on p.game_id = r.game_id
       where r.game_id = p_game.id and r.round_number = p_game.current_round
      on conflict (round_id, player_id) do nothing;
      update public.rounds set status = 'COMPLETED' where game_id = p_game.id and round_number = p_game.current_round;
      perform private.enter_phase(p_game.id, 'ROUND_RESULTS', now() + make_interval(secs => private.phase_ms('ROUND_RESULTS') / 1000.0));
    when 'ROUND_RESULTS' then
      perform private.next_round(p_game.id);
    when 'FINAL_RESULTS' then
      perform private.enter_phase(p_game.id, 'COMPLETED', null);
    else
      raise exception 'Nothing comes after %', p_game.status using errcode = 'GC009';
  end case;
end;
$$;

revoke all on all functions in schema private from public;
grant execute on all functions in schema private to authenticated;
revoke execute on function private.enter_phase(uuid, text, timestamptz), private.start_round(uuid), private.end_round(uuid),
  private.next_round(uuid), private.step(public.games), private.check_game_transition() from authenticated;

-- ---------------------------------------------------------------------------
-- What players call

-- Locks the caller's game and checks the version they saw. Returns the game row,
-- or null if the game moved on (the caller should re-read it).
create function private.lock_for_change(p_game_id uuid, p_expected_version integer, p_host_only boolean) returns public.games
language plpgsql set search_path = '' as $$
declare
  v_game public.games%rowtype;
  v_is_host boolean;
begin
  select * into v_game from public.games where id = p_game_id for update;
  select p.is_host into v_is_host from public.players p where p.game_id = p_game_id and p.user_id = (select auth.uid());
  if v_is_host is null then
    raise exception 'You''re not in this game' using errcode = 'GC005';
  end if;
  if p_host_only and not v_is_host then
    raise exception 'Only the host can do that' using errcode = 'GC006';
  end if;
  if v_game.state_version <> p_expected_version then
    return null;
  end if;
  return v_game;
end;
$$;
revoke execute on function private.lock_for_change(uuid, integer, boolean) from authenticated;

-- "The current phase is over": moves the game on if its end time has passed.
-- Safe to call from every client at once; returns whether this call moved it.
create function public.advance_game(p_game_id uuid, p_expected_version integer)
returns table (advanced boolean, state_version integer)
language plpgsql security definer set search_path = '' as $$
declare
  v_game public.games%rowtype;
  v_due boolean;
begin
  v_game := private.lock_for_change(p_game_id, p_expected_version, false);
  if v_game.id is null then
    return query select false, g.state_version from public.games g where g.id = p_game_id;
    return;
  end if;
  v_due := v_game.phase_ends_at is not null and now() >= v_game.phase_ends_at;
  if v_due and v_game.status = 'EVALUATING' then
    -- Scores may have arrived early, but the screen still gets its minimum time.
    v_due := now() >= v_game.phase_started_at + make_interval(secs => private.phase_ms('EVALUATING_MIN') / 1000.0);
  end if;
  if not v_due then
    return query select false, v_game.state_version;
    return;
  end if;
  perform private.step(v_game);
  return query select true, g.state_version from public.games g where g.id = p_game_id;
end;
$$;

-- Host shortcuts: end drawing now, or go on from the results without waiting.
create function public.host_advance(p_game_id uuid, p_expected_version integer)
returns table (advanced boolean, state_version integer)
language plpgsql security definer set search_path = '' as $$
declare
  v_game public.games%rowtype;
begin
  v_game := private.lock_for_change(p_game_id, p_expected_version, true);
  if v_game.id is null then
    return query select false, g.state_version from public.games g where g.id = p_game_id;
    return;
  end if;
  if v_game.status not in ('DRAWING', 'ROUND_RESULTS') then
    raise exception 'You can''t skip ahead right now' using errcode = 'GC008';
  end if;
  perform private.step(v_game);
  return query select true, g.state_version from public.games g where g.id = p_game_id;
end;
$$;

-- start_game, now with the STARTING countdown. Same checks as before.
create or replace function public.start_game(p_game_id uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := (select auth.uid());
  v_status text;
  v_is_host boolean;
begin
  select g.status into v_status from public.games g where g.id = p_game_id for update;
  select p.is_host into v_is_host from public.players p where p.game_id = p_game_id and p.user_id = v_user;
  if v_is_host is null then
    raise exception 'You''re not in this game' using errcode = 'GC005';
  end if;
  if not v_is_host then
    raise exception 'Only the host can start the game' using errcode = 'GC006';
  end if;
  if v_status <> 'LOBBY' then
    raise exception 'This game has already started' using errcode = 'GC002';
  end if;
  if (select count(*) from public.players p
       where p.game_id = p_game_id and p.last_seen_at > now() - interval '60 seconds') < 2 then
    raise exception 'You need at least 2 players in the lobby to start' using errcode = 'GC007';
  end if;

  perform private.enter_phase(p_game_id, 'STARTING', now() + make_interval(secs => private.phase_ms('STARTING') / 1000.0));
  return 'STARTING';
end;
$$;

-- Everything a player may see about their game, in one consistent read, with the
-- database clock for countdowns. Runs as the caller, so RLS decides what's in it:
-- other players' drawings and all scores only appear once a round is COMPLETED.
-- Returns null for a game the caller isn't in.
create function public.get_game_state(p_game_id uuid) returns jsonb
language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'server_time', now(),
    'game', (select jsonb_build_object(
        'id', g.id, 'room_code', g.room_code, 'status', g.status,
        'current_round', g.current_round, 'total_rounds', g.total_rounds, 'draw_seconds', g.draw_seconds,
        'phase_started_at', g.phase_started_at, 'phase_ends_at', g.phase_ends_at, 'state_version', g.state_version)
      from public.games g where g.id = p_game_id),
    'players', coalesce((select jsonb_agg(jsonb_build_object(
        'id', p.id, 'display_name', p.display_name, 'is_host', p.is_host, 'joined_at', p.joined_at, 'last_seen_at', p.last_seen_at)
        order by p.joined_at, p.id)
      from public.players p where p.game_id = p_game_id), '[]'::jsonb),
    'rounds', coalesce((select jsonb_agg(jsonb_build_object(
        'id', r.id, 'round_number', r.round_number, 'prompt', r.prompt, 'status', r.status,
        'started_at', r.started_at, 'ends_at', r.ends_at) order by r.round_number)
      from public.rounds r where r.game_id = p_game_id), '[]'::jsonb),
    'drawings', coalesce((select jsonb_agg(jsonb_build_object(
        'round_id', d.round_id, 'player_id', d.player_id, 'strokes', d.strokes, 'submitted_at', d.submitted_at))
      from public.drawings d join public.rounds r on r.id = d.round_id where r.game_id = p_game_id), '[]'::jsonb),
    'scores', coalesce((select jsonb_agg(jsonb_build_object(
        'round_id', s.round_id, 'player_id', s.player_id, 'score', s.score))
      from public.scores s join public.rounds r on r.id = s.round_id where r.game_id = p_game_id), '[]'::jsonb)
  )
$$;

revoke all on function public.advance_game(uuid, integer), public.host_advance(uuid, integer), public.get_game_state(uuid) from public, anon;
grant execute on function public.advance_game(uuid, integer), public.host_advance(uuid, integer), public.get_game_state(uuid) to authenticated;
