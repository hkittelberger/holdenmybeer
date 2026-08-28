-- BP0/BP3 — Make `public` the default search_path for the app role.
--
-- The Neon pooler was handing out sessions with an empty search_path, so
-- unqualified `select ... from plays` failed with "relation does not exist".
-- A per-connection `set search_path` works but the HTTP driver's one-shot
-- queries can't carry a session SET. Setting it on the role fixes it for
-- every driver and connection mode, permanently.
--
-- Run once per Neon branch (dev now; primary at BP7). Not transactional —
-- ALTER ROLE ... SET takes effect on subsequent connections.

alter role neondb_owner set search_path = public;

-- Verify from a NEW connection:  show search_path;  -->  "$user", public
-- and:  select count(*) from plays;  should now work unqualified.
