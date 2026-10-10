#!/usr/bin/env bash
# Many clients hitting the same transition at the same moment: exactly one may win.
# Run against a throwaway local Postgres that has local_supabase_stub.sql and every
# migration applied (it commits test rows), never a real project:
#   PSQL="psql -h localhost -d gc_test" supabase/tests/race_test.sh
set -euo pipefail
PSQL=${PSQL:-psql}
N=${N:-8}
q() { $PSQL -X -q -t -A -v ON_ERROR_STOP=1 "$@"; }
as_user() { # user sql: runs sql as that signed-in user
  q <<SQL
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '$1', true) \g /dev/null
$2
commit;
SQL
}
pass() { echo "PASS  $1"; }
fail() { echo "FAIL  $1"; status=1; }
status=0

host=$(q -c "select gen_random_uuid();"); guest=$(q -c "select gen_random_uuid();")
q -c "insert into auth.users values ('$host'), ('$guest');"
game=$(as_user "$host" "select game_id from public.create_game('RaceHost', 2);")
code=$(q -c "select room_code from public.games where id = '$game';")
as_user "$guest" "select 1 from public.join_game('$code', 'RaceGuest');" >/dev/null
expire() { q -c "update public.games set phase_ends_at = now() - interval '1 second', phase_started_at = now() - interval '1 hour' where id = '$game';"; }
ver() { q -c "select state_version from public.games where id = '$game';"; }
state() { q -c "select status || ' r' || current_round || ' v' || state_version from public.games where id = '$game';"; }

# 1. Both players press Start at once (the guest is refused, the host wins once).
out=$(mktemp -d)
for i in $(seq 1 $N); do
  who=$host; [ $((i % 2)) -eq 0 ] && who=$guest
  ( as_user "$who" "select public.start_game('$game');" >"$out/$i" 2>&1 || true ) &
done
wait
ok=$(grep -l '^STARTING$' "$out"/* | wc -l)
[ "$ok" -eq 1 ] && pass "$N simultaneous start_game calls: exactly one starts the game ($ok)" || fail "start_game winners: $ok"
[ "$(state)" = "STARTING r0 v1" ] && pass "game started once: $(state)" || fail "after start: $(state)"
rm -r "$out"

# 2. Every client's timer fires at once when STARTING is due.
expire
v=$(ver); out=$(mktemp -d)
for i in $(seq 1 $N); do
  who=$host; [ $((i % 2)) -eq 0 ] && who=$guest
  ( as_user "$who" "select advanced from public.advance_game('$game', $v);" >"$out/$i" 2>&1 ) &
done
wait
won=$(grep -lx 't' "$out"/* | wc -l); lost=$(grep -lx 'f' "$out"/* | wc -l)
[ "$won" -eq 1 ] && [ "$lost" -eq $((N - 1)) ] && pass "$N simultaneous advance_game calls: 1 advanced, $lost did nothing" || fail "advance winners $won, no-ops $lost: $(cat "$out"/*)"
rounds=$(q -c "select count(*) from public.rounds where game_id = '$game';")
[ "$(state)" = "WHEEL_SPINNING r1 v2" ] && [ "$rounds" -eq 1 ] && pass "one step taken, one round created: $(state)" || fail "after race: $(state), rounds $rounds"
rm -r "$out"

# 3. In DRAWING, the host ends the round just as the timer runs out for everyone.
for _ in 1 2; do expire; as_user "$host" "select advanced from public.advance_game('$game', $(ver));" >/dev/null; done
[ "$(state | cut -d' ' -f1)" = "DRAWING" ] || fail "expected DRAWING, got $(state)"
expire
v=$(ver); out=$(mktemp -d)
( as_user "$host" "select advanced from public.host_advance('$game', $v);" >"$out/host" 2>&1 ) &
for i in $(seq 1 $N); do
  who=$host; [ $((i % 2)) -eq 0 ] && who=$guest
  ( as_user "$who" "select advanced from public.advance_game('$game', $v);" >"$out/$i" 2>&1 ) &
done
wait
won=$(grep -lx 't' "$out"/* | wc -l)
[ "$won" -eq 1 ] && pass "host 'End round' racing $N timers: exactly one transition" || fail "winners: $won: $(cat "$out"/*)"
[ "$(state)" = "TIME_UP r1 v5" ] && pass "game is in TIME_UP once: $(state)" || fail "after race: $(state)"
rm -r "$out"

exit $status
