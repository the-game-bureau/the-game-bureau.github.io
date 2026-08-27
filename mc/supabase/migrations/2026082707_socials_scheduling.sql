-- POST NOW, OR AT A TIME YOU CHOOSE.
--
-- ── DOES THIS BREAK THE HUMAN-IN-THE-LOOP RULE? NO, AND THE DISTINCTION IS
--    WORTH STATING ─────────────────────────────────────────────────────────
--
-- This file has said for months: "the agent posts nothing and holds no account
-- credentials... don't ever wire this to a social API -- the human-in-the-loop
-- is the design, not a missing feature."
--
-- **That rule is about the BOT deciding what goes out.** It still holds
-- completely: TGB SOCIALIZER BOT files candidates and cannot post one. What is
-- scheduled here is a decision a HUMAN has already taken -- this candidate, to
-- these accounts -- and merely deferred. Nothing chooses; something waits.
--
-- If that ever stops being true, the thing to check is that `scheduled_for`,
-- `scheduled_platforms` and `scheduled_state` are only ever written by an admin
-- in the Socializer, never by a routine.
--
-- ── HOW IT FIRES, AND WHY IT IS NOT A CLAUDE ROUTINE ────────────────────────
--
-- The six TGB routines run twice a day at fixed minutes. A post scheduled for
-- 3:47pm would go out at 3am the next morning, which is not scheduling.
--
-- `pg_cron` (installed by this migration) fires every minute and calls the
-- `socials-post` Edge Function through `pg_net`. That function already runs as
-- the service role -- the platform injects `SUPABASE_SERVICE_ROLE_KEY` -- so it
-- can read the row and stamp the receipt exactly as it does when a human
-- presses the button. **The path is identical from the moment it is called.**
--
-- ── THE CREDENTIAL PROBLEM, AND HOW IT IS SOLVED WITHOUT A SERVICE KEY ──────
--
-- `socials-post` gates on the CALLER'S OWN JWT against `is_photo_admin()`, and
-- a cron job has no JWT. This project has no service-role key on hand either --
-- `.env` has never had one.
--
-- So the function gains a SECOND door: a shared secret in the
-- `x-tgb-scheduler` header, which reaches ONLY the sweep and cannot post an
-- arbitrary payload. The secret lives in Supabase Vault (for the cron) and in
-- the function's own secrets (for the check). **Neither is reachable from the
-- public page**, which is the whole reason the posting path is an Edge Function
-- in the first place.
--
-- ── APPLY BY HAND, AND THEN THREE THINGS HAVE TO HAPPEN ─────────────────────
--
--   1. supabase secrets set TGB_SCHEDULER_SECRET=<the value printed below>
--   2. cd mc && supabase functions deploy socials-post
--   3. re-run the `cron.schedule` block, which needs the real project URL
--
-- UNTIL THEN NOTHING IS SCHEDULED AND NOTHING BREAKS: the columns exist, the
-- room can write them, and the sweep either does not run or is refused. A queued
-- post simply waits, and the room says how many are waiting.

-- ── THE COLUMNS ─────────────────────────────────────────────────────────────

alter table public.socials
  add column if not exists scheduled_for       timestamptz,
  add column if not exists scheduled_platforms text[],
  add column if not exists scheduled_state     text,
  add column if not exists scheduled_error     text;

comment on column public.socials.scheduled_for is
  'When a human asked for this to go out. Null means it is not scheduled: either it posts on a press or it is not going out at all.';

comment on column public.socials.scheduled_platforms is
  'The machine accounts chosen AT SCHEDULING TIME, not re-derived at send time. What a person agreed to send is what goes: a candidate that gains an image between now and then must not silently acquire Instagram.';

comment on column public.socials.scheduled_state is
  'null not scheduled | queued waiting | sending claimed by the sweep | failed the send was refused, with scheduled_error saying why. There is no "sent": a sent post is status = posted like any other.';

-- STATE IS CONSTRAINED, because this one drives an unattended write. A typo in
-- a status a human can see is a typo; a typo in this one is a post that never
-- goes out or goes out twice.
alter table public.socials drop constraint if exists socials_scheduled_state_check;
alter table public.socials add constraint socials_scheduled_state_check
  check (scheduled_state is null or scheduled_state in ('queued','sending','failed'));

-- THE INDEX IS THE SWEEP'S WHOLE QUERY. Partial, so it stays the size of the
-- queue rather than the size of the table.
create index if not exists socials_due_idx
  on public.socials (scheduled_for)
  where scheduled_state = 'queued';

-- The room writes these; it already has update on this table under RLS.
grant update (scheduled_for, scheduled_platforms, scheduled_state, scheduled_error)
  on public.socials to authenticated;

