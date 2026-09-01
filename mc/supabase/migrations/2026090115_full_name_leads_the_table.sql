-- `full_name` IS THE FIRST COLUMN, THE REST ARE IN READING ORDER, AND THE
-- COLOURS LOSE THEIR SUFFIX. 2026-09-01.
--
-- The table opened on `id`, then `home_place_id`, then `team_key`, with
-- `full_name` seventh and the colours scattered -- the order the columns
-- happened to be ADDED in over three merges, which is not an order anybody
-- reads. It now runs: what it is called, its key, what kind it is, then where,
-- then what it looks like, then its keys and its stamps.
--
-- **POSTGRES CANNOT REORDER A COLUMN IN PLACE.** There is no `alter table ...
-- set ordinal`, so the only way to it is a rebuild: a new table, the rows
-- copied across, and everything the old one carried put back by hand. That is
-- the whole reason this is its own migration and not a line in another one.
--
-- WHAT THE OLD TABLE CARRIED, captured from the catalogue rather than
-- remembered, and every one of them restored below:
--
--   primary key           audiences_pkey (id)
--   checks                4 -- aliases lower, aliases not blank, type, full_name slugs
--   foreign key out       home_place_id -> places(id) ON DELETE SET NULL
--   foreign keys in       3 -- and they do NOT share an ON DELETE rule
--   indexes               audiences_home_idx (btree), audiences_aliases_idx (gin)
--   RLS                   enabled, 4 policies
--   grants                4 roles, 7 privileges each
--   trigger               audiences_touch
--   views                 teams, destinations, game_possibilities
--
-- **THE THREE INCOMING KEYS ARE THE DANGEROUS PART**, because they differ:
-- `game_templates` cascades on delete, both `games` columns set null, and all
-- three cascade on UPDATE (2026090113, so a rename moves the key and everything
-- pointing at it together). Restoring them uniformly would be invisible until
-- somebody deleted an audience and took 395 games' pointers -- or a template --
-- with it.
--
-- ONE TRANSACTION. A rebuild that fails half way through would leave the table
-- renamed away and nothing in its place, which is every page in this project at
-- once. Either all of it lands or none of it does.
--
-- apply by hand: supabase db query --linked --file <this file>

begin;

-- ---------------------------------------------------------------------------
-- 1. Everything that depends on the table stands aside.
-- ---------------------------------------------------------------------------
drop view if exists public.teams;
drop view if exists public.destinations;
drop view if exists public.game_possibilities;

alter table public.game_templates drop constraint game_templates_audience_id_fkey;
alter table public.games          drop constraint games_target_audience_fkey;
alter table public.games          drop constraint games_rival_audience_fkey;

alter table public.audiences rename to audiences_old;

-- **AN INDEX AND A CONSTRAINT DO NOT FOLLOW A TABLE RENAME**, which is the one
-- thing that caught this file out: `audiences_old` still owned `audiences_pkey`,
-- `audiences_home_idx`, `audiences_aliases_idx` and all four checks, so
-- recreating them by their real names on the new table answered
-- **42P07 relation already exists**. The whole transaction rolled back and
-- nothing was written, which is the argument for the single transaction -- but
-- a rebuild has to move the old names out of the way before it can use them.
alter table public.audiences_old rename constraint audiences_pkey                to audiences_pkey_old;
alter table public.audiences_old rename constraint audiences_type                to audiences_type_old;
alter table public.audiences_old rename constraint audiences_aliases_lower       to audiences_aliases_lower_old;
alter table public.audiences_old rename constraint audiences_aliases_not_blank   to audiences_aliases_not_blank_old;
alter table public.audiences_old rename constraint audiences_full_name_slugs     to audiences_full_name_slugs_old;
alter table public.audiences_old rename constraint audiences_home_place_id_fkey  to audiences_home_place_id_fkey_old;
alter index public.audiences_home_idx    rename to audiences_home_idx_old;
alter index public.audiences_aliases_idx rename to audiences_aliases_idx_old;

