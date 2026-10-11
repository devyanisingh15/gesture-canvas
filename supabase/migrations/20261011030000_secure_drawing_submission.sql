-- Gesture Canvas: secure drawing submission.
--
-- Players hand in a drawing only through public.submit_drawing(round, drawing).
-- The database decides everything else:
--
--   who      the caller's own seat in the round's game (auth.uid()); there is no
--            player argument, so nobody can hand in for someone else.
--   which    the round must be the game's current one, drawing or just timed out.
--   when     until rounds.ends_at + the hand-in grace, by the database clock.
--   what     the payload is validated (private.validated_drawing) and stored in a
--            canonical form with only the known fields.
--   once     one drawing per player per round. Resending the identical drawing (a
--            retry whose first try got through) returns the first hand-in; a
--            different one is refused with GC011.
--
-- Direct writes to public.drawings are no longer allowed for players, so the
-- function's checks can't be bypassed. Scores, rounds and games were already
-- read-only to players.
--
-- Error codes: GC005 not in this game, GC010 round not open (not started / time's
-- up), GC011 already handed in, GC012 invalid drawing (message names the problem).
--
-- Non-destructive: revokes two table privileges, drops two policies, adds a
-- function and replaces submit_drawing. No data changes.

-- ---------------------------------------------------------------------------
-- Players can't write drawings directly any more.

revoke insert, update on public.drawings from authenticated;
drop policy "Players can submit their own drawing while the round is open" on public.drawings;
drop policy "Players can replace their own drawing while the round is open" on public.drawings;

-- ---------------------------------------------------------------------------
-- Validation. Limits mirror DRAWING_LIMITS in src/features/drawing/validation.ts
-- (validation.test.ts checks they match):
--   200 strokes, 2..1000 points per stroke, 4000 points, 262144 bytes of JSON,
--   stroke ids of 1..64 characters, unique; color #rgb..#rrggbbaa; width 0.5..40;
--   x and y numbers in 0..1; timestamps numbers (epoch ms) between 1500000000000
--   and 4102444800000, never decreasing within a stroke, and all within the
--   round's length + 120000 ms of each other.

create function private.validated_drawing(p_drawing jsonb, p_draw_seconds integer) returns jsonb
language plpgsql immutable set search_path = '' as $$
declare
  v_strokes jsonb;
  v_problem text;
  v_total integer;
  v_span numeric;
  v_out jsonb;