-- ── THE CLAIM ───────────────────────────────────────────────────────────────
--
-- ONE STATEMENT, AND THAT IS THE POINT. `update ... where state = 'queued'
-- returning` is atomic per row, so two sweeps overlapping cannot both take the
-- same candidate. A select-then-update would post twice, and a post that goes
-- out twice cannot be taken back.
--
-- IT CLAIMS, IT DOES NOT SEND. The Edge Function sends. Keeping those apart is
-- what lets the claim be a single statement.

create or replace function public.tgb_claim_due_socials(p_limit int default 5)
returns table (id text, platforms text[])
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  return query
  update public.socials s
     set scheduled_state = 'sending'
   where s.id in (
     select s2.id from public.socials s2
      where s2.scheduled_state = 'queued'
        and s2.scheduled_for is not null
        and s2.scheduled_for <= now()
        -- A CANDIDATE THAT WAS POSTED OR SKIPPED IN THE MEANTIME IS DROPPED.
        -- Somebody changed their mind between scheduling and now, and the
        -- schedule must not overrule them.
        and coalesce(s2.status, 'review') = 'review'
      order by s2.scheduled_for
      limit greatest(1, least(coalesce(p_limit, 5), 25))
      for update skip locked)
  returning s.id, s.scheduled_platforms;
end $function$;

comment on function public.tgb_claim_due_socials(int) is
  'Claims due scheduled posts in one atomic statement and marks them sending. Service role only: it is called by socials-post, never by a page.';

revoke all on function public.tgb_claim_due_socials(int) from anon, authenticated;

-- ── THE SWEEP ───────────────────────────────────────────────────────────────

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- THE SECRET LIVES IN VAULT, NOT IN THIS FILE AND NOT IN THE CRON COMMAND.
-- `cron.job` is readable by anything that can read the catalog, so a secret
-- written into the command string is a secret in a table.
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'tgb_scheduler_secret') then
    perform vault.create_secret(encode(gen_random_bytes(32), 'hex'), 'tgb_scheduler_secret',
      'Shared secret that lets pg_cron call the socials-post sweep. Also set as the TGB_SCHEDULER_SECRET function secret.');
  end if;
  if not exists (select 1 from vault.secrets where name = 'tgb_functions_url') then
    perform vault.create_secret('https://qmaafbncpzrdmqapkkgr.supabase.co/functions/v1',
      'tgb_functions_url', 'Base URL for Edge Function calls made from the database.');
  end if;
end $$;

create or replace function public.tgb_sweep_scheduled_socials()
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_secret text; v_url text; v_due int;
begin
  -- NOTHING IS CALLED WHEN NOTHING IS DUE. A request a minute against an empty
  -- queue is a request a minute.
  select count(*) into v_due from public.socials
   where scheduled_state = 'queued' and scheduled_for <= now();
  if v_due = 0 then return; end if;

  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'tgb_scheduler_secret';
  select decrypted_secret into v_url    from vault.decrypted_secrets where name = 'tgb_functions_url';
  if v_secret is null or v_url is null then return; end if;

  perform net.http_post(
    url     := v_url || '/socials-post',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      -- THE FUNCTION REQUIRES AN Authorization HEADER BEFORE IT LOOKS AT
      -- ANYTHING. The scheduler secret is what it actually checks; this is only
      -- there so the request reaches the check.
      'Authorization', 'Bearer scheduler',
      'x-tgb-scheduler', v_secret),
    body    := jsonb_build_object('sweep', true));
end $function$;

revoke all on function public.tgb_sweep_scheduled_socials() from anon, authenticated;

-- EVERY MINUTE. The finest granularity pg_cron offers, and the finest a person
-- picking a time in a form would expect.
select cron.unschedule('tgb-socials-sweep')
 where exists (select 1 from cron.job where jobname = 'tgb-socials-sweep');

select cron.schedule('tgb-socials-sweep', '* * * * *',
  $$select public.tgb_sweep_scheduled_socials();$$);

-- ── Verify ───────────────────────────────────────────────────────────────────
-- 1. The job is there:  select jobname, schedule, active from cron.job;
-- 2. The secret exists and is NOT in the command:
--      select name from vault.secrets;
--      select command from cron.job where jobname = 'tgb-socials-sweep';
-- 3. AN EMPTY QUEUE PROVES NOTHING. Queue a real candidate a minute out and
--    watch `scheduled_state` go queued -> sending -> (status) posted, and
--    `net._http_response` for what the function answered.
-- 4. Claim safety: call tgb_claim_due_socials() twice in a row. The second call
--    must return nothing.
