-- Gesture Canvas: MVP database foundation.
--
-- Security model
--   * Players sign in with Supabase Anonymous Auth, so auth.uid() identifies
--     each browser. players.user_id links that identity to a seat in a game.
--   * The game server (Next.js route handlers) is authoritative. It writes
--     games, rounds and scores with the secret/service-role key, which
--     bypasses RLS and never reaches the browser.
--   * Players may read their own game; join an open lobby; update their own
--     heartbeat; and submit or replace their own drawing while a round is
--     open. Everything else is refused.
--
-- Non-destructive: only CREATE statements, no DROP/TRUNCATE/DELETE.

begin;

-- ---------------------------------------------------------------------------
-- Tables

create table public.games (
  id            uuid primary key default gen_random_uuid(),
  -- Six characters without look-alikes (no 0/O, 1/I). Unique forever, so a
  -- code never maps to two games; the server retries on a unique violation.
  room_code     text not null unique check (room_code ~ '^[A-HJ-NP-Z2-9]{6}$'),
  status        text not null default 'LOBBY' check (status in (
                  'LOBBY', 'STARTING', 'WHEEL_SPINNING', 'TARGET_REVEALED', 'DRAWING',
                  'TIME_UP', 'EVALUATING', 'ROUND_RESULTS', 'FINAL_RESULTS', 'COMPLETED')),
  current_round integer not null default 0,
  total_rounds  integer not null default 5 check (total_rounds between 1 and 10),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint games_current_round_in_range check (current_round between 0 and total_rounds)
);

create table public.players (
  id           uuid primary key default gen_random_uuid(),
  game_id      uuid not null references public.games (id) on delete cascade,
  -- The Supabase Auth user in this seat. Hidden from other players (see grants).
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 16 and display_name = btrim(display_name)),
  is_host      boolean not null default false,
  joined_at    timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  constraint players_one_seat_per_user unique (game_id, user_id)
);

-- Lists a game's players (also covered by the unique index below, kept for clarity of intent).
create index players_game_id_idx on public.players (game_id);
-- "Which games am I in?", used by every RLS check.
create index players_user_id_idx on public.players (user_id);
-- Names are unique within a game, ignoring case.
create unique index players_game_name_key on public.players (game_id, lower(display_name));
-- At most one host per game.
create unique index players_one_host_per_game on public.players (game_id) where is_host;
-- Finding players who stopped sending heartbeats.
create index players_game_last_seen_idx on public.players (game_id, last_seen_at);

create table public.rounds (
  id           uuid primary key default gen_random_uuid(),
  game_id      uuid not null references public.games (id) on delete cascade,
  round_number integer not null check (round_number >= 1),
  prompt       text not null check (prompt in (
                 'house', 'tree', 'sun', 'car', 'fish', 'cat', 'rocket', 'flower', 'guitar', 'airplane')),
  status       text not null default 'SPINNING' check (status in (
                 'SPINNING', 'REVEALED', 'DRAWING', 'TIME_UP', 'EVALUATING', 'COMPLETED')),
  started_at   timestamptz not null default now(),
  ends_at      timestamptz,
  constraint rounds_number_per_game unique (game_id, round_number),
  constraint rounds_ends_after_start check (ends_at is null or ends_at > started_at)
);

create table public.drawings (
  id           uuid primary key default gen_random_uuid(),
  round_id     uuid not null references public.rounds (id) on delete cascade,
  player_id    uuid not null references public.players (id) on delete cascade,
  -- Serialized drawing: { "version": 1, "strokes": [{ id, points: [{ x, y, timestamp }], color?, width? }] }
  strokes      jsonb not null check (
                 jsonb_typeof(strokes -> 'strokes') = 'array'
                 and strokes ->> 'version' = '1'
                 and pg_column_size(strokes) <= 1048576),
  submitted_at timestamptz not null default now(),
  constraint drawings_one_per_player_round unique (round_id, player_id)
);

create index drawings_player_id_idx on public.drawings (player_id);

create table public.scores (
  id         uuid primary key default gen_random_uuid(),
  round_id   uuid not null references public.rounds (id) on delete cascade,
  player_id  uuid not null references public.players (id) on delete cascade,
  score      integer not null check (score between 0 and 100),
  created_at timestamptz not null default now(),
  constraint scores_one_per_player_round unique (round_id, player_id)
);

create index scores_player_id_idx on public.scores (player_id);

-- ---------------------------------------------------------------------------
-- Integrity triggers

create function public.set_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger games_set_updated_at before update on public.games
  for each row execute function public.set_updated_at();

-- Seats are only taken in a LOBBY with room left (max 6). Locks the game row
-- so two people can't take the last seat at once.
create function public.check_player_seat() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  game_status text;
  taken int;
begin
  select g.status into game_status from public.games g where g.id = new.game_id for update;
  if game_status is distinct from 'LOBBY' then
    raise exception 'This game has already started' using errcode = 'P0001';
  end if;
  select count(*) into taken from public.players p where p.game_id = new.game_id;
  if taken >= 6 then
    raise exception 'This game is full' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger players_check_seat before insert on public.players
  for each row execute function public.check_player_seat();

