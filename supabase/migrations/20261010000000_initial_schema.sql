-- Gesture Canvas: initial schema (PROPOSAL, not yet applied).
--
-- Access model
--   * Every player signs in with Supabase Anonymous Auth, so auth.uid()
--     identifies them. A player row links that user to one game.
--   * The Next.js game server is the only writer. It runs the game engine
--     and writes with the service-role key (server-only, never NEXT_PUBLIC_),
--     which bypasses RLS. Players change nothing directly: joining,
--     readiness, drawings and scores all go through the server's API.
--   * Players may only READ, and only the game they are in. RLS policies
--     below grant SELECT only; there are no INSERT/UPDATE/DELETE policies,
--     and those privileges are revoked from anon/authenticated as well.

begin;

-- ---------------------------------------------------------------------------
-- Types

create type public.game_status as enum (
  'lobby',            -- waiting for players
  'starting',         -- countdown before round 1
  'wheel_spinning',   -- prompt being picked
  'target_revealed',  -- prompt shown, drawing about to start
  'drawing',          -- round clock running
  'time_up',          -- collecting final drawings
  'evaluating',       -- scoring drawings
  'round_results',    -- scores shown
  'final_results'     -- game over
);

create type public.round_status as enum (
  'spinning',    -- wheel picking the prompt
  'revealed',    -- prompt shown
  'drawing',     -- players drawing
  'collecting',  -- time up, last drawings arriving
  'evaluating',  -- drawings being scored
  'scored'       -- scores final and visible
);

create type public.connection_status as enum ('connected', 'reconnecting', 'disconnected');

create type public.evaluation_status as enum ('pending', 'evaluating', 'evaluated', 'failed');

-- The controlled prompt list. Extend with ALTER DOMAIN when prompts are added.
create domain public.prompt_id as text
  check (value in ('house', 'tree', 'sun', 'car', 'fish', 'cat', 'rocket', 'flower', 'guitar', 'airplane'));

-- ---------------------------------------------------------------------------
-- Tables

create table public.games (
  id               uuid primary key default gen_random_uuid(),
  -- Six characters without look-alikes (no 0/O, 1/I). Unique forever, so a
  -- code never points at two games; the server retries on a unique violation.
  code             text not null unique
                   check (code ~ '^[A-HJ-NP-Z2-9]{6}$'),
  host_player_id   uuid not null,  -- FK added below (players references games)
  status           public.game_status not null default 'lobby',
  total_rounds     smallint not null default 3 check (total_rounds between 1 and 10),
  round_duration_seconds smallint not null default 60 check (round_duration_seconds between 10 and 180),
  max_players      smallint not null default 6 check (max_players between 2 and 6),
  current_round    smallint not null default 0,
  current_prompt   public.prompt_id,
  -- Server clock for the current phase; clients count down to phase_ends_at.
  phase_started_at timestamptz not null default now(),
  phase_ends_at    timestamptz,
  -- Bumped on every write, for optimistic concurrency between server instances.
  version          bigint not null default 1,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint games_current_round_in_range check (current_round between 0 and total_rounds),
  constraint games_prompt_matches_round check ((current_round = 0) = (current_prompt is null)),
  constraint games_phase_window check (phase_ends_at is null or phase_ends_at >= phase_started_at)
);

create table public.players (
  id                uuid primary key default gen_random_uuid(),
  game_id           uuid not null references public.games (id) on delete cascade,
  -- Supabase Auth user (anonymous sign-in). Never exposed to other players.
  user_id           uuid not null references auth.users (id) on delete cascade,
  display_name      text not null
                    check (char_length(display_name) between 1 and 16 and display_name = btrim(display_name)),
  avatar            text not null default 'violet'
                    check (avatar in ('violet', 'pink', 'sun', 'mint', 'sky', 'peach')),
  total_score       integer not null default 0 check (total_score >= 0),
  is_ready          boolean not null default false,
  connection_status public.connection_status not null default 'connected',
  joined_at         timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  -- One seat per person per game.
  constraint players_one_seat_per_user unique (game_id, user_id),
  -- Lets drawings/scores prove their player belongs to the same game.
  constraint players_id_game_key unique (id, game_id)
);

-- Names are unique within a game, ignoring case ("Maya" and "maya" clash).
create unique index players_game_name_key on public.players (game_id, lower(display_name));
create index players_user_id_idx on public.players (user_id);

-- The host must be a player of the same game. Deferred so a game and its
-- host can be inserted in one transaction.
alter table public.games
  add constraint games_host_player_fk
  foreign key (host_player_id, id) references public.players (id, game_id)
  deferrable initially deferred;

create table public.rounds (
  id                 uuid primary key default gen_random_uuid(),
  game_id            uuid not null references public.games (id) on delete cascade,
  round_number       smallint not null check (round_number >= 1),
  prompt             public.prompt_id not null,
  status             public.round_status not null default 'spinning',
  started_at         timestamptz not null default now(),
  drawing_started_at timestamptz,
  drawing_ends_at    timestamptz,
  ended_at           timestamptz,
  constraint rounds_number_per_game unique (game_id, round_number),
  constraint rounds_id_game_key unique (id, game_id),
  constraint rounds_drawing_window check (drawing_ends_at is null or drawing_ends_at > drawing_started_at),
  constraint rounds_drawing_times_once_drawing check (
    status in ('spinning', 'revealed') or (drawing_started_at is not null and drawing_ends_at is not null)
  )
);

