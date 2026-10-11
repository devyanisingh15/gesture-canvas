-- Gesture Canvas: timed drawing rounds, drawing hand-in and scores.
--
-- The database already sets each round's start and end time (rounds.started_at,
-- rounds.ends_at; games.phase_ends_at while DRAWING). This migration makes
-- those timestamps decide everything else:
--
--   submit_drawing(round, strokes)   a player hands in (or saves) their drawing.
--                                    Accepted only for the current round, and only
--                                    until rounds.ends_at + the hand-in grace, by the
--                                    database clock. Later attempts fail with GC010.
--   request_evaluation(round)        a player asks for the round to be scored. True when
--                                    the round is in EVALUATING and has no scores yet.
--   evaluation_batch(round)          server only (service_role): the prompt and every
--   record_scores(round, scores)     drawing; then the scores, stored once.
--
-- Scoring itself runs on the app server (src/app/api/rounds/[roundId]/evaluate),
-- with the swappable DrawingEvaluator. Players can't write scores. If no
-- server ever records them, EVALUATING still ends after 20 s with zeros.
--
-- Also: drawing time defaults to 45 s, and create_game can set it.
--
-- Non-destructive: changes a column default, adds a nullable column, adds
-- functions, and replaces two functions with stricter or extended versions.

-- ---------------------------------------------------------------------------
-- MVP configuration: 5 rounds (already the default), 45 s of drawing.

alter table public.games alter column draw_seconds set default 45;

-- create_game with a drawing time. The two-argument version stays as it was.
create function public.create_game(p_display_name text, p_total_rounds integer, p_draw_seconds integer)
returns table (game_id uuid, player_id uuid, room_code text)
language plpgsql security definer set search_path = '' as $$
declare
  v_game uuid;
  v_player uuid;
  v_code text;
begin
  if p_draw_seconds is null or p_draw_seconds not between 10 and 180 then
    raise exception 'Drawing time must be between 10 and 180 seconds' using errcode = '22023';
  end if;
  select c.game_id, c.player_id, c.room_code into v_game, v_player, v_code
    from public.create_game(p_display_name, p_total_rounds) c;
  update public.games set draw_seconds = p_draw_seconds where id = v_game and status = 'LOBBY';
  return query select v_game, v_player, v_code;
end;
$$;

