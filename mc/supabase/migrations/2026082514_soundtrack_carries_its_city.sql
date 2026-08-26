-- SOUNDTRACK CARRIES ITS OWN CITY. The tie to `public.cities` is cut.
--
-- ── WHAT WAS TIED, AND WHAT REPLACES IT ─────────────────────────────────────
--
-- Three ties, and all three go:
--
--   1. `soundtrack.city_slug references cities(slug)` -- the foreign key.
--   2. `tgb_pull_soundtrack_songs` refusing a city that is unknown or carries
--      `hide_from_soundtracks`.
--   3. Both pages reading `public.cities` for the display name, the state and
--      the country.
--
-- The row carries all of it now: `city` is the canonical composite string the
-- rest of the site speaks (`Baton Rouge, Louisiana`), plus the four structured
-- parts. **Nothing on either page looks different**, because the values are
-- backfilled from the catalogue that was supplying them.
--
-- ── WHAT IS GIVEN UP, PLAINLY ───────────────────────────────────────────────
--
-- **`hide_from_soundtracks` no longer stops anything.** It was the database
-- refusing a tape for Foxborough or Orchard Park, and it is now a rule in
-- mc/soundtracks/soundtracks.md and nothing more. **A routine that ignores its
-- brief can file a venue-town tape and the database will take it.** That is the
-- cost of the cut and it is accepted rather than overlooked; the flag still
-- exists on `cities` and still governs the gift shop and the games rails.
--
-- **A city can now be spelled two ways across two tapes** with nothing to
-- reconcile them, exactly as `teams` and `cities` already disagree about
-- "Buffalo, NY" against "Buffalo, New York". The pull RPC normalises what it is
-- given as far as it can, which is trimming; it cannot know the canonical form
-- without the catalogue it no longer reads.
--
-- ── WHY city_slug STAYS ─────────────────────────────────────────────────────
--
-- It is the tape's other half: the tape is `(city_slug, tape)`, it is the key
-- in the unique index, and `/soundtracks/#denver` is a slug. It simply stops
-- being a foreign key and becomes ordinary text.
--
-- APPLIED 2026-08-25.

begin;

alter table public.soundtrack
  add column if not exists city         text,
  add column if not exists state_code   text,
  add column if not exists state_name   text,
  add column if not exists country_code text,
  add column if not exists country_name text;

-- Backfilled from the catalogue that was supplying these values a moment ago,
-- so no page changes what it draws.
update public.soundtrack s
   set city         = coalesce(s.city, c.city),
       state_code   = coalesce(s.state_code, c.state_code),
       state_name   = coalesce(s.state_name, c.state_name),
       country_code = coalesce(s.country_code, c.country_code),
       country_name = coalesce(s.country_name, c.country_name)
  from public.cities c
 where c.slug = s.city_slug;

-- A row whose slug was not in the catalogue keeps a readable name rather than
-- an empty cell: the slug, hyphens out, words capitalised. Not clever, and it
-- only has to beat a blank.
update public.soundtrack
   set city = initcap(replace(city_slug, '-', ' '))
 where coalesce(btrim(city), '') = '';

alter table public.soundtrack alter column city set not null;

-- ── The foreign key ─────────────────────────────────────────────────────────
-- Dropped by NAME lookup rather than a guessed constraint name: this table was
-- created by the flatten, so its FK is whatever Postgres called it.
do $$
declare r record;
begin
  for r in
    select con.conname
      from pg_constraint con
      join pg_class t on t.oid = con.conrelid
      join pg_namespace n on n.oid = t.relnamespace
     where n.nspname = 'public' and t.relname = 'soundtrack' and con.contype = 'f'
  loop
    execute format('alter table public.soundtrack drop constraint %I', r.conname);
  end loop;
end $$;

-- ── The new columns must be readable by `anon` ──────────────────────────────
-- The table's SELECT grant is per-column, so `findings` stays out. A column
-- added after that grant is NOT covered by it, which is exactly the trap that
-- makes `select=*` answer 42501: the public page names its columns, so a column
-- it names and cannot read would 401 the whole page.
do $$
declare cols text;
begin
  select string_agg(quote_ident(column_name), ', ' order by ordinal_position) into cols
    from information_schema.columns
   where table_schema='public' and table_name='soundtrack' and column_name <> 'findings';
  execute 'revoke select on public.soundtrack from anon';
  execute 'grant select (' || cols || ') on public.soundtrack to anon';
end $$;

comment on column public.soundtrack.city is
  'The canonical composite label, "Baton Rouge, Louisiana". Carried on the row rather than joined from public.cities: soundtrack has no tie to that table. city_slug is still the tape key and is now ordinary text.';

commit;

