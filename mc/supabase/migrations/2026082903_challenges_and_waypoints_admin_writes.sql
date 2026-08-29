-- THE ADMIN CHECK ON THESE TWO TABLES IS CLIENT-SIDE ONLY.
--
-- `challenges` and `waypoints` both grant every write to `authenticated` with
-- USING (true). The admin_users test lives in JavaScript, in admin-auth.js, so
-- the database itself lets ANY signed-in Supabase user on this project edit or
-- delete every row. Since the Request Access flow signs applicants up with the
-- publishable key, an account is free to obtain.
--
-- The tables next door already do it properly:
--
--     events  admin update/delete  ->  is_photo_admin()
--     issues  admin update/delete  ->  is_photo_admin()
--
-- This brings the other two into line. Reads are UNCHANGED and stay public:
-- both tables are read by public pages, and nothing here is secret.
--
-- WHAT IT COSTS, and it is the reason this is a file rather than something
-- already applied: any tool signing in as a non-admin authenticated user loses
-- its write. Nothing in this repo does that -- every writer is either an admin
-- page or a SECURITY DEFINER pull RPC, which is unaffected -- but a script
-- somebody runs by hand with a personal login would stop working, loudly.
--
-- APPLY: cd mc && supabase db query --linked --file supabase/migrations/2026082903_challenges_and_waypoints_admin_writes.sql

begin;

-- ---- challenges -----------------------------------------------------------
-- One policy covering ALL commands, so it is replaced rather than narrowed.
drop policy if exists "Admins can manage challenges" on public.challenges;

create policy "challenges admin insert" on public.challenges
  for insert to authenticated with check (is_photo_admin());
create policy "challenges admin update" on public.challenges
  for update to authenticated using (is_photo_admin()) with check (is_photo_admin());
create policy "challenges admin delete" on public.challenges
  for delete to authenticated using (is_photo_admin());

-- ---- waypoints ------------------------------------------------------------
drop policy if exists "waypoints insert by authenticated" on public.waypoints;
drop policy if exists "waypoints update by authenticated" on public.waypoints;
drop policy if exists "waypoints delete by authenticated" on public.waypoints;

create policy "waypoints admin insert" on public.waypoints
  for insert to authenticated with check (is_photo_admin());
create policy "waypoints admin update" on public.waypoints
  for update to authenticated using (is_photo_admin()) with check (is_photo_admin());
create policy "waypoints admin delete" on public.waypoints
  for delete to authenticated using (is_photo_admin());

commit;

-- VERIFY. Every write policy on both tables should read is_photo_admin(), and
-- the two read policies should be untouched.
--
--   select c.relname, p.polname, p.polcmd,
--          coalesce(pg_get_expr(p.polqual, p.polrelid),
--                   pg_get_expr(p.polwithcheck, p.polrelid)) as expr
--     from pg_policy p join pg_class c on c.oid = p.polrelid
--    where c.relname in ('challenges','waypoints')
--    order by c.relname, p.polname;
--
-- AND PROVE IT WITH A CALL, not by reading the policies: sign in as a
-- non-admin and try a PATCH. Before, it succeeds. After, it answers 42501.