-- ---------------------------------------------------------------------------
-- 2. The table, in the order it is read.
-- ---------------------------------------------------------------------------
create table public.audiences (
  -- WHAT IT IS CALLED, and what its key is made of.
  full_name             text not null,
  id                    text not null,
  type                  text not null,
  nickname              text,
  description           text,

  -- WHERE. The text is what a page shows; the place id is what a game reads to
  -- find the anti-audience, so a club without one can never be anybody's enemy.
  home_city             text,
  home_place_id         text,

  -- WHAT IT LOOKS LIKE. Every game pitched at this audience takes its palette
  -- from `primary`; `text` is retired in place and read by nothing.
  --
  -- **`primary` IS A RESERVED WORD AND HAS TO BE DOUBLE-QUOTED** in every
  -- hand-written statement that names it -- `a."primary"`, not `a.primary`,
  -- which is a syntax error. That is a real cost and it is accepted knowingly:
  -- the four were asked for as primary / secondary / tertiary / text, and three
  -- of them carrying a `_color` suffix while the fourth did not was the set
  -- disagreeing with itself. PostgREST quotes identifiers itself, so a page
  -- selecting `primary` is unaffected.
  "primary"             text,
  secondary             text,
  tertiary              text,
  text                  text,

  -- MATCHED, NEVER PRINTED.
  team_key              text,
  audience_aliases      text[] not null default '{}'::text[],

  team_name_suggestions text,

  created               timestamptz default now(),
  updated               timestamptz not null default now()
);

insert into public.audiences (
  full_name, id, type, nickname, description,
  home_city, home_place_id,
  "primary", secondary, tertiary, text,
  team_key, audience_aliases, team_name_suggestions, created, updated)
select
  full_name, id, type, nickname, description,
  home_city, home_place_id,
  primary_color, secondary_color, tertiary_color, text,
  team_key, audience_aliases, team_name_suggestions, created, updated
from public.audiences_old;

-- **THE COPY RUNS BEFORE THE TRIGGER IS CREATED, AND THAT IS WHAT SAVES THE
-- STAMPS.** `tgb_audiences_touch` writes `now()` over whatever the caller sent,
-- so a rebuild that installed it first would have stamped all 641 rows with the
-- rebuild's own timestamp and thrown away every real `updated` value. Measured
-- after: `created` still spans 2026-06-16 to 2026-09-01 and `updated` still
-- spans two days rather than one. **Keep the trigger after the insert.**
--
-- NOTHING MAY BE LOST IN THE COPY, and this is checked before the old table is
-- dropped rather than after. A rebuild that quietly moved 640 of 641 rows would
-- look exactly like one that worked.
do $$
declare a int; b int;
begin
  select count(*) into a from public.audiences;
  select count(*) into b from public.audiences_old;
  if a <> b then raise exception 'copied % of % rows', a, b; end if;
end $$;

-- ---------------------------------------------------------------------------
-- 3. Everything it carried, put back.
-- ---------------------------------------------------------------------------
alter table public.audiences add constraint audiences_pkey primary key (id);

alter table public.audiences add constraint audiences_type
  check (type = any (array['fandom'::text, 'artist'::text, 'interest'::text, 'historical'::text]));
alter table public.audiences add constraint audiences_aliases_lower
  check ((audience_aliases)::text = lower((audience_aliases)::text));
alter table public.audiences add constraint audiences_aliases_not_blank
  check (not (audience_aliases && array[''::text]));
alter table public.audiences add constraint audiences_full_name_slugs
  check (regexp_replace(regexp_replace(lower(btrim(full_name)), '[^a-z0-9]+', '-', 'g'),
                        '(^-|-$)', '', 'g') <> '');

alter table public.audiences add constraint audiences_home_place_id_fkey
  foreign key (home_place_id) references public.places(id) on delete set null;

