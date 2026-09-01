-- THE KEY BECOMES `slug(full_name)`. 2026-09-01.
--
--   nfl-chicago      ->  chicago-bears
--   ncaaf-alabama    ->  alabama-crimson-tide
--   history-jfk      ->  jfk-assassination
--
-- IT WAS `family-name` AND BOTH HALVES HAVE GONE -- `family` in 2026090107,
-- `name` in 2026090112 -- so the key was the last place either survived, as a
-- string nothing could derive or check. `full_name` is the one column that
-- names the audience, so the key is made of it.
--
-- MEASURED BEFORE IT WAS WRITTEN: 640 rows with a full_name produce **640
-- distinct keys, 0 collisions**. The 641st is dealt with below.
--
-- THE LEAGUE IS ALREADY OFF THE KEY, which is what makes this safe at all.
-- 2026090108 moved four functions and two views from `split_part(id, '-', 1)`
-- to `split_part(team_key, ':', 1)` for exactly this day: left alone, every one
-- of them would now say a Bears fan's league is **CHICAGO**. That migration was
-- kept separate so the league could be proved off the key BEFORE the key moved.
--
-- `destinations.id` DOES NOT MOVE, and that is the thing worth checking twice.
-- It is built from `home_place_id`, the team_key's league and the nickname --
-- never from `audiences.id` -- so `new-orleans-la-nfl-saints` is unchanged and
-- the seven trivia rows keyed to a destination still resolve. Verified
-- separately: **0 trivia rows are keyed to an audience id.**
--
-- WHAT DOES CHANGE IS A LADDER RUNG. `tgb_content_keys` emits the audience id
-- as its own rung, so `nfl-bears` becomes `chicago-bears`. Nothing is keyed to
-- that form today -- checked, not assumed -- and both rung forms have always
-- been emitted side by side precisely so neither is load-bearing alone.
--
-- ON UPDATE CASCADE IS HOW THE REFERENCES FOLLOW, rather than a hand-written
-- remap of three tables. A cascade cannot miss a row and cannot get the mapping
-- wrong; a remap can do both, silently, and would leave a game pointing at an
-- audience that no longer exists with nothing on screen saying so.
--
-- **EACH FK'S ON DELETE RULE IS RESTORED EXACTLY**, and they are not all the
-- same: `game_templates` CASCADES (a template for a deleted audience is not a
-- template), and both `games` columns SET NULL (a game outlives the fandom it
-- was pitched at). Getting that wrong would be invisible until somebody deleted
-- an audience.
--
-- apply by hand: supabase db query --linked --file <this file>

begin;

-- ---------------------------------------------------------------------------
-- 1. The one row with no full name.
-- ---------------------------------------------------------------------------
-- `history-jfk` is the single interest row: no full_name, no nickname, no
-- description, home New Orleans, and one game template pointing at it (Oswald's
-- New Orleans). Its key would slug to the empty string.
--
-- THE NAME IS READ OFF ITS OWN ALIASES rather than invented: the row already
-- carries `oswald`, `lee harvey oswald`, `kennedy` and `assassination`.
update public.audiences
   set full_name = 'JFK Assassination'
 where id = 'history-jfk' and (full_name is null or btrim(full_name) = '');

-- AND THE GAP CANNOT REOPEN. A row with no full_name now has no key either, so
-- the column the key is made of has to be present and has to slug to something.
-- `Bethany (Ks)` slugs to `bethany-ks`; a name of only punctuation does not,
-- and is refused.
alter table public.audiences alter column full_name set not null;
alter table public.audiences add constraint audiences_full_name_slugs
  check (regexp_replace(regexp_replace(lower(btrim(full_name)), '[^a-z0-9]+', '-', 'g'),
                        '(^-|-$)', '', 'g') <> '');

-- ---------------------------------------------------------------------------
-- 2. Let the references follow.
-- ---------------------------------------------------------------------------
alter table public.game_templates drop constraint game_templates_audience_id_fkey;
alter table public.games          drop constraint games_target_audience_fkey;
alter table public.games          drop constraint games_rival_audience_fkey;

alter table public.game_templates add constraint game_templates_audience_id_fkey
  foreign key (audience_id) references public.audiences(id)
  on update cascade on delete cascade;
alter table public.games add constraint games_target_audience_fkey
  foreign key (target_audience_id) references public.audiences(id)
  on update cascade on delete set null;
alter table public.games add constraint games_rival_audience_fkey
  foreign key (rival_audience_id) references public.audiences(id)
  on update cascade on delete set null;

-- ---------------------------------------------------------------------------
-- 3. The key.
-- ---------------------------------------------------------------------------
update public.audiences
   set id = regexp_replace(regexp_replace(lower(btrim(full_name)), '[^a-z0-9]+', '-', 'g'),
                           '(^-|-$)', '', 'g');

comment on column public.audiences.id is
  'slug(full_name). Written by hand, not generated -- the expression was dropped '
  'in 2026090106 so the key could stop moving when other columns changed. The '
  'three tables that reference it CASCADE ON UPDATE, so renaming an audience '
  'moves its key and everything pointing at it in one statement.';

-- ---------------------------------------------------------------------------
-- 4. Nothing may be left pointing at a key that is gone.
-- ---------------------------------------------------------------------------
do $$
declare n int;
begin
  select count(*) into n from public.games g
   where (g.target_audience_id is not null
          and not exists (select 1 from public.audiences a where a.id = g.target_audience_id))
      or (g.rival_audience_id is not null
          and not exists (select 1 from public.audiences a where a.id = g.rival_audience_id));
  if n > 0 then raise exception '% games point at a missing audience', n; end if;

  select count(*) into n from public.game_templates t
   where t.audience_id is not null
     and not exists (select 1 from public.audiences a where a.id = t.audience_id);
  if n > 0 then raise exception '% templates point at a missing audience', n; end if;
end $$;

commit;

-- ---------------------------------------------------------------------------
-- Verify. The counts, then CALLS THAT MAKE THE FUNCTIONS DO THEIR JOB -- an
-- update that returns without error says nothing about whether the ladder still
-- builds or the rival still resolves.
-- ---------------------------------------------------------------------------
-- select
--   (select count(*) from public.audiences) as rows,
--   (select count(distinct id) from public.audiences) as distinct_ids,
--   (select id from public.audiences where full_name = 'Chicago Bears') as bears,
--   (select count(*) from public.teams) as teams,
--   (select count(*) from public.destinations) as destinations,
--   (select count(*) from public.destinations where id = 'new-orleans-la-nfl-saints') as saints_unmoved,
--   (select count(*) from public.challenges c where c.kind = 'trivia'
--      and exists (select 1 from public.destinations d where d.id = c.ladder_key)) as trivia_resolving;
--
-- select public.tgb_anti_audience('new-orleans-la', 'chicago-bears') as rival;
-- select array_to_string(public.tgb_content_keys('new-orleans-la','chicago-bears',null), ' | ') as ladder;
-- select public.tgb_audience_label('chicago-bears') as label;
