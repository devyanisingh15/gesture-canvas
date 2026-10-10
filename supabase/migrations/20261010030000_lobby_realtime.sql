-- Gesture Canvas: the live lobby.
--
-- Each game has one private Realtime channel, topic "game:<game id>". Players
-- use it for Presence (who has the lobby open) and for small "the lobby
-- changed, re-read it" broadcasts. No game data travels over the channel:
-- clients always re-read games and players through RLS. The policies below let
-- only the game's members join, track presence or broadcast on its channel.
--
-- Also adds the three lobby actions players may take, each checked here rather
-- than trusted from the browser:
--   touch_seat(game)  marks the caller as recently seen (server clock)
--   leave_game(game)  frees the caller's seat; hands host to the next player
--   start_game(game)  host only; needs LOBBY and 2+ recently seen players
-- Errors use the same codes as join_game: GC002 already started, plus
--   GC005 not in this game, GC006 not the host, GC007 not enough players.
--
-- Non-destructive: adds functions, grants and policies only.

-- ---------------------------------------------------------------------------
-- Realtime channel access

-- "game:<uuid>" -> the uuid; anything else -> null (so policies simply deny).
create function private.game_id_from_topic(p_topic text) returns uuid
language sql immutable set search_path = '' as $$
  select case when p_topic ~ '^game:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
              then substr(p_topic, 6)::uuid end
$$;

revoke all on function private.game_id_from_topic(text) from public;
grant execute on function private.game_id_from_topic(text) to authenticated;

create policy "Members can receive their game's lobby channel"
  on realtime.messages for select to authenticated
  using (
    realtime.messages.extension in ('broadcast', 'presence')
    and private.is_game_member(private.game_id_from_topic((select realtime.topic())))
  );

create policy "Members can send on their game's lobby channel"
  on realtime.messages for insert to authenticated
  with check (
    realtime.messages.extension in ('broadcast', 'presence')
    and private.is_game_member(private.game_id_from_topic((select realtime.topic())))
  );

-- ---------------------------------------------------------------------------
-- Lobby actions

create function public.touch_seat(p_game_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.players set last_seen_at = now()
   where game_id = p_game_id and user_id = (select auth.uid());
  if not found then
    raise exception 'You''re not in this game' using errcode = 'GC005';
  end if;
end;
$$;

create function public.leave_game(p_game_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := (select auth.uid());
  v_status text;
  v_was_host boolean;
  v_next uuid;
begin
  -- Lock the game so a concurrent start or join sees a consistent seat list.
  select g.status into v_status from public.games g where g.id = p_game_id for update;
  delete from public.players p
   where p.game_id = p_game_id and p.user_id = v_user
  returning p.is_host into v_was_host;
  if not found then
    raise exception 'You''re not in this game' using errcode = 'GC005';
  end if;
  if v_status <> 'LOBBY' then
    raise exception 'This game has already started' using errcode = 'GC002';
  end if;

  if v_was_host then
    select p.id into v_next from public.players p
     where p.game_id = p_game_id order by p.joined_at, p.id limit 1;
    if v_next is null then
      delete from public.games where id = p_game_id;  -- nobody left
    else
      update public.players set is_host = true where id = v_next;
    end if;
  end if;
end;
$$;

create function public.start_game(p_game_id uuid) returns text
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
  -- Players whose lobby has sent a heartbeat recently (every 20s).
  if (select count(*) from public.players p
       where p.game_id = p_game_id and p.last_seen_at > now() - interval '60 seconds') < 2 then
    raise exception 'You need at least 2 players in the lobby to start' using errcode = 'GC007';
  end if;

  update public.games set status = 'STARTING' where id = p_game_id;
  return 'STARTING';
end;
$$;

revoke all on function public.touch_seat(uuid), public.leave_game(uuid), public.start_game(uuid) from public, anon;
grant execute on function public.touch_seat(uuid), public.leave_game(uuid), public.start_game(uuid) to authenticated;