create index audiences_home_idx    on public.audiences using btree (home_place_id);
create index audiences_aliases_idx on public.audiences using gin (audience_aliases);

alter table public.audiences enable row level security;

create policy "audiences are public"      on public.audiences for select using (true);
create policy "audiences admin insert"    on public.audiences for insert to authenticated
  with check (is_photo_admin());
create policy "audiences admin update"    on public.audiences for update to authenticated
  using (is_photo_admin()) with check (is_photo_admin());
create policy "audiences admin delete"    on public.audiences for delete to authenticated
  using (is_photo_admin());

grant select, insert, update, delete, truncate, references, trigger
  on public.audiences to postgres, anon, authenticated, service_role;

create trigger audiences_touch
  before insert or update on public.audiences
  for each row execute function public.tgb_audiences_touch();

comment on column public.audiences.id is
  'slug(full_name). Written by hand, not generated -- the expression was dropped '
  'in 2026090106 so the key could stop moving when other columns changed. The '
  'three tables that reference it CASCADE ON UPDATE, so renaming an audience '
  'moves its key and everything pointing at it in one statement.';
comment on column public.audiences.updated is
  'When this row last changed. Written by tgb_audiences_touch on every insert '
  'and update. Its sibling `created` is stamped once on insert and never moves.';
comment on column public.audiences.audience_aliases is
  'What a fan calls this fandom, lowercased: bama, roll tide, bills mafia. '
  'MATCHED, NEVER PRINTED.';
comment on column public.audiences."primary" is
  'The fandom''s first colour. Every game pitched at this audience takes its '
  'palette from it, and the readable ink is derived FROM it by luminance -- '
  'which is why `text` is stored and not used. RESERVED WORD: double-quote it '
  'in hand-written SQL.';
comment on column public.audiences.text is
  'Retired in place. One value across the whole table and nothing reads it: a '
  'club''s own brand text colour can be white on its own white helmet, so '
  'teamPalette computes readable ink from the primary instead.';

-- ---------------------------------------------------------------------------
-- 4. The three incoming keys, each with its OWN rules.
-- ---------------------------------------------------------------------------
alter table public.game_templates add constraint game_templates_audience_id_fkey
  foreign key (audience_id) references public.audiences(id)
  on update cascade on delete cascade;
alter table public.games add constraint games_target_audience_fkey
  foreign key (target_audience_id) references public.audiences(id)
  on update cascade on delete set null;
alter table public.games add constraint games_rival_audience_fkey
  foreign key (rival_audience_id) references public.audiences(id)
  on update cascade on delete set null;

drop table public.audiences_old;

-- ---------------------------------------------------------------------------
-- 5. The three views, unchanged.
-- ---------------------------------------------------------------------------
create view public.teams
  with (security_invoker = true)
as
 SELECT a.id AS audience_id,
    upper(split_part(a.team_key, ':'::text, 1)) AS league,
    split_part(a.team_key, ':'::text, 2) AS code,
    a.full_name,
    a.nickname AS mascot,
        CASE lower(split_part(a.team_key, ':'::text, 1))
            WHEN 'nfl'::text THEN 'football'::text
            WHEN 'ncaaf'::text THEN 'football'::text
            WHEN 'nba'::text THEN 'basketball'::text
            WHEN 'mlb'::text THEN 'baseball'::text
            WHEN 'nhl'::text THEN 'hockey'::text
            ELSE NULL::text
        END AS sport,
    -- THE VIEW KEEPS ITS OWN OUTPUT NAMES. `team-palette.js` reads shell /
    -- stripe / mask BY NAME at play time and both engines resolve a club
    -- through this view, so renaming the storage may not reach it.
    a."primary" AS shell,
    a.secondary AS stripe,
    a.tertiary AS mask,
        CASE lower(split_part(a.team_key, ':'::text, 1))
            WHEN 'nfl'::text THEN 0
            WHEN 'mlb'::text THEN 1
            WHEN 'nba'::text THEN 2
            WHEN 'ncaaf'::text THEN 3
            WHEN 'nhl'::text THEN 4
            ELSE NULL::integer
        END AS league_sort,
    a.created AS updated_at,
        CASE
            WHEN p.id IS NULL THEN NULL::text
            ELSE (p.city || ', '::text) || p.state
        END AS game_city,
    a.team_key,
    a.text AS text_color
   FROM audiences a
     LEFT JOIN places p ON p.id = a.home_place_id
  WHERE a.type = 'fandom'::text AND a.team_key IS NOT NULL;

