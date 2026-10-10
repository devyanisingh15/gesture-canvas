-- Gesture Canvas: create a game and its host in one call.
--
-- Players can't insert into games (RLS), so creating a game goes through this
-- SECURITY DEFINER function. It runs as the signed-in (anonymous) user's
-- request: auth.uid() becomes the host. No secret key is involved.
--
-- Non-destructive: adds one function and its grants.

create function public.create_game(p_display_name text, p_total_rounds integer default 5)
returns table (game_id uuid, player_id uuid, room_code text)
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := (select auth.uid());
  v_name text := btrim(coalesce(p_display_name, ''));
  v_alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_code text;
  v_game uuid;
  v_player uuid;
begin
  if v_user is null then
    raise exception 'Sign in before creating a game' using errcode = '28000';
  end if;
  if char_length(v_name) not between 1 and 16 then
    raise exception 'Names must be 1-16 characters' using errcode = '22023';
  end if;
  if p_total_rounds is null or p_total_rounds not between 1 and 10 then
    raise exception 'Rounds must be between 1 and 10' using errcode = '22023';
  end if;

  -- A double-submitted form returns the lobby it just created instead of a second game.
  select g.id, p.id, g.room_code into v_game, v_player, v_code
    from public.games g join public.players p on p.game_id = g.id
   where p.user_id = v_user and p.is_host and g.status = 'LOBBY'
     and g.created_at > now() - interval '30 seconds'
   order by g.created_at desc
   limit 1;
  if found then
    return query select v_game, v_player, v_code;
    return;
  end if;

  -- Six characters from 32 symbols (~1 billion codes). Retry on the rare collision.
  for attempt in 1..10 loop
    v_code := '';
    for i in 1..6 loop
      v_code := v_code || substr(v_alphabet, 1 + floor(random() * 32)::int, 1);
    end loop;
    begin
      insert into public.games (room_code, status, current_round, total_rounds)
      values (v_code, 'LOBBY', 0, p_total_rounds)
      returning id into v_game;
      exit;
    exception when unique_violation then
      v_game := null;
    end;
  end loop;
  if v_game is null then
    raise exception 'Could not find a free room code' using errcode = 'P0001';
  end if;

  insert into public.players (game_id, user_id, display_name, is_host)
  values (v_game, v_user, v_name, true)
  returning id into v_player;

  return query select v_game, v_player, v_code;
end;
$$;

revoke all on function public.create_game(text, integer) from public, anon;
grant execute on function public.create_game(text, integer) to authenticated;
