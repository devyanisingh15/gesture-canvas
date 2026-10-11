-- Gesture Canvas: round results and the final leaderboard, from the database.
--
-- public.get_standings(game) is the leaderboard: each player's total over the
-- game's completed rounds, their score in the latest completed round, and their
-- rank now and before that round. get_game_state includes it, so every player
-- gets the same leaderboard with every state change (Realtime tells clients
-- to re-read the state); browsers only display it.
--
-- Only completed rounds count. A round becomes COMPLETED when it moves to
-- ROUND_RESULTS, after evaluation, so a round's scores never show early. It runs
-- as the caller (security invoker), so the same row-level security applies:
-- only players in the game see anything, and only completed rounds' scores.
--
-- Ties: players with the same total share a rank (1, 1, 3); among them the order
-- is fixed: earlier joiner first, then player id. The same total always gives the
-- same order, on every screen. After the last round, every rank-1 player is a winner.
--
-- Non-destructive: adds a function and replaces get_game_state with a version
-- that also returns 'standings'. No data changes.

create function public.get_standings(p_game_id uuid) returns jsonb
language sql stable security invoker set search_path = '' as $$
  with done as (
    select r.id, r.round_number from public.rounds r where r.game_id = p_game_id and r.status = 'COMPLETED'
  ),
  latest as (select max(round_number) as n, count(*) as rounds from done),
  points as (
    select p.id, p.joined_at,
           coalesce(sum(s.score), 0)::integer as total,
           coalesce(sum(s.score) filter (where d.round_number = l.n), 0)::integer as round_score,
           coalesce(sum(s.score) filter (where d.round_number < l.n), 0)::integer as before
      from public.players p
      cross join latest l
      left join public.scores s on s.player_id = p.id and s.round_id in (select id from done)
      left join done d on d.id = s.round_id
     where p.game_id = p_game_id
     group by p.id, p.joined_at, l.n
  ),
  ranked as (
    select *, rank() over (order by total desc) as rank,
           case when (select rounds from latest) > 1 then rank() over (order by before desc) end as previous_rank
      from points
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'player_id', id, 'total', total, 'round_score', round_score, 'rank', rank, 'previous_rank', previous_rank,
           'rounds_counted', (select rounds from latest))
           order by total desc, joined_at, id), '[]'::jsonb)
    from ranked
$$;

revoke all on function public.get_standings(uuid) from public, anon;
grant execute on function public.get_standings(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- get_game_state, now with the standings. Otherwise unchanged.
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
      from public.scores s join public.rounds r on r.id = s.round_id where r.game_id = p_game_id), '[]'::jsonb),
    'standings', public.get_standings(p_game_id)
  )
$$;
