-- 2026090601_a_game_names_its_audiences_by_id.sql
-- A GAME NAMES ITS TARGET AND ITS RIVAL BY ID, BESIDE THE PROSE (2026-09-06)
--
-- APPLY:  cd mc && supabase db query --linked --file supabase/migrations/2026090601_a_game_names_its_audiences_by_id.sql
--   (or paste into the SQL editor). Written in a container with no supabase
--   CLI, so it was NOT applied when it was committed; the pending table in
--   CLAUDE.md says so. Read the Verify block's numbers rather than trusting
--   the absence of an error.
--
-- WHY. games.target and games.rival hold prose -- "Chicago Bears fans" --
-- since 2026090203, and the Game Builder's two boxes were free text over
-- them. Nothing could join a game to an audience, team-palette.js's audience
-- tier matched nothing, and a typo was stored in silence. The prose is what
-- the copy prints and 366 games carry it, so it STAYS; the id goes beside it,
-- derived from the same pick in the room, so the two cannot disagree.
--
-- ON UPDATE CASCADE because an audience key is slug(full_name) and moves on a
-- rename; ON DELETE SET NULL because a game outlives a fandom.
--
-- THE BACKFILL matches lower(target) = lower(full_name || ' fans'), measured
-- before this was written: 366 of 366 targets and 365 of 365 rivals resolve,
-- and full_name is unique across all 641 audiences. It writes only where the
-- id is still null, so re-running it changes nothing.

begin;

-- full_name must be unique or the backfill's join is a coin toss.
do $$
declare dupes int;
begin
  select count(*) into dupes from (
    select lower(full_name) from public.audiences
     group by lower(full_name) having count(*) > 1) d;
  if dupes > 0 then
    raise exception 'audiences.full_name is not unique case-insensitively (% clashes); resolve before backfilling', dupes;
  end if;
end $$;

alter table public.games
  add column if not exists target_id text
    references public.audiences (id) on update cascade on delete set null,
  add column if not exists rival_id text
    references public.audiences (id) on update cascade on delete set null;

comment on column public.games.target_id is
  'The visiting fandom the game is pitched at: audiences.id. games.target is the prose derived from it (2026090601).';
comment on column public.games.rival_id is
  'The home club they are up against: audiences.id. games.rival is the prose derived from it (2026090601).';

create index if not exists games_target_id_idx on public.games (target_id);
create index if not exists games_rival_id_idx  on public.games (rival_id);

update public.games g
   set target_id = a.id
  from public.audiences a
 where g.target_id is null
   and g.target is not null
   and lower(btrim(g.target)) = lower(a.full_name || ' fans');

update public.games g
   set rival_id = a.id
  from public.audiences a
 where g.rival_id is null
   and g.rival is not null
   and lower(btrim(g.rival)) = lower(a.full_name || ' fans');

-- Verify: expect with_target = with_target_id and with_rival = with_rival_id,
-- and 0 in both unresolved columns. On 2026-09-06 that is 366/366 and 365/365.
select count(*) filter (where target is not null)                       as with_target,
       count(*) filter (where target_id is not null)                    as with_target_id,
       count(*) filter (where target is not null and target_id is null) as target_unresolved,
       count(*) filter (where rival is not null)                        as with_rival,
       count(*) filter (where rival_id is not null)                     as with_rival_id,
       count(*) filter (where rival is not null and rival_id is null)   as rival_unresolved
  from public.games;

-- AND THE PAGE READS THEM AS anon, so this must answer 200 once applied:
--   curl -s -o /dev/null -w "%{http_code}" "$API/games?select=target_id,rival_id&limit=1" -H "apikey: $KEY" -H "Authorization: Bearer $KEY"
-- A 401 means the table's anon SELECT is a per-column grant (the soundtrack
-- table's shape) and the two columns need adding to it.

commit;