-- ── The pull RPC stops asking the catalogue ─────────────────────────────────
create or replace function public.tgb_pull_soundtrack_songs(payload jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_tapes jsonb; v_tape jsonb; v_song jsonb;
  v_slug text; v_city text; v_name text; v_pos text;
  v_state_code text; v_state_name text; v_country_code text; v_country_name text;
  v_added int := 0; v_skipped int := 0; v_songs int := 0;
begin
  if jsonb_typeof(payload) = 'array' then v_tapes := payload;
  elsif jsonb_typeof(payload) = 'object' then v_tapes := coalesce(payload->'tapes', payload->'payload');
  end if;
  if v_tapes is null or jsonb_typeof(v_tapes) <> 'array' then
    return jsonb_build_object('error', 'Expected a JSON array of tape objects.');
  end if;
  if jsonb_array_length(v_tapes) > 4 then
    return jsonb_build_object('error', 'At most 4 tapes a call.');
  end if;

  for v_tape in select * from jsonb_array_elements(v_tapes) loop
    v_slug := nullif(btrim(coalesce(v_tape->>'city_slug', '')), '');
    v_city := nullif(btrim(coalesce(v_tape->>'city', '')), '');
    v_name := nullif(btrim(coalesce(v_tape->>'tape', v_tape->>'spine_tag', '')), '');
    v_pos  := nullif(btrim(coalesce(v_tape->>'tape_label_position', '')), '');
    v_state_code   := nullif(btrim(coalesce(v_tape->>'state_code', '')), '');
    v_state_name   := nullif(btrim(coalesce(v_tape->>'state_name', '')), '');
    v_country_code := nullif(btrim(coalesce(v_tape->>'country_code', '')), '');
    v_country_name := nullif(btrim(coalesce(v_tape->>'country_name', '')), '');
    if v_slug is null then v_skipped := v_skipped + 1; continue; end if;

    -- NO CATALOGUE CHECK ANY MORE. `public.cities` is not consulted and
    -- `hide_from_soundtracks` does not stop anything here; that rule lives in
    -- mc/soundtracks/soundtracks.md. What is still enforced is that a tape has
    -- a slug and a readable label, because a row without one cannot be drawn.
    --
    -- IF THE CITY ALREADY HOLDS TRACKS, ITS LABEL WINS. A run that sends a
    -- different spelling must not rewrite what is already filed, and it must
    -- not leave one city carrying two labels.
    select s.city, s.state_code, s.state_name, s.country_code, s.country_name
      into v_city, v_state_code, v_state_name, v_country_code, v_country_name
      from public.soundtrack s where s.city_slug = v_slug limit 1;
    if v_city is null then
      v_city := coalesce(nullif(btrim(coalesce(v_tape->>'city', '')), ''),
                         initcap(replace(v_slug, '-', ' ')));
      v_state_code   := nullif(btrim(coalesce(v_tape->>'state_code', '')), '');
      v_state_name   := nullif(btrim(coalesce(v_tape->>'state_name', '')), '');
      v_country_code := nullif(btrim(coalesce(v_tape->>'country_code', '')), '');
      v_country_name := nullif(btrim(coalesce(v_tape->>'country_name', '')), '');
    end if;

    -- AN ABSENT TAPE NAME MEANS THIS CITY'S EXISTING TAPE, not a new one.
    if v_name is null then
      select tape into v_name from public.soundtrack where city_slug = v_slug order by id limit 1;
      if v_name is null then v_skipped := v_skipped + 1; continue; end if;
    end if;

    for v_song in select * from jsonb_array_elements(coalesce(v_tape->'songs', '[]'::jsonb)) loop
      exit when v_songs >= 60;
      v_songs := v_songs + 1;
      if nullif(btrim(coalesce(v_song->>'title', '')), '') is null then
        v_skipped := v_skipped + 1; continue;
      end if;
      insert into public.soundtrack
        (city_slug, city, state_code, state_name, country_code, country_name,
         tape, tape_label_position, position, title, artist, blurb,
         spotify_id, explicit, archived)
      values (v_slug, v_city, v_state_code, v_state_name, v_country_code, v_country_name,
              v_name, v_pos,
              nullif(btrim(coalesce(v_song->>'position', '')), '')::int,
              btrim(v_song->>'title'),
              nullif(btrim(coalesce(v_song->>'artist', '')), ''),
              nullif(btrim(coalesce(v_song->>'blurb', '')), ''),
              -- A MALFORMED SPOTIFY ID IS DROPPED, NEVER GUESSED.
              case when coalesce(v_song->>'spotify_id', '') ~ '^[A-Za-z0-9]{22}$'
                   then v_song->>'spotify_id' else null end,
              coalesce((v_song->>'explicit')::boolean, false),
              -- ALWAYS SHELVED. This constant is the security.
              true)
      on conflict do nothing;
      if found then v_added := v_added + 1; else v_skipped := v_skipped + 1; end if;
    end loop;
  end loop;

  return jsonb_build_object('added', v_added, 'skipped', v_skipped);
end $$;

grant execute on function public.tgb_pull_soundtrack_songs(jsonb) to anon, authenticated;

-- ── The stats view carries the label too ────────────────────────────────────
-- Both pages read the tracks directly, but the footer counts through this view
-- and the hub may yet want a name without a second read.
drop view if exists public.soundtrack_stats;
create view public.soundtrack_stats as
select city_slug,
       min(city)                                 as city,
       tape, tape_label_position,
       bool_and(archived)                        as archived,
       count(*) filter (where not archived)      as active_songs,
       count(*) filter (where archived)          as archived_songs,
       max(created_at)                           as last_song_at,
       max(last_audit_at)                        as last_audit_at
  from public.soundtrack
 group by city_slug, tape, tape_label_position;

-- ── Verify ───────────────────────────────────────────────────────────────────
-- 1. No foreign key left:
--      select count(*) from pg_constraint con join pg_class t on t.oid=con.conrelid
--       where t.relname='soundtrack' and con.contype='f';        -- 0
-- 2. Every row has a label, and every city has exactly one:
--      select count(*) from public.soundtrack where coalesce(btrim(city),'')='';   -- 0
--      select count(*) from (select city_slug from public.soundtrack
--                             group by city_slug having count(distinct city) > 1) x; -- 0
-- 3. anon can still read what the public page names, and still not findings:
--      /soundtrack?select=id,city,state_code  -> 200
--      /soundtrack?select=*                   -> 42501
