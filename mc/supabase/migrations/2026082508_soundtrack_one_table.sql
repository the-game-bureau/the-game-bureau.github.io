-- ONE TABLE. `public.soundtrack`, one row per TRACK.
--
-- This is the end of a three-table shape that had grown a surrogate tape id, a
-- join, two views and a separate findings table. What it is really made of is
-- 1,643 tracks that each belong to a tape in a city, and that is now what it
-- looks like.
--
-- ── THE TAPE IS (city_slug, tape), NOT AN id ────────────────────────────────
--
-- Checked before relying on it: **113 tapes, 113 distinct (city_slug,
-- spine_tag) pairs, and not one blank spine tag.** So the pair identifies a tape
-- on its own and the surrogate `tape_id` earns nothing. A city may still hold
-- several tapes -- that is why the tape name is part of the key rather than the
-- city alone.
--
-- **AND NO TAPE IS LOST**, because no tape has zero songs. Checked: 0. A
-- track-per-row table would have dropped an empty tape silently, which is the
-- one thing that would have made this shape wrong.
--
-- ── WHAT THE TAPE'S OWN FIELDS DO NOW ───────────────────────────────────────
--
-- `tape`, `tape_label_position` and `last_audit_at` are the same on every row of
-- a tape. That repetition is the price of one table and it is deliberate: the
-- alternative is the join this migration exists to remove. **Write them for the
-- whole tape at once** -- `update public.soundtrack set tape = 'X' where
-- city_slug = 'y' and tape = 'Z'` -- never for one row.
--
-- Shelving a tape becomes the same statement: set `archived` on every row of the
-- tape and stamp `archived_with_tape`, which is what the cascade trigger used to
-- do. **`archived_with_tape` is still what makes restoring honest**: it only
-- un-shelves the tracks the tape took down with it, so a track shelved on its
-- own stays shelved. That row is a do-not-rescrape tombstone.
--
-- ── A FINDING ABOUT THE TAPE ────────────────────────────────────────────────
--
-- 66 of the 285 findings name no track: they are statements about the LIST
-- (short of 15, a spine phrase that does not match). With no tape row to hold
-- them, each goes on the tape's LOWEST-POSITION track carrying `"scope":
-- "tape"` inside the finding object. **The Tape Room draws a scope=tape finding
-- above the tracks, exactly where it drew them before.**
--
-- ── THE OLD TABLES ARE RETIRED IN PLACE ─────────────────────────────────────
--
-- Renamed, not dropped, the same bargain `public.maps` got. The drops sit
-- commented at the bottom. **They still hold their rows**, so anything still
-- reading them sees numbers that never move again.
--
-- APPLIED 2026-08-25.

begin;

alter table if exists public.soundtrack       rename to soundtrack_tapes_retired;
alter table if exists public.soundtrack_songs rename to soundtrack_songs_retired;

-- RENAMING A TABLE DOES NOT RENAME ITS INDEXES, and the first run of this file
-- died on exactly that: `soundtrack_findings_idx` was still attached to the
-- table now called soundtrack_tapes_retired, so creating the new one collided.
-- Every index on both retired tables is pushed out of the way by name.
do $$
declare r record;
begin
  for r in
    select c.relname as name, t.relname as tbl
      from pg_class c
      join pg_index i on i.indexrelid = c.oid
      join pg_class t on t.oid = i.indrelid
      join pg_namespace ns on ns.oid = t.relnamespace
     where ns.nspname = 'public'
       and t.relname in ('soundtrack_tapes_retired', 'soundtrack_songs_retired')
       and c.relname not like 'retired\_%'
  loop
    execute format('alter index public.%I rename to %I', r.name, 'retired_' || r.name);
  end loop;
  -- Constraints carry index names too.
  for r in
    select con.conname as name, t.relname as tbl
      from pg_constraint con
      join pg_class t on t.oid = con.conrelid
      join pg_namespace ns on ns.oid = t.relnamespace
     where ns.nspname = 'public'
       and t.relname in ('soundtrack_tapes_retired', 'soundtrack_songs_retired')
       and con.conname not like 'retired\_%'
  loop
    execute format('alter table public.%I rename constraint %I to %I',
                   r.tbl, r.name, 'retired_' || r.name);
  end loop;
end $$;

create table public.soundtrack (
  id                  bigserial primary key,
  -- WHERE THE TAPE IS. The one city list the whole site reads.
  city_slug           text not null references public.cities(slug),
  -- WHICH TAPE. With city_slug this identifies it; there is no tape id.
  tape                text not null,
  tape_label_position text,
  -- THE TRACK.
  position            integer,
  title               text not null,
  artist              text,
  blurb               text,
  spotify_id          text,
  explicit            boolean not null default false,
  -- TWO STATES AND `archived` IS BOTH OF THEM: false is LIVE, true is SHELVED.
  -- It is also the do-not-rescrape tombstone, which is why a shelved row stays.
  archived            boolean not null default true,
  -- Set when a tape shelving took this track down, so restoring the tape only
  -- brings back what it took. A track shelved on its own stays shelved.
  archived_with_tape  boolean not null default false,
  -- Retired in place, carried across so nothing reading them breaks. The state
  -- model is `archived` alone.
  certified_at        timestamptz,
  rejected_at         timestamptz,
  -- Audit findings about THIS track, or about the tape when the object carries
  -- "scope":"tape". Admin-read only: see the grants below.
  findings            jsonb not null default '[]'::jsonb,
  -- Per tape, repeated on every row of it.
  last_audit_at       timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- Everything, joined back into one row per track.
insert into public.soundtrack
  (id, city_slug, tape, tape_label_position, position, title, artist, blurb,
   spotify_id, explicit, archived, archived_with_tape, certified_at, rejected_at,
   findings, last_audit_at, created_at, updated_at)
select s.id, s.city_slug, t.spine_tag, t.spine_tag_position, s.position,
       s.title, s.artist, s.blurb, s.spotify_id, coalesce(s.explicit, false),
       coalesce(s.archived, true), coalesce(s.archived_with_tape, false),
       s.certified_at, s.rejected_at, coalesce(s.findings, '[]'::jsonb),
       t.last_audit_at, s.created_at, s.updated_at
  from public.soundtrack_songs_retired s
  join public.soundtrack_tapes_retired t on t.id = s.tape_id;

select setval(pg_get_serial_sequence('public.soundtrack', 'id'),
              coalesce((select max(id) from public.soundtrack), 1));

-- The tape's own findings, onto its lowest-position track, marked as the tape's.
update public.soundtrack s
   set findings = s.findings || f.arr
  from (
    select lowest.song_id,
           (select jsonb_agg(e || jsonb_build_object('scope', 'tape'))
              from jsonb_array_elements(t.findings) e) as arr
      from public.soundtrack_tapes_retired t
      join lateral (
        select s2.id as song_id from public.soundtrack s2
         where s2.city_slug = t.city_slug and s2.tape = t.spine_tag
         order by s2.position nulls last, s2.id limit 1
      ) lowest on true
     where jsonb_array_length(t.findings) > 0
  ) f
 where f.song_id = s.id and f.arr is not null;

-- ── Indexes ──────────────────────────────────────────────────────────────────
-- THE DO-NOT-RESCRAPE TOMBSTONE, moved from (tape_id, title, artist) to the
-- natural key. Scoped to the TAPE and not global on purpose: a song can
-- genuinely belong to two cities, and to two tapes of one city.
create unique index soundtrack_tape_track_key
  on public.soundtrack (city_slug, tape, lower(title), lower(coalesce(artist, '')));
create index soundtrack_city_idx     on public.soundtrack (city_slug);
create index soundtrack_tape_idx     on public.soundtrack (city_slug, tape, position);
create index soundtrack_live_idx     on public.soundtrack (archived) where not archived;
create index soundtrack_findings_idx on public.soundtrack using gin (findings);

-- ── updated_at ───────────────────────────────────────────────────────────────
create or replace function public.tgb_soundtrack_touch()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end;
$$;
create trigger soundtrack_touch before update on public.soundtrack
  for each row execute function public.tgb_soundtrack_touch();

-- ── RLS, and the findings column stays admin-only ───────────────────────────
alter table public.soundtrack enable row level security;

create policy "soundtrack is publicly readable" on public.soundtrack for select using (true);
create policy "authenticated can manage soundtrack" on public.soundtrack for all
  to authenticated using (true) with check (true);

-- A COLUMN-LEVEL REVOKE CANNOT OVERRIDE A TABLE-LEVEL GRANT, so the table grant
-- is revoked and re-issued column by column without `findings`. A finding is an
-- internal editorial note and this table is publicly readable, which is exactly
-- the leak the 2026-08-25 fold opened for a few minutes.
do $$
declare cols text;
begin
  select string_agg(quote_ident(column_name), ', ' order by ordinal_position) into cols
    from information_schema.columns
   where table_schema='public' and table_name='soundtrack' and column_name <> 'findings';
  execute 'revoke select on public.soundtrack from anon';
  execute 'grant select (' || cols || ') on public.soundtrack to anon';
end $$;

comment on table public.soundtrack is
  'One row per TRACK. The tape is (city_slug, tape); there is no tape table and no tape id. tape / tape_label_position / last_audit_at repeat across a tapes rows and are written for the whole tape at once. `archived` is the whole state model: false LIVE, true SHELVED, and a shelved row is also the do-not-rescrape tombstone.';

commit;

-- ── The views, rebuilt over the one table ────────────────────────────────────
begin;

drop view if exists public.soundtrack_findings;
drop view if exists public.soundtrack_issue_stats;
drop view if exists public.soundtrack_stats;

create view public.soundtrack_stats as
select city_slug, tape, tape_label_position,
       -- A TAPE IS SHELVED WHEN EVERY TRACK ON IT IS. There is no tape row to
       -- carry the flag, and this is the same thing it meant.
       bool_and(archived)                        as archived,
       count(*) filter (where not archived)      as active_songs,
       count(*) filter (where archived)          as archived_songs,
       max(created_at)                           as last_song_at,
       max(last_audit_at)                        as last_audit_at
  from public.soundtrack
 group by city_slug, tape, tape_label_position;

create view public.soundtrack_findings
with (security_invoker = true) as
select (e ->> 'id')::bigint              as id,
       s.id                              as song_id,
       s.city_slug, s.tape,
       s.title                           as song_title,
       coalesce(e ->> 'scope', 'track')  as scope,
       e ->> 'kind'                      as kind,
       e ->> 'severity'                  as severity,
       e ->> 'detail'                    as detail,
       e ->> 'suggestion'                as suggestion,
       e ->> 'status'                    as status,
       e ->> 'fingerprint'               as fingerprint,
       (e ->> 'created_at')::timestamptz as created_at
  from public.soundtrack s, jsonb_array_elements(s.findings) e;

revoke all on public.soundtrack_findings from anon, public;
grant select on public.soundtrack_findings to authenticated;

commit;

-- ── Verify ───────────────────────────────────────────────────────────────────
-- 1. Nothing lost:
--      select count(*) from public.soundtrack;                    -- 1643
--      select count(distinct (city_slug, tape)) from public.soundtrack;  -- 113
--      select count(*) from public.soundtrack_findings;           -- 285
--      select count(*) from public.soundtrack_findings where status='open';  -- 62
--      select count(*) from public.soundtrack_findings where scope='tape';   -- 66
--
-- 2. The leak stays shut, with the PUBLISHABLE key:
--      /soundtrack?select=*            -> 42501
--      /soundtrack?select=id,findings  -> 42501
--      /soundtrack?select=id,title     -> 200
--
-- ── Once the pages have run on this for a while ─────────────────────────────
--    drop table public.soundtrack_songs_retired;
--    drop table public.soundtrack_tapes_retired;
--    drop table public.soundtrack_issues;