begin
  if p_drawing is null or jsonb_typeof(p_drawing) <> 'object' then
    raise exception 'Invalid drawing: not a drawing' using errcode = 'GC012';
  end if;
  if octet_length(p_drawing::text) > 262144 then
    raise exception 'Invalid drawing: too large' using errcode = 'GC012';
  end if;
  if p_drawing -> 'version' is distinct from '1'::jsonb then
    raise exception 'Invalid drawing: unknown format version' using errcode = 'GC012';
  end if;
  v_strokes := p_drawing -> 'strokes';
  if jsonb_typeof(v_strokes) is distinct from 'array' then
    raise exception 'Invalid drawing: not a drawing' using errcode = 'GC012';
  end if;
  if jsonb_array_length(v_strokes) > 200 then
    raise exception 'Invalid drawing: more than 200 strokes' using errcode = 'GC012';
  end if;

  -- Strokes.
  select problem into v_problem from (
    select case
      when jsonb_typeof(s) <> 'object' then 'stroke is not an object'
      when jsonb_typeof(s -> 'id') is distinct from 'string' or length(s ->> 'id') not between 1 and 64 then 'bad stroke id'
      -- One test per WHEN: SQL doesn't promise to short-circuit AND/OR, CASE branches it does.
      when jsonb_typeof(s -> 'points') is distinct from 'array' then 'a stroke needs 2 to 1000 points'
      when jsonb_array_length(s -> 'points') not between 2 and 1000 then 'a stroke needs 2 to 1000 points'
      when jsonb_typeof(s -> 'color') <> 'string' then 'bad color'
      when s ->> 'color' !~ '^#[0-9a-fA-F]{3,8}$' then 'bad color'
      when jsonb_typeof(s -> 'width') <> 'number' then 'bad width'
      when jsonb_typeof(s -> 'width') = 'number' then case when (s ->> 'width')::numeric not between 0.5 and 40 then 'bad width' end
    end as problem
    from jsonb_array_elements(v_strokes) s
  ) x where problem is not null limit 1;
  if v_problem is null and (select count(distinct s ->> 'id') <> count(*) from jsonb_array_elements(v_strokes) s) then
    v_problem := 'duplicate stroke id';
  end if;
  if v_problem is not null then
    raise exception 'Invalid drawing: %', v_problem using errcode = 'GC012';
  end if;

  select coalesce(sum(jsonb_array_length(s -> 'points')), 0) into v_total from jsonb_array_elements(v_strokes) s;
  if v_total > 4000 then
    raise exception 'Invalid drawing: more than 4000 points' using errcode = 'GC012';
  end if;

  -- Points.
  select problem into v_problem from (
    select case
      when jsonb_typeof(pt) <> 'object' then 'point coordinates must be numbers'
      when jsonb_typeof(pt -> 'x') is distinct from 'number' or jsonb_typeof(pt -> 'y') is distinct from 'number'
        or jsonb_typeof(pt -> 'timestamp') is distinct from 'number' then 'point coordinates must be numbers'
      when (pt ->> 'x')::numeric not between 0 and 1 or (pt ->> 'y')::numeric not between 0 and 1 then 'point outside the canvas'
      when (pt ->> 'timestamp')::numeric not between 1500000000000 and 4102444800000 then 'bad timestamp'
      when ts < lag(ts) over (partition by si order by pi) then 'timestamps go backwards'
    end as problem
    from jsonb_array_elements(v_strokes) with ordinality st(s, si),
         jsonb_array_elements(s -> 'points') with ordinality pp(pt, pi),
         -- Only numbers are cast; the window function sees every row, valid or not.
         lateral (select case when jsonb_typeof(pt -> 'timestamp') = 'number' then (pt ->> 'timestamp')::numeric end as ts) t
  ) x where problem is not null limit 1;
  if v_problem is not null then
    raise exception 'Invalid drawing: %', v_problem using errcode = 'GC012';
  end if;

  select max((pt ->> 'timestamp')::numeric) - min((pt ->> 'timestamp')::numeric) into v_span
    from jsonb_array_elements(v_strokes) s, jsonb_array_elements(s -> 'points') pt;
  if v_span > p_draw_seconds * 1000 + 120000 then
    raise exception 'Invalid drawing: timestamps span longer than the round' using errcode = 'GC012';
  end if;

  -- Canonical copy: only the known fields, in order.
  select jsonb_build_object('version', 1, 'strokes', coalesce(jsonb_agg(
           jsonb_strip_nulls(jsonb_build_object(
             'id', s -> 'id', 'color', s -> 'color', 'width', s -> 'width',
             'points', (select jsonb_agg(jsonb_build_object('x', pt -> 'x', 'y', pt -> 'y', 'timestamp', pt -> 'timestamp') order by pi)
                          from jsonb_array_elements(s -> 'points') with ordinality pp(pt, pi))))
           order by si), '[]'::jsonb))
    into v_out
    from jsonb_array_elements(v_strokes) with ordinality st(s, si);
  return v_out;
end;
$$;

revoke all on function private.validated_drawing(jsonb, integer) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Hands in the caller's drawing for a round, once. Returns when the database stored it.

create or replace function public.submit_drawing(p_round_id uuid, p_strokes jsonb) returns timestamptz
language plpgsql security definer set search_path = '' as $$
declare
  v_round public.rounds%rowtype;
  v_game public.games%rowtype;
  v_player uuid;
  v_drawing jsonb;
  v_existing public.drawings%rowtype;
  v_at timestamptz;
begin
  -- Who: the caller's own seat in this round's game. The round id only picks the round.
  select * into v_round from public.rounds where id = p_round_id;
  select p.id into v_player from public.players p
   where p.game_id = v_round.game_id and p.user_id = (select auth.uid());
  if v_round.id is null or v_player is null then
    raise exception 'You''re not in this game' using errcode = 'GC005';
  end if;

  -- Which and when: the game's current round, by the database clock.
  select * into v_game from public.games where id = v_round.game_id;
  if v_round.round_number = v_game.current_round and v_round.status in ('SPINNING', 'REVEALED') then
    raise exception 'Drawing hasn''t started yet' using errcode = 'GC010';
  end if;
  if v_round.round_number <> v_game.current_round or v_round.status not in ('DRAWING', 'TIME_UP') or v_round.ends_at is null
     or now() > v_round.ends_at + make_interval(secs => private.submit_grace_ms() / 1000.0) then
    raise exception 'Time''s up: this round no longer takes drawings' using errcode = 'GC010';
  end if;

  -- What.
  v_drawing := private.validated_drawing(p_strokes, v_game.draw_seconds);

  -- Once.
  insert into public.drawings (round_id, player_id, strokes)
  values (p_round_id, v_player, v_drawing)
  on conflict (round_id, player_id) do nothing
  returning submitted_at into v_at;
  if v_at is not null then
    return v_at;
  end if;
  select * into v_existing from public.drawings where round_id = p_round_id and player_id = v_player;
  if v_existing.strokes = v_drawing then
    return v_existing.submitted_at; -- the same hand-in again (a retry): already stored
  end if;
  raise exception 'You''ve already handed in a drawing for this round' using errcode = 'GC011';
end;
$$;

revoke all on function public.submit_drawing(uuid, jsonb) from public, anon;
grant execute on function public.submit_drawing(uuid, jsonb) to authenticated;
