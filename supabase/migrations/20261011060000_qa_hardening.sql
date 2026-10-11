-- QA hardening: two internal helpers were still executable by everyone.
--
-- private.lock_for_change and private.submit_grace_ms are only called from
-- SECURITY DEFINER functions (which run as their owner), but EXECUTE had
-- never been revoked from PUBLIC, so the anon role kept it. Neither leaked
-- data (anon has no usage on schema private), but nothing outside the
-- owner needs them.
--
-- Non-destructive: privileges only.

begin;

revoke all on function private.lock_for_change(uuid, integer, boolean) from public, anon, authenticated;
revoke all on function private.submit_grace_ms() from public, anon, authenticated;

commit;
