-- `name` GOES. THE LABEL IS DERIVED, AND ON 23 ROWS IT GETS BETTER. 2026-09-01.
--
-- `full_name` is what the club is called and `name` was what a fan says, kept
-- beside it. Two columns holding one idea, and the room drew both.
--
-- THE ONE THING `name` WAS LOAD-BEARING FOR IS `tgb_audience_label`, which
-- `tgb_build_game` calls to write a game's copy -- "Chicago Fans Takeover New
-- Orleans". So the label had to be derivable before the column could go, and it
-- was MEASURED rather than argued: the derivation below reproduces the current
-- answer on **618 of 641**.
--
-- THE 23 THAT DIFFER ARE ROWS WHERE THE DERIVATION IS RIGHT AND `name` IS
-- WRONG, which is the argument for the change rather than a cost of it:
--
--   Georgia Tech Yellow Jackets    said Atlanta      -> Georgia Tech
--   Boston College Eagles          said Boston       -> Boston College
--   UAB Blazers                    said Birmingham   -> UAB
--   TCU Horned Frogs               said Fort Worth   -> TCU
--   Miami Hurricanes               said MIA          -> Miami
--   Louisiana Ragin' Cajuns        said UL           -> Louisiana
--
-- Every one is a college club the 2026-08-30 merge named by its TOWN or its
-- CODE. **Atlanta and Boston are the sharp ones**: both collide with the pro
-- club in the same town, so "Atlanta Fans Takeover" could mean the Falcons or
-- Georgia Tech and nothing could tell them apart. This file already recorded
-- the same fault in six MLB rows and fixed those; the college ones were missed.
--
-- THE SPLIT IS BY LEAGUE, NOT BY HAVING A `team_key`, and getting that wrong is
-- how the original bug happened. A college club HAS a team_key (`NCAAF:ALA`),
-- so a `team_key is not null` branch catches it and returns the TOWN --
-- **"Tuscaloosa Fans Takeover New Orleans"**, which is the exact failure the
-- function's own comment exists to prevent. Tried, measured at 23 wrong for a
-- different reason, and rejected.
--
--   pro (nfl/nba/mlb/nhl) with a home city  ->  the city
--   everything else                         ->  full_name minus the mascot
--
-- The second branch is what makes a college club right: `Alabama Crimson Tide`
-- minus `Crimson Tide` is `Alabama`, which is a state rather than a mark and is
-- what a fan calls themselves. An artist or an interest lands there too and
-- keeps its whole name, since neither has a mascot to strip.
--
-- REWRITTEN RATHER THAN PATCHED, DELIBERATELY, and this departs from the rule
-- the last four migrations kept. That rule guards against a `create or replace`
-- silently DROPPING something -- a column off an INSERT list, a branch off a
-- body. This function is a single `case` with no column list and no state, the
-- whole logic is what changes, and both branches are written out above. There
-- is nothing for a rewrite to lose.
--
-- apply by hand: supabase db query --linked --file <this file>

begin;

create or replace function public.tgb_audience_label(p_audience text)
 returns text
 language sql
 stable
as $function$
  select case
    -- A PRO CLUB IS NAMED BY ITS CITY, because its name IS its mascot and a
    -- mascot is somebody else's mark. "Tampa Fans Takeover New Orleans", never
    -- "Buccaneers Fans". Fourteen clubs share a city with another in their own
    -- league; they still say the city, and the game's own opponent is what
    -- tells the two apart.
    when lower(split_part(a.team_key, ':', 1)) in ('nfl','nba','mlb','nhl')
         and p.city is not null
      then p.city
    -- EVERYTHING ELSE IS NAMED BY ITSELF, minus the mark. This is the branch
    -- that keeps a college fan out of a town nobody claims.
    when a.nickname is not null and a.full_name like '%' || a.nickname
      then btrim(left(a.full_name, length(a.full_name) - length(a.nickname)))
    else a.full_name
  end
    from public.audiences a
    left join public.places p on p.id = a.home_place_id
   where a.id = p_audience;
$function$;

-- ---------------------------------------------------------------------------
-- Nothing else may name it before the drop. A plpgsql body is stored as TEXT
-- and resolved at RUNTIME, so a function reading a dropped column raises
-- nothing here and waits for a caller -- which is how `infer_game_team_keys`
-- broke every game save for a day.
-- ---------------------------------------------------------------------------
do $$
declare bad text;
begin
  select string_agg(proname, ', ') into bad from pg_proc
   where pronamespace = 'public'::regnamespace and prokind = 'f'
     -- SCOPED TO FUNCTIONS THAT TOUCH THIS TABLE, and the first cut was not:
     -- `a.name` is any alias `a` on any table, so it flagged
     -- `ff_admin_list_archive_players`, which has nothing to do with audiences.
     -- The transaction rolled back and nothing was written, which is the guard
     -- working -- but a check that fails on correct code is one the next person
     -- deletes rather than reads.
     and pg_get_functiondef(oid) like '%audiences%'
     and pg_get_functiondef(oid) ~ '\ma\.name\M';
  if bad is not null then raise exception 'still naming a.name: %', bad; end if;

  select string_agg(table_name, ', ') into bad from information_schema.views
   where table_schema = 'public' and view_definition like '%audiences%'
     and view_definition ~ '\ma\.name\M';
  if bad is not null then raise exception 'a view still names a.name: %', bad; end if;
end $$;

alter table public.audiences drop constraint if exists audiences_name_not_blank;
alter table public.audiences drop column name;

commit;

-- ---------------------------------------------------------------------------
-- Verify BY CALLING IT. A `create or replace` that returns without error proves
-- nothing about a function body.
-- ---------------------------------------------------------------------------
-- select
--   public.tgb_audience_label('nfl-chicago')    as bears,        -- Chicago
--   public.tgb_audience_label('ncaaf-alabama')  as tide,         -- Alabama
--   public.tgb_audience_label('ncaaf-atlanta')  as yellowjackets,-- Georgia Tech
--   public.tgb_audience_label('ncaaf-boston')   as bc,           -- Boston College
--   public.tgb_audience_label('nfl-boston')     as patriots,     -- Boston
--   (select count(*) from information_schema.columns
--     where table_schema='public' and table_name='audiences' and column_name='name') as name_gone,
--   (select count(*) from public.teams) as teams,
--   (select count(*) from public.destinations) as destinations;
--
-- AND BY BUILDING A GAME, which is the only thing that proves the label is
-- reached at all:
-- select (public.tgb_build_game('new-orleans-la','nfl-chicago',null)->>'name');
