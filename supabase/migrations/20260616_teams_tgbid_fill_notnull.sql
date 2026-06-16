-- One-time fill of missing tgbids, then promote tgbid to a NOT NULL unique key.
-- Run AFTER 20260616_teams_tgbid_espnid.sql (which adds the column + backfills the
-- core 124). Non-core rows (NCAAF, etc.) still have NULL tgbid; this assigns each
-- the next sequential id after the current max, in a deterministic order, then
-- makes tgbid a real key.
--
-- Idempotent-ish: steps 0–1 only touch NULL rows (no-op once filled). Step 2 is
-- guarded (set-not-null / IF NOT EXISTS are no-ops when already applied).

-- 0. Restore CANONICAL tgbids for the 4 core teams the prior (league,fanbase,mascot)
--    backfill missed — their fanbase is stored as "Washington, D.C."/"LA", which
--    didn't equal teams.json's "Washington"/"Los Angeles". Match by stable
--    team_key so they keep their intended permanent ids (these ids are free).
update public.teams set tgbid = 84  where team_key = 'MLB:WSH' and tgbid is null;  -- Nationals
update public.teams set tgbid = 12  where team_key = 'NBA:LAC' and tgbid is null;  -- Clippers
update public.teams set tgbid = 36  where team_key = 'NBA:WSH' and tgbid is null;  -- Wizards
update public.teams set tgbid = 110 where team_key = 'NFL:WSH' and tgbid is null;  -- Commanders

-- 1. Assign sequential tgbids to every row still missing one. New ids start just
--    above the current max (the core teams hold 1–124), ordered by the table's
--    own sort so the assignment is stable across reruns of the SELECT.
with to_fill as (
  select
    team_key,
    (select coalesce(max(tgbid), 0) from public.teams)
      + row_number() over (order by league_sort, team_sort, team_key) as new_tgbid
  from public.teams
  where tgbid is null
)
update public.teams t
set tgbid = f.new_tgbid
from to_fill f
where t.team_key = f.team_key;

-- 2. Promote tgbid to a real unique key: NOT NULL + full unique index
--    (replacing the partial `where tgbid is not null` index from the prior migration).
alter table public.teams alter column tgbid set not null;

drop index if exists teams_tgbid_uidx;
create unique index teams_tgbid_uidx on public.teams (tgbid);

comment on column public.teams.tgbid is
  'Permanent unique The Game Bureau team id. NOT NULL + unique — every team has one; new teams take max(tgbid)+1.';