-- A drawing's player and round must belong to the same game; any change
-- re-stamps submitted_at.
create function public.check_drawing() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (
    select 1 from public.rounds r join public.players p on p.game_id = r.game_id
     where r.id = new.round_id and p.id = new.player_id
  ) then
    raise exception 'Player and round belong to different games' using errcode = '23514';
  end if;
  new.submitted_at := now();
  return new;
end;
$$;

create trigger drawings_check before insert or update on public.drawings
  for each row execute function public.check_drawing();

-- Same rule for scores.
create function public.check_score() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (
    select 1 from public.rounds r join public.players p on p.game_id = r.game_id
     where r.id = new.round_id and p.id = new.player_id
  ) then
    raise exception 'Player and round belong to different games' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger scores_check before insert or update on public.scores
  for each row execute function public.check_score();

revoke all on function public.set_updated_at(), public.check_player_seat(), public.check_drawing(), public.check_score()
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- RLS helpers: SECURITY DEFINER so policies can look things up without
-- recursing into RLS; in a schema the Data API does not expose.

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

create function private.is_game_member(p_game_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.players p where p.game_id = p_game_id and p.user_id = (select auth.uid()))
$$;

create function private.owns_player(p_player_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.players p where p.id = p_player_id and p.user_id = (select auth.uid()))
$$;

create function private.game_is_joinable(p_game_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.games g where g.id = p_game_id and g.status = 'LOBBY')
$$;

-- A member of the round's game, and the round is accepting drawings.
create function private.round_is_open_to_me(p_round_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.rounds r
     where r.id = p_round_id and r.status in ('DRAWING', 'TIME_UP') and private.is_game_member(r.game_id)
  )
$$;

-- A member of the round's game, and the round is complete.
create function private.round_is_complete_for_me(p_round_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.rounds r
     where r.id = p_round_id and r.status = 'COMPLETED' and private.is_game_member(r.game_id)
  )
$$;

revoke all on all functions in schema private from public;
grant execute on all functions in schema private to authenticated;

-- Players join by room code, but can't read games they aren't in yet. This
-- returns the game id only for a LOBBY, so codes of running games reveal nothing.
create function public.find_open_lobby(p_room_code text) returns uuid
language sql stable security definer set search_path = '' as $$
  select g.id from public.games g where g.room_code = upper(btrim(p_room_code)) and g.status = 'LOBBY'
$$;

revoke all on function public.find_open_lobby(text) from public, anon;
grant execute on function public.find_open_lobby(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Privileges. Signed-out visitors (anon) get nothing. Signed-in players get
-- exactly the columns below; RLS then limits the rows. service_role (the
-- game server) keeps Supabase's default full access and bypasses RLS.

alter table public.games    enable row level security;
alter table public.players  enable row level security;
alter table public.rounds   enable row level security;
alter table public.drawings enable row level security;
alter table public.scores   enable row level security;

revoke all on public.games, public.players, public.rounds, public.drawings, public.scores from anon, authenticated;

grant select on public.games, public.rounds, public.scores to authenticated;
-- players.user_id is never readable by players.
grant select (id, game_id, display_name, is_host, joined_at, last_seen_at) on public.players to authenticated;
-- Joining: game and name only. user_id defaults to the caller; is_host can't be set.
grant insert (game_id, display_name) on public.players to authenticated;
-- Heartbeat only.
grant update (last_seen_at) on public.players to authenticated;
grant select, insert on public.drawings to authenticated;
grant update (strokes) on public.drawings to authenticated;

-- ---------------------------------------------------------------------------
-- Policies

-- games
create policy "Members can read their game"
  on public.games for select to authenticated
  using (private.is_game_member(id));

-- players
create policy "Members can read players in their game"
  on public.players for select to authenticated
  using (private.is_game_member(game_id));

create policy "Players can join an open lobby as themselves"
  on public.players for insert to authenticated
  with check (user_id = (select auth.uid()) and is_host = false and private.game_is_joinable(game_id));

create policy "Players can update their own heartbeat"
  on public.players for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- rounds
create policy "Members can read rounds in their game"
  on public.rounds for select to authenticated
  using (private.is_game_member(game_id));

-- drawings
create policy "Players can read their own drawings"
  on public.drawings for select to authenticated
  using (private.owns_player(player_id));

create policy "Members can read all drawings once the round is complete"
  on public.drawings for select to authenticated
  using (private.round_is_complete_for_me(round_id));

create policy "Players can submit their own drawing while the round is open"
  on public.drawings for insert to authenticated
  with check (private.owns_player(player_id) and private.round_is_open_to_me(round_id));

create policy "Players can replace their own drawing while the round is open"
  on public.drawings for update to authenticated
  using (private.owns_player(player_id) and private.round_is_open_to_me(round_id))
  with check (private.owns_player(player_id) and private.round_is_open_to_me(round_id));

-- scores
create policy "Members can read scores once the round is complete"
  on public.scores for select to authenticated
  using (private.round_is_complete_for_me(round_id));

commit;
