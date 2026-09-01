-- ONE WORD IS ONE TAG. 2026-09-01.
--
-- `public.tags` ALREADY EXISTED -- id, name, created_at, unique on name, 91 rows.
-- What it did not have was any rule that a tag is a WORD rather than a spelling,
-- so the same word arrived three times:
--
--     sports        sports | Sports | SPORTS      382 uses, 1 catalogue row
--     football      football | Football           287 uses, 2 catalogue rows
--     new orleans   New Orleans | NEW ORLEANS      63 uses, 1 catalogue row
--     atlanta       atlanta | Atlanta              31 uses, 1 catalogue row
--
-- AND THE CATALOGUE DID NOT COVER WHAT WAS ON THE GAMES. Five names in use had
-- no row at all -- Atlanta (30 games), Featured (8), SPORTS (8), sports (2),
-- NEW ORLEANS (1) -- so the picker could not offer them and they were invisible
-- to anything reading the catalogue rather than the games.
--
-- THE CASE-FOLD IS SAFE, AND THAT WAS CHECKED RATHER THAN ASSUMED. `games.tags`
-- is read by exactly one thing in this repo, `team-palette.js`, and it
-- UPPERCASES every tag before matching -- so no spelling it has ever seen can
-- stop matching. Neither engine reads the column, and neither does `/games/`.
--
-- THE CANONICAL SPELLING IS THE MOST-USED ONE, DERIVED RATHER THAN TYPED. A
-- hand-written list of four would be a fifth copy of a fact the games already
-- carry, and would be wrong the first time a fifth cluster appeared.
--
-- apply by hand: supabase db query --linked --file <this file>

begin;

-- ---------------------------------------------------------------------------
-- 1. What every tag on every game is, and which spelling wins.
-- ---------------------------------------------------------------------------
create temporary table tag_use on commit drop as
select t as name, count(*)::int as uses
  from public.games g,
       lateral jsonb_array_elements_text(
         case when jsonb_typeof(g.tags) = 'array' then g.tags else '[]'::jsonb end) t
 group by 1;

-- THE WINNER IS THE MOST-USED SPELLING, then the one already in the catalogue,
-- then alphabetically -- so the answer is stable and does not depend on the
-- order rows happen to come back in.
create temporary table tag_canon on commit drop as
select lower(name) as lower_name,
       (array_agg(name order by uses desc,
                  (exists (select 1 from public.tags c where c.name = u.name)) desc,
                  name))[1] as canon
  from tag_use u
 group by 1;

-- A CATALOGUE ROW WHOSE WORD IS USED BY NOTHING still needs a canonical
-- spelling, or collapsing the catalogue below would drop it.
insert into tag_canon (lower_name, canon)
select lower(t.name), min(t.name)
  from public.tags t
 where not exists (select 1 from tag_canon c where c.lower_name = lower(t.name))
 group by 1;

-- ---------------------------------------------------------------------------
-- 2. The games take the canonical spelling.
-- ---------------------------------------------------------------------------
-- DEDUPED WITHIN THE ROW. A game tagged both `Sports` and `SPORTS` is tagged
-- Sports once, not twice -- and one of those really is on file.
-- ORDER IS PRESERVED via `with ordinality`: a tag list is authored, and
-- `primary_tag` is a separate column, so nothing here may reshuffle it.
with folded as (
  select g.id,
         (select jsonb_agg(x.name order by x.ord)
            from (select distinct on (c.canon) c.canon as name, min(e.ord) as ord
                    from jsonb_array_elements_text(g.tags) with ordinality as e(name, ord)
                    join tag_canon c on c.lower_name = lower(e.name)
                   group by c.canon
                   order by c.canon, ord) x) as tags
    from public.games g
   where jsonb_typeof(g.tags) = 'array' and jsonb_array_length(g.tags) > 0
)
update public.games g
   set tags = coalesce(f.tags, '[]'::jsonb)
  from folded f
 where f.id = g.id
   and g.tags is distinct from coalesce(f.tags, '[]'::jsonb);

update public.games g
   set primary_tag = c.canon
  from tag_canon c
 where c.lower_name = lower(g.primary_tag)
   and g.primary_tag is distinct from c.canon;

-- ---------------------------------------------------------------------------
-- 3. The catalogue collapses to one row per word, and covers what is in use.
-- ---------------------------------------------------------------------------
delete from public.tags t
 where exists (select 1 from tag_canon c
                where c.lower_name = lower(t.name) and c.canon <> t.name);

insert into public.tags (name)
select c.canon from tag_canon c
 where not exists (select 1 from public.tags t where t.name = c.canon);

-- ---------------------------------------------------------------------------
-- 4. It cannot happen again.
-- ---------------------------------------------------------------------------
-- A CASE-INSENSITIVE UNIQUE INDEX IS THE RULE THAT WAS MISSING. `tags_name_key`
-- is unique on the exact string, which is what let three Sports in.
create unique index if not exists tags_name_lower_key on public.tags (lower(name));

-- A BLANK IS NOT A TAG, and a leading space makes a second one that looks
-- identical in a list.
alter table public.tags drop constraint if exists tags_name_not_blank;
alter table public.tags
  add constraint tags_name_not_blank
  check (name = btrim(name) and length(name) > 0);

commit;

-- ---------------------------------------------------------------------------
-- Verify. Read the numbers; do not trust the absence of an error.
-- ---------------------------------------------------------------------------
-- Expect: variants 0, orphans 0, and every game tag resolving to a catalogue row.
--
-- select
--   (select count(*) from public.tags) as catalogue,
--   (select count(*) from (select lower(name) l from public.tags group by 1 having count(*) > 1) x) as variants,
--   (select count(distinct t) from public.games g,
--      lateral jsonb_array_elements_text(case when jsonb_typeof(g.tags)='array' then g.tags else '[]'::jsonb end) t
--     where not exists (select 1 from public.tags c where c.name = t)) as orphans,
--   (select count(*) from public.games where coalesce(primary_tag,'') <> ''
--      and not exists (select 1 from public.tags c where c.name = primary_tag)) as bad_primary;
