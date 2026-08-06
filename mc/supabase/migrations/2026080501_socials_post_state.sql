-- Decisions and edits for the social post candidates.
--
-- WHY THIS TABLE EXISTS
--
-- mc/socials/socials.json is written by TGB SOCIAL BOT twice a day and is
-- append-only: every run adds five candidates to the end and touches nothing
-- above. That makes it a good feed and a bad worklist. Until now the human half
-- -- posted / skipped -- lived in localStorage on one browser, which meant the
-- decisions were invisible in the file, did not survive a cleared cache, and
-- did not exist at all on a second machine. Thirty candidates would sit in the
-- JSON looking untouched when twenty had been dealt with.
--
-- So: the JSON stays the bot's feed, and this table carries everything a HUMAN
-- decides or changes about a candidate. The admin page reads both and overlays
-- one on the other.
--
-- WHY NOT WRITE THE STATUS BACK INTO THE JSON
--
-- The admin is static HTML on GitHub Pages. It holds no credentials and has no
-- write path to the repo, so a status in the file could only be produced by
-- exporting and committing by hand, or by keeping a repo-write token in a
-- publicly-served browser page. Supabase under an admin session is the pattern
-- the gift shop and the Tape Room already use, and it is the only one of the
-- three that survives a different browser.
--
-- THE OVERRIDE MODEL
--
-- Every editable column is NULLABLE and null means "no override -- use whatever
-- socials.json says". Only fields you actually change are stored. Three things
-- follow from that, and they are the point:
--
--   * A later bot run that rewrites a field it owns does not silently discard
--     your edit, because your edit was never in the file.
--   * Clearing an override (setting it back to null) restores the bot's text
--     rather than freezing a stale copy of it.
--   * The row stays meaningful even for a candidate that is only skipped and
--     never edited -- status is the one column that is NOT an override.
--
-- post_id is the JSON post's `id`, or its url when a hand-written entry has no
-- id -- the same `post.id || post.url` key the page has always used, so the
-- localStorage decisions being migrated line up with these rows exactly.

create table if not exists public.socials_post_state (
  post_id text primary key,

  -- The decision. 'review' is the automatic state and is what a candidate has
  -- before anyone touches it; a row need not exist for that to be true, so the
  -- page treats a missing row as 'review'.
  status text not null default 'review'
    check (status in ('review', 'posted', 'skipped')),

  -- Set when status becomes 'posted', cleared when it leaves. Stamped by the
  -- trigger below, not by the client, so it cannot drift out of step.
  posted_at timestamptz,
  -- Which accounts it went out on, in the order the composers were opened.
  posted_platforms text[],

  -- ---- Overrides. Null = use the value from socials.json. -----------------
  headline text,
  url text,
  source text,
  published text,
  -- The caption. Column is `blurb` to match the JSON key, though every piece of
  -- visible copy calls it a caption.
  blurb text,
  -- Internal note, never posted.
  why text,
  topics text[],
  media text,
  image text,
  -- [{ "name": "X", "why": "link preview does the work" }, ...]
  platforms jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.socials_post_state is
  'Human decisions and edits for candidates in mc/socials/socials.json. The JSON '
  'is the bot-written feed; this is the layer over it. Null in an editable '
  'column means no override -- fall back to the JSON.';
comment on column public.socials_post_state.post_id is
  'The JSON post id, or its url when the entry has no id (post.id || post.url).';
comment on column public.socials_post_state.status is
  'review (default, also implied by no row) | posted | skipped.';
comment on column public.socials_post_state.posted_platforms is
  'Accounts the composers were opened for, in order. Set with status = posted.';

create index if not exists socials_post_state_status_idx
  on public.socials_post_state (status, updated_at desc);

-- Touch updated_at on every write.
create or replace function public.tgb_touch_socials_post_state()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists socials_post_state_touch_updated_at on public.socials_post_state;
create trigger socials_post_state_touch_updated_at
before update on public.socials_post_state
for each row execute function public.tgb_touch_socials_post_state();

-- posted_at follows status, in the database rather than in the page, so it
-- holds for psql and the Supabase table editor too. Leaving 'posted' clears the
-- stamp and the platform list together -- a candidate moved back to review has
-- not been posted, and keeping a stale timestamp would say it had.
create or replace function public.tgb_stamp_socials_posted()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    if new.status = 'posted' and new.posted_at is null then
      new.posted_at := now();
    end if;
    return new;
  end if;

  if new.status is distinct from old.status then
    if new.status = 'posted' then
      new.posted_at := coalesce(new.posted_at, now());
    else
      new.posted_at := null;
      new.posted_platforms := null;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists socials_post_state_stamp_posted on public.socials_post_state;
create trigger socials_post_state_stamp_posted
before insert or update on public.socials_post_state
for each row execute function public.tgb_stamp_socials_posted();

alter table public.socials_post_state enable row level security;

-- Not publicly readable. These are editorial decisions and internal notes about
-- what we are about to say publicly, which is nobody else's business. The bot
-- never reads or writes this table -- it only appends to the JSON -- so there is
-- no anon policy and no SECURITY DEFINER RPC here, unlike the soundtrack and
-- gift shop pulls.
drop policy if exists "Admins can read socials post state" on public.socials_post_state;
create policy "Admins can read socials post state"
  on public.socials_post_state for select to authenticated using (true);

drop policy if exists "Admins can manage socials post state" on public.socials_post_state;
create policy "Admins can manage socials post state"
  on public.socials_post_state for all to authenticated using (true) with check (true);

grant select, insert, update, delete on public.socials_post_state to authenticated;
