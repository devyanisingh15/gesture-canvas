-- Gesture Canvas: join a game by room code.
--
-- Players can't read a game before they're in it (RLS), so they can't tell
-- "no such room" from "already started" or "full" on their own. This
-- SECURITY DEFINER function checks the room under a lock and either seats the
-- signed-in (anonymous) user or raises an error with a code the app maps to a
-- message:
--   GC001 no game with that code      GC003 the game is full (6 players)
--   GC002 the game has left the lobby GC004 the name is taken in that game
--   22023 malformed code or name      28000 not signed in
-- Calling it again for a room you're already in returns your existing seat,
-- so a double-submit or a lost tab can't create a second player.
--
-- Non-destructive: adds one function and its grants.

create function public.join_game(p_room_code text, p_display_name text)
returns table (game_id uuid, player_id uuid, room_code text)
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := (select auth.uid());
  v_code text := upper(btrim(coalesce(p_room_code, '')));
  v_name text := btrim(coalesce(p_display_name, ''));
  v_game public.games%rowtype;
  v_player uuid;
begin
  if v_user is null then
    raise exception 'Sign in before joining a game' using errcode = '28000';
  end if;
  if v_code !~ '^[A-HJ-NP-Z2-9]{6}$' then
    raise exception 'That isn''t a valid room code' using errcode = '22023';
  end if;
  if char_length(v_name) not between 1 and 16 then
    raise exception 'Names must be 1-16 characters' using errcode = '22023';
  end if;

  -- Lock the game so the checks below hold until the seat is taken.
  select * into v_game from public.games g where g.room_code = v_code for update;
  if not found then
    raise exception 'No game with that code' using errcode = 'GC001';
  end if;

  select p.id into v_player from public.players p where p.game_id = v_game.id and p.user_id = v_user;
  if found then
    return query select v_game.id, v_player, v_game.room_code;
    return;
  end if;

  if v_game.status <> 'LOBBY' then
    raise exception 'This game has already started' using errcode = 'GC002';
  end if;
  if (select count(*) from public.players p where p.game_id = v_game.id) >= 6 then
    raise exception 'This game is full' using errcode = 'GC003';
  end if;
  if exists (select 1 from public.players p where p.game_id = v_game.id and lower(p.display_name) = lower(v_name)) then
    raise exception 'That name is already taken in this game' using errcode = 'GC004';
  end if;

  insert into public.players (game_id, user_id, display_name, is_host)
  values (v_game.id, v_user, v_name, false)
  returning id into v_player;

  return query select v_game.id, v_player, v_game.room_code;
end;
$$;

revoke all on function public.join_game(text, text) from public, anon;
grant execute on function public.join_game(text, text) to authenticated;
