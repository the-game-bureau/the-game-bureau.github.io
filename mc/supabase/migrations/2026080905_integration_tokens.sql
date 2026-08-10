-- integration_tokens — credentials that EXPIRE and therefore cannot live as
-- Supabase secrets alone.
--
-- Every other credential on this project is a secret and stays one: Stripe's
-- key, Resend's key, the Meta Page token. None of them expire, so setting them
-- once is setting them forever, and a secret is the safer home because nothing
-- can read it back out.
--
-- A Threads token is different. It is long-lived, not permanent: 60 days, then
-- posting stops with no warning and no error until someone presses Post. It is
-- refreshed by exchanging the current token for a new one, which means the new
-- value has to be WRITTEN somewhere the function can read next time — and an
-- Edge Function cannot write its own secrets. That is the entire reason this
-- table exists. It is a store for the rotating half of a credential, not a
-- general place to keep secrets.
--
-- THE SECRET IS STILL THE SOURCE OF TRUTH FOR BOOTSTRAPPING. socials-post seeds
-- this row from THREADS_ACCESS_TOKEN the first time it runs and only reads the
-- table afterwards, so re-running `supabase secrets set` does not take effect
-- while a row exists. To force a hand-issued token to win, delete the row:
--
--   delete from public.integration_tokens where key = 'threads';
--
-- NO POLICIES, DELIBERATELY. RLS is enabled and nothing is granted, so `anon`
-- and `authenticated` can neither read nor write this table — including the
-- admin session that every other table here trusts. The service role bypasses
-- RLS, and the Edge Function is the only holder of it. An access token in a
-- table readable by a logged-in browser would be no better than one in the
-- page, which is the arrangement all of this exists to avoid.

create table if not exists public.integration_tokens (
  key          text primary key,
  token        text        not null,
  -- Null means "not known yet" — never "does not expire". A token seeded from a
  -- secret has no stated expiry, so the function estimates one rather than
  -- treating it as permanent; guessing permanent is how a refresh never fires.
  expires_at   timestamptz,
  refreshed_at timestamptz not null default now(),
  created_at   timestamptz not null default now()
);

comment on table public.integration_tokens is
  'Rotating API credentials that must be written back after refresh. Service role only — RLS is on with no policies. Currently: threads.';
comment on column public.integration_tokens.expires_at is
  'When the stored token dies. Null = unknown, not never.';

alter table public.integration_tokens enable row level security;

revoke all on public.integration_tokens from anon, authenticated;