create table public.drawings (
  id                uuid primary key default gen_random_uuid(),
  game_id           uuid not null,
  round_id          uuid not null,
  player_id         uuid not null,
  -- Serialized Drawing: { "version": 1, "strokes": [{ id, points: [{ x, y, timestamp }], color?, width? }] }
  strokes           jsonb not null
                    check (jsonb_typeof(strokes -> 'strokes') = 'array' and (strokes ->> 'version')::int = 1),
  -- Optional rendered PNG in Supabase Storage (bucket/path), e.g. for the evaluator.
  image_path        text,
  submitted_at      timestamptz not null default now(),
  evaluation_status public.evaluation_status not null default 'pending',
  constraint drawings_one_per_player_round unique (round_id, player_id),
  constraint drawings_round_fk foreign key (round_id, game_id) references public.rounds (id, game_id) on delete cascade,
  constraint drawings_player_fk foreign key (player_id, game_id) references public.players (id, game_id) on delete cascade,
  -- Guard against oversized payloads (the server also caps strokes/points).
  constraint drawings_size_limit check (pg_column_size(strokes) <= 1048576)
);

create index drawings_player_id_idx on public.drawings (player_id);
create index drawings_game_id_idx on public.drawings (game_id);

create table public.scores (
  id                 uuid primary key default gen_random_uuid(),
  game_id            uuid not null,
  round_id           uuid not null,
  player_id          uuid not null,
  -- Null when the player handed in nothing (scored zero).
  drawing_id         uuid references public.drawings (id) on delete set null,
  shape_score        smallint not null check (shape_score between 0 and 100),
  structure_score    smallint not null check (structure_score between 0 and 100),
  completeness_score smallint not null check (completeness_score between 0 and 100),
  composition_score  smallint not null check (composition_score between 0 and 100),
  total_score        smallint not null check (total_score between 0 and 100),
  created_at         timestamptz not null default now(),
  constraint scores_one_per_player_round unique (round_id, player_id),
  constraint scores_round_fk foreign key (round_id, game_id) references public.rounds (id, game_id) on delete cascade,
  constraint scores_player_fk foreign key (player_id, game_id) references public.players (id, game_id) on delete cascade
);

create index scores_player_id_idx on public.scores (player_id);
create index scores_game_id_idx on public.scores (game_id);
create index scores_drawing_id_idx on public.scores (drawing_id);

-- Finding stale games to clean up.
create index games_status_updated_idx on public.games (status, updated_at);

-- ---------------------------------------------------------------------------
-- Triggers

create function public.set_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger games_set_updated_at before update on public.games
  for each row execute function public.set_updated_at();
create trigger players_set_updated_at before update on public.players
  for each row execute function public.set_updated_at();

-- players.total_score is derived from scores, so it can't drift.
create function public.refresh_player_total_score() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  affected uuid := coalesce(new.player_id, old.player_id);
begin
  update public.players p
     set total_score = coalesce((select sum(s.total_score) from public.scores s where s.player_id = affected), 0)
   where p.id = affected;
  return null;
end;
$$;

create trigger scores_refresh_total after insert or update or delete on public.scores
  for each row execute function public.refresh_player_total_score();

-- ---------------------------------------------------------------------------
-- RLS helpers. In a schema the Data API doesn't expose, and SECURITY DEFINER
-- so policies on players can look up players without recursing into RLS.

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

-- The current user's player id in a game, or null if they aren't in it.
create function private.my_player_id(p_game_id uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select p.id from public.players p
   where p.game_id = p_game_id and p.user_id = (select auth.uid())
$$;

create function private.is_game_member(p_game_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.players p
     where p.game_id = p_game_id and p.user_id = (select auth.uid())
  )
$$;

-- True once drawing has closed for a round (it is being or has been scored).
create function private.round_drawings_visible(p_round_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.rounds r
     where r.id = p_round_id and r.status in ('evaluating', 'scored')
  )
$$;

create function private.round_scored(p_round_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.rounds r where r.id = p_round_id and r.status = 'scored')
$$;

revoke all on function private.my_player_id(uuid), private.is_game_member(uuid),
  private.round_drawings_visible(uuid), private.round_scored(uuid) from public;
grant execute on function private.my_player_id(uuid), private.is_game_member(uuid),
  private.round_drawings_visible(uuid), private.round_scored(uuid) to authenticated;
revoke all on function public.set_updated_at(), public.refresh_player_total_score() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Privileges: players read only; the server (service_role) writes.

alter table public.games    enable row level security;
alter table public.players  enable row level security;
alter table public.rounds   enable row level security;
alter table public.drawings enable row level security;
alter table public.scores   enable row level security;

revoke all on public.games, public.players, public.rounds, public.drawings, public.scores from anon, authenticated;

grant select on public.games, public.rounds, public.drawings, public.scores to authenticated;
-- players.user_id is deliberately left out: other players never see auth ids.
grant select (id, game_id, display_name, avatar, total_score, is_ready, connection_status, joined_at, updated_at)
  on public.players to authenticated;

-- ---------------------------------------------------------------------------
-- Policies (SELECT only; anything not allowed here is denied)

create policy "Members can read their game"
  on public.games for select to authenticated
  using (private.is_game_member(id));

create policy "Members can read players in their game"
  on public.players for select to authenticated
  using (private.is_game_member(game_id));

create policy "Members can read rounds in their game"
  on public.rounds for select to authenticated
  using (private.is_game_member(game_id));

create policy "Players can read their own drawings"
  on public.drawings for select to authenticated
  using (player_id = private.my_player_id(game_id));

create policy "Members can read all drawings once drawing has closed"
  on public.drawings for select to authenticated
  using (private.is_game_member(game_id) and private.round_drawings_visible(round_id));

create policy "Members can read scores once a round is scored"
  on public.scores for select to authenticated
  using (private.is_game_member(game_id) and private.round_scored(round_id));

commit;
