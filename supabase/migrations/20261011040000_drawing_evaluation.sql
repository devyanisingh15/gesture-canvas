-- Gesture Canvas: drawing evaluation.
--
-- Scores are computed by the app server's evaluation service
-- (src/server/evaluation/evaluationService.ts) with a swappable DrawingEvaluator,
-- and stored with public.record_scores, which only the server's secret key can
-- call. Players can read scores once a round is complete and can't write them:
-- they have no insert/update/delete on public.scores, and no execute on
-- record_scores or evaluation_batch.
--
-- This migration:
--   * stores only the evaluator's known fields in scores.breakdown:
--       { structure, completeness, composition: integers 0-100,
--         feedback: text up to 280 characters, evaluator: text up to 64 }
--     and the score as an integer 0-100 (anything else counts as 0);
--   * makes a hand-in and the round's move to EVALUATING wait for each other,
--     so the evaluator always sees every drawing that was accepted.
--
-- Evaluation only ever runs once the drawing round is over: evaluation_batch and
-- record_scores only work while the game is in EVALUATING, which begins after the
-- round's end time plus the hand-in grace.
--
-- Non-destructive: adds a function and replaces two. No data changes; rows
-- already in scores keep their breakdown.

-- ---------------------------------------------------------------------------
-- The breakdown as stored: known fields only, numbers clamped.

-- A part or total score: a JSON number, rounded and clamped to 0-100; null if not a number.
create function private.clean_score(p_value jsonb) returns integer
language sql immutable set search_path = '' as $$
  select case when jsonb_typeof(p_value) = 'number' then least(100, greatest(0, round((p_value #>> '{}')::numeric)))::integer end
$$;

create function private.clean_breakdown(p_breakdown jsonb) returns jsonb
language sql immutable set search_path = '' as $$
  select case when jsonb_typeof(p_breakdown) = 'object' then jsonb_strip_nulls(jsonb_build_object(
    'structure', private.clean_score(p_breakdown -> 'structure'),
    'completeness', private.clean_score(p_breakdown -> 'completeness'),
    'composition', private.clean_score(p_breakdown -> 'composition'),
    'feedback', case when jsonb_typeof(p_breakdown -> 'feedback') = 'string' then nullif(left(btrim(p_breakdown ->> 'feedback'), 280), '') end,
    'evaluator', case when jsonb_typeof(p_breakdown -> 'evaluator') = 'string' then nullif(left(p_breakdown ->> 'evaluator', 64), '') end
  )) end
$$;

-- ---------------------------------------------------------------------------
-- record_scores, storing clean scores and breakdowns. Otherwise unchanged.

create or replace function public.record_scores(p_round_id uuid, p_scores jsonb) returns boolean
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
  select p_round_id, p.id, coalesce(private.clean_score(x -> 'score'), 0), private.clean_breakdown(x -> 'breakdown')
    from public.players p
    left join lateral (
      -- One entry per player: the first one given.
      select e from jsonb_array_elements(case when jsonb_typeof(p_scores) = 'array' then p_scores else '[]'::jsonb end) with ordinality a(e, i)
       where jsonb_typeof(e) = 'object' and (e ->> 'player_id') = p.id::text
       order by i limit 1
    ) y(x) on true
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

revoke all on function public.record_scores(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.record_scores(uuid, jsonb) to service_role;

-- ---------------------------------------------------------------------------
-- submit_drawing, holding the round while it hands in. Otherwise unchanged.

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
  -- FOR SHARE: a hand-in and the round moving on to EVALUATING can't overlap. If the
  -- round moved on first, this reads its new status and the hand-in is refused; if
  -- the hand-in got here first, the round waits for it, so the evaluator sees it.
  select * into v_round from public.rounds where id = p_round_id for share;
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

revoke all on function private.clean_score(jsonb), private.clean_breakdown(jsonb) from public, anon, authenticated;