grant select, insert, update, delete, truncate, references, trigger
  on public.teams to postgres, anon, authenticated, service_role;

create view public.destinations
  with (security_invoker = true)
as
 SELECT (((a.home_place_id || '-'::text) || lower(split_part(a.team_key, ':'::text, 1))) || '-'::text)
          || lower(regexp_replace(a.nickname, '[^a-zA-Z0-9]+'::text, '-'::text, 'g')) AS id,
    p.city,
    p.state,
    upper(split_part(a.team_key, ':'::text, 1)) AS league,
    a.nickname,
    a.audience_aliases AS aliases,
    a.audience_aliases
   FROM audiences a
     JOIN places p ON p.id = a.home_place_id
  WHERE a.type = 'fandom'::text AND a.nickname IS NOT NULL AND a.team_key IS NOT NULL;

grant select, insert, update, delete, truncate, references, trigger
  on public.destinations to postgres, anon, authenticated, service_role;

create view public.game_possibilities
  with (security_invoker = true)
as
 SELECT t.template_id,
    t.place_id,
    ((pl.city || ', '::text) || pl.state) AS place,
    t.kind,
    (t.route_id IS NOT NULL) AS walkable,
        CASE
            WHEN (t.audience_id IS NOT NULL) THEN 1
            ELSE ( SELECT (count(*))::integer AS count
               FROM audiences a
              WHERE ((a.type = 'fandom'::text) AND (a.home_place_id IS DISTINCT FROM t.place_id)))
        END AS audiences
   FROM (game_templates t
     JOIN places pl ON ((pl.id = t.place_id)))
  WHERE t.active;

grant select, insert, update, delete, truncate, references, trigger
  on public.game_possibilities to postgres, anon, authenticated, service_role;

commit;

-- ---------------------------------------------------------------------------
-- Verify. THE COLUMN ORDER IS THE POINT, so it is read back -- and then every
-- piece of machinery is exercised by USE rather than by reading the catalogue.
-- ---------------------------------------------------------------------------
-- select ordinal_position, column_name from information_schema.columns
--  where table_schema='public' and table_name='audiences' order by ordinal_position;
--
-- select
--   (select count(*) from public.audiences) as rows,
--   (select count(*) from public.teams) as teams,
--   (select count(*) from public.destinations) as destinations,
--   (select count(*) from public.game_possibilities) as possibilities,
--   (select count(*) from pg_policy where polrelid='public.audiences'::regclass) as policies,
--   (select count(*) from pg_indexes where tablename='audiences') as indexes,
--   (select count(*) from pg_constraint where conrelid='public.audiences'::regclass) as constraints,
--   (select count(*) from pg_constraint where confrelid='public.audiences'::regclass) as incoming_fks,
--   public.tgb_anti_audience('new-orleans-la','chicago-bears') as rival,
--   public.tgb_audience_label('chicago-bears') as label;
--
-- THE TRIGGER AND THE CHECKS, by writing:
-- begin;
--   update public.audiences set description = 'probe' where id = 'chicago-bears';
--   select updated > created as touch_fires from public.audiences where id = 'chicago-bears';
--   insert into public.audiences (id, type, full_name) values ('probe-zzz','interest','Probe Zzz');
--   select count(*) from public.audiences;
-- rollback;