revoke all on function public.create_game(text, integer, integer) from public, anon;
grant execute on function public.create_game(text, integer, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- Handing in drawings, by the database clock.

-- A drawing finished at the deadline still needs a moment to arrive. It is
-- accepted up to this long after rounds.ends_at (state.ts SUBMIT_GRACE_MS),
-- which is also how long TIME_UP lasts.
create function private.submit_grace_ms() returns integer
language sql immutable set search_path = '' as $$ select 3000 $$;

-- Open for drawings: the round is drawing or just timed out, and its deadline
-- (plus the grace) hasn't passed. Replaces the status-only check, so direct
-- inserts and updates under RLS follow the same clock.
create or replace function private.round_is_open_to_me(p_round_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.rounds r
     where r.id = p_round_id and r.status in ('DRAWING', 'TIME_UP')
       and r.ends_at is not null
       and now() <= r.ends_at + make_interval(secs => private.submit_grace_ms() / 1000.0)
       and private.is_game_member(r.game_id)
  )
$$;

-- Hands in (or replaces) the caller's drawing for a round. Returns when the
-- database stored it.
create function public.submit_drawing(p_round_id uuid, p_strokes jsonb) returns timestamptz
language plpgsql security definer set search_path = '' as $$
declare
  v_round public.rounds%rowtype;
  v_current integer;
  v_player uuid;
  v_at timestamptz;
begin
  select * into v_round from public.rounds where id = p_round_id;
  select p.id into v_player from public.players p
   where p.game_id = v_round.game_id and p.user_id = (select auth.uid());
  if v_round.id is null or v_player is null then
    raise exception 'You''re not in this game' using errcode = 'GC005';
  end if;
  select g.current_round into v_current from public.games g where g.id = v_round.game_id;
  if v_round.round_number = v_current and v_round.status in ('SPINNING', 'REVEALED') then
    raise exception 'Drawing hasn''t started yet' using errcode = 'GC010';
  end if;
  if v_round.round_number <> v_current or v_round.status not in ('DRAWING', 'TIME_UP') or v_round.ends_at is null
     or now() > v_round.ends_at + make_interval(secs => private.submit_grace_ms() / 1000.0) then
    raise exception 'Time''s up: this round no longer takes drawings' using errcode = 'GC010';
  end if;
  insert into public.drawings (round_id, player_id, strokes)
  values (p_round_id, v_player, p_strokes)
  on conflict (round_id, player_id) do update set strokes = excluded.strokes
  returning submitted_at into v_at;
  return v_at;
end;
$$;

revoke all on function public.submit_drawing(uuid, jsonb) from public, anon;
grant execute on function public.submit_drawing(uuid, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- Scores

-- The evaluator's breakdown (shape, structure, completeness, composition).
alter table public.scores add column breakdown jsonb check (breakdown is null or jsonb_typeof(breakdown) = 'object');

-- Any player in the game: does this round need scoring now?
create function public.request_evaluation(p_round_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.rounds r join public.games g on g.id = r.game_id
     where r.id = p_round_id and g.status = 'EVALUATING' and r.round_number = g.current_round
       and private.is_game_member(g.id)
       and not exists (select 1 from public.scores s where s.round_id = r.id)
  )
$$;

revoke all on function public.request_evaluation(uuid) from public, anon;
grant execute on function public.request_evaluation(uuid) to authenticated;

-- Server only: what the evaluator needs for a round in EVALUATING. Null otherwise.
create function public.evaluation_batch(p_round_id uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'round_id', r.id,
    'prompt', r.prompt,
    'players', coalesce((select jsonb_agg(p.id order by p.joined_at) from public.players p where p.game_id = g.id), '[]'::jsonb),
    'drawings', coalesce((select jsonb_agg(jsonb_build_object('player_id', d.player_id, 'strokes', d.strokes))
                            from public.drawings d where d.round_id = r.id), '[]'::jsonb))
    from public.rounds r join public.games g on g.id = r.game_id
   where r.id = p_round_id and g.status = 'EVALUATING' and r.round_number = g.current_round
$$;

-- Server only: stores a round's scores, once. p_scores is
-- [{ "player_id": uuid, "score": 0-100, "breakdown": {...} }]. Players the list
-- leaves out get 0. Then EVALUATING ends as soon as its minimum time is up.
-- Returns false if the round isn't being evaluated or already has scores.
create function public.record_scores(p_round_id uuid, p_scores jsonb) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_game public.games%rowtype;
  v_round public.rounds%rowtype;
begin
  select * into v_round from public.rounds where id = p_round_id;
  if v_round.id is null then
    return false;
  end if;
  select * into v_game from public.games where id = v_round.game_id for update;
  if v_game.status <> 'EVALUATING' or v_round.round_number <> v_game.current_round
     or exists (select 1 from public.scores s where s.round_id = p_round_id) then
    return false;
  end if;

  insert into public.scores (round_id, player_id, score, breakdown)
  select p_round_id, p.id,
         coalesce(least(100, greatest(0, round((x ->> 'score')::numeric)))::integer, 0),
         case when jsonb_typeof(x -> 'breakdown') = 'object' then x -> 'breakdown' end
    from public.players p
    left join jsonb_array_elements(case when jsonb_typeof(p_scores) = 'array' then p_scores else '[]'::jsonb end) x
      on (x ->> 'player_id') = p.id::text
   where p.game_id = v_game.id
  on conflict (round_id, player_id) do nothing;

  -- Scores are in: results as soon as the evaluating screen has had its minimum time.
  update public.games
     set phase_ends_at = greatest(now(), phase_started_at + make_interval(secs => private.phase_ms('EVALUATING_MIN') / 1000.0)),
         state_version = state_version + 1
   where id = v_game.id;
  return true;
end;
$$;

revoke all on function public.evaluation_batch(uuid), public.record_scores(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.evaluation_batch(uuid), public.record_scores(uuid, jsonb) to service_role;

-- ---------------------------------------------------------------------------
-- get_game_state, now with each score's breakdown. Otherwise unchanged.
create or replace function public.get_game_state(p_game_id uuid) returns jsonb
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
        'round_id', s.round_id, 'player_id', s.player_id, 'score', s.score, 'breakdown', s.breakdown))
      from public.scores s join public.rounds r on r.id = s.round_id where r.game_id = p_game_id), '[]'::jsonb)
  )
$$;
